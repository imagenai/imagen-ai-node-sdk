import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import pLimit from "p-limit";
import { AuthenticationError, ImagenError, UploadError } from "./errors";
import { ProjectError } from "./errors";
import {
  ProjectCreationResponseSchema,
  ProfileApiDataSchema,
  PresignedUrlResponseSchema,
  type Profile,
  type UploadSummary,
  type UploadResult,
} from "./models";
import { isValidImageFile } from "./utils";

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface ClientOptions {
  baseUrl?: string;
  logger?: Logger;
  timeout?: number;
}

export type ProgressCallback = (current: number, total: number, file: string) => void;

export interface UploadOptions {
  maxConcurrent?: number;
  calculateMd5?: boolean;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

const DEFAULT_BASE_URL = "https://api-beta.imagen-ai.com/v1";
const DEFAULT_TIMEOUT_MS = 300_000;

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class ImagenClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  protected readonly logger: Logger;

  constructor(apiKey: string, options: ClientOptions = {}) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error("API key cannot be empty");
    }
    this.apiKey = apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.logger = options.logger ?? noopLogger;
    this.logger.debug(`ImagenClient initialised — baseUrl: ${this.baseUrl}`);
  }

  async close(): Promise<void> {
    this.logger.debug("ImagenClient closed");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  async createProject(name?: string): Promise<string> {
    const body: Record<string, string> = {};
    if (name) body["name"] = name;

    this.logger.info(`Creating project: ${name ?? "unnamed"}`);
    const json = await this._makeRequest("POST", "/projects/", { json: body });

    const parsed = ProjectCreationResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProjectError(
        `Could not parse project creation response: ${parsed.error.message}`
      );
    }
    const uuid = parsed.data.data.projectUuid;
    this.logger.info(`Project created: ${uuid}`);
    return uuid;
  }

  async getProfiles(): Promise<Profile[]> {
    this.logger.debug("Fetching profiles");
    const json = await this._makeRequest("GET", "/profiles");

    const parsed = ProfileApiDataSchema.safeParse(json);
    if (!parsed.success) {
      throw new ImagenError(`Failed to parse profiles: ${parsed.error.message}`);
    }
    const profiles = parsed.data.data.profiles;
    this.logger.info(`Retrieved ${profiles.length} profiles`);
    return profiles;
  }

  async uploadImages(
    projectUuid: string,
    imagePaths: string[],
    options: UploadOptions = {}
  ): Promise<UploadSummary> {
    const { maxConcurrent = 5, calculateMd5 = false, signal, onProgress } = options;
    if (maxConcurrent < 1) throw new Error("maxConcurrent must be at least 1");

    const validPaths = imagePaths.filter((p) => {
      try {
        const stat = fs.statSync(p);
        return stat.isFile() && isValidImageFile(p);
      } catch {
        this.logger.warn(`Skipping invalid path: ${p}`);
        return false;
      }
    });

    if (validPaths.length === 0) {
      throw new UploadError("No valid local files found to upload.");
    }

    this.logger.info(`Uploading ${validPaths.length} files to project ${projectUuid}`);

    const filesList = await Promise.all(
      validPaths.map(async (filePath) => {
        const entry: Record<string, string> = { file_name: path.basename(filePath) };
        if (calculateMd5) {
          entry["md5"] = this._calculateMd5(filePath);
        }
        return entry;
      })
    );

    const presignedJson = await this._makeRequest(
      "POST",
      `/projects/${projectUuid}/get_temporary_upload_links`,
      { json: { files_list: filesList }, ...(signal ? { signal } : {}) }
    );

    const parsed = PresignedUrlResponseSchema.safeParse(presignedJson);
    if (!parsed.success) {
      throw new UploadError(
        `Could not parse presigned URL response: ${parsed.error.message}`
      );
    }

    const uploadMap = new Map(
      parsed.data.data.files_list.map((f) => [f.fileName, f.uploadLink])
    );

    const limit = pLimit(maxConcurrent);
    const total = validPaths.length;

    const results: UploadResult[] = await Promise.all(
      validPaths.map((filePath, index) =>
        limit(async (): Promise<UploadResult> => {
          if (signal?.aborted) {
            return { file: filePath, success: false, error: "Aborted" };
          }
          onProgress?.(index, total, filePath);
          try {
            const uploadUrl = uploadMap.get(path.basename(filePath));
            if (!uploadUrl) {
              throw new UploadError(`No upload link found for ${path.basename(filePath)}`);
            }
            await this._uploadToS3(filePath, uploadUrl, signal);
            this.logger.debug(`Uploaded: ${path.basename(filePath)}`);
            onProgress?.(index + 1, total, filePath);
            return { file: filePath, success: true, error: null };
          } catch (err) {
            this.logger.error(`Failed to upload ${path.basename(filePath)}: ${String(err)}`);
            onProgress?.(index + 1, total, filePath);
            return { file: filePath, success: false, error: String(err) };
          }
        })
      )
    );

    const summary: UploadSummary = {
      total,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };

    this.logger.info(`Upload complete: ${summary.successful}/${summary.total} successful`);
    return summary;
  }

  private _uploadToS3(filePath: string, uploadUrl: string, signal?: AbortSignal): Promise<void> {
    const content = fs.readFileSync(filePath);
    return fetch(uploadUrl, {
      method: "PUT",
      body: content,
      ...(signal ? { signal } : {}),
    }).then((response) => {
      if (!response.ok) {
        throw new UploadError(`S3 upload failed (${response.status}): ${response.statusText}`);
      }
    });
  }

  private _calculateMd5(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("base64");
  }

  protected async _makeRequest(
    method: string,
    endpoint: string,
    options: {
      json?: unknown;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    } = {}
  ): Promise<unknown> {
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, "")}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    // AbortSignal.any() is Node 20.3+ only — propagate manually for Node 18 compatibility
    let abortListener: (() => void) | null = null;
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new ImagenError("Request aborted");
      }
      abortListener = () => controller.abort(options.signal!.reason);
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    try {
      const headers: Record<string, string> = {
        "x-api-key": this.apiKey,
        "User-Agent": "Imagen-Node-SDK/1.0.0",
        ...options.headers,
      };

      if (options.json !== undefined && !("Content-Type" in headers)) {
        headers["Content-Type"] = "application/json";
      }

      this.logger.debug(`${method} ${url}`);

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };
      if (options.json !== undefined) {
        fetchOptions.body = JSON.stringify(options.json);
      }

      const response = await fetch(url, fetchOptions);

      this.logger.debug(`Response: ${response.status}`);

      if (response.status === 401) {
        throw new AuthenticationError("Invalid API key or unauthorized.");
      }

      if (!response.ok) {
        let message: string;
        try {
          const body = (await response.json()) as Record<string, unknown>;
          message =
            typeof body["detail"] === "string" ? body["detail"] : response.statusText;
        } catch {
          message = response.statusText;
        }
        throw new ImagenError(`API Error (${response.status}): ${message}`);
      }

      if (response.status === 204) return {};
      return await response.json();
    } catch (err) {
      if (err instanceof ImagenError) throw err;
      throw new ImagenError(`Request failed: ${String(err)}`);
    } finally {
      clearTimeout(timeoutId);
      if (abortListener && options.signal) {
        options.signal.removeEventListener("abort", abortListener);
      }
    }
  }
}
