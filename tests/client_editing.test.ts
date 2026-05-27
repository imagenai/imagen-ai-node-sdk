import { ImagenClient } from "../src/client";
import { ProjectError } from "../src/errors";
import { PhotographyType } from "../src/enums";

describe("ImagenClient.startEditing", () => {
  let client: ImagenClient;

  beforeEach(() => {
    client = new ImagenClient("test-key");
  });

  afterEach(async () => {
    await client.close();
  });

  it("polls until Completed and returns StatusDetails", async () => {
    global.fetch = jest.fn()
      // POST /edit — starts editing
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({}),
      } as unknown as Response)
      // GET /edit/status — Processing
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Processing", progress: 50, details: null } }),
      } as unknown as Response)
      // GET /edit/status — Completed
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Completed", progress: 100, details: null } }),
      } as unknown as Response);

    const status = await client.startEditing("proj-123", {
      profileKey: 5700,
      pollIntervalMs: 1, // fast polling for tests
    });

    expect(status.status).toBe("Completed");
    expect(status.progress).toBe(100);
  });

  it("throws ProjectError when status is Failed", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          data: { status: "Failed", progress: null, details: "Out of credits" },
        }),
      } as unknown as Response);

    await expect(
      client.startEditing("proj-123", { profileKey: 5700, pollIntervalMs: 1 })
    ).rejects.toThrow(ProjectError);
  });

  it("throws ProjectError with failure details when available", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          data: { status: "Failed", progress: null, details: "Insufficient quota" },
        }),
      } as unknown as Response);

    await expect(
      client.startEditing("proj-123", { profileKey: 5700, pollIntervalMs: 1 })
    ).rejects.toThrow("Insufficient quota");
  });

  it("sends profile_key in POST body", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Completed", progress: 100, details: null } }),
      } as unknown as Response);

    await client.startEditing("proj-123", { profileKey: 5700, pollIntervalMs: 1 });

    const editBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(editBody.profile_key).toBe(5700);
  });

  it("sends photography_type in body when provided", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Completed", progress: 100, details: null } }),
      } as unknown as Response);

    await client.startEditing("proj-123", {
      profileKey: 5700,
      photographyType: PhotographyType.WEDDING,
      pollIntervalMs: 1,
    });

    const editBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(editBody.photography_type).toBe("WEDDING");
  });

  it("calls POST to /projects/{uuid}/edit", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Completed", progress: 100, details: null } }),
      } as unknown as Response);

    await client.startEditing("proj-abc", { profileKey: 1, pollIntervalMs: 1 });

    const editUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(editUrl).toContain("proj-abc");
    expect(editUrl).toContain("/edit");
  });
});

describe("ImagenClient.exportProject", () => {
  let client: ImagenClient;

  beforeEach(() => {
    client = new ImagenClient("test-key");
  });

  afterEach(async () => {
    await client.close();
  });

  it("posts to /export and polls until Completed", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Completed", progress: 100, details: null } }),
      } as unknown as Response);

    const status = await client.exportProject("proj-123", { pollIntervalMs: 1 });
    expect(status.status).toBe("Completed");

    const exportUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(exportUrl).toContain("/export");
  });

  it("throws ProjectError when export fails", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: { status: "Failed", progress: null, details: "Export error" } }),
      } as unknown as Response);

    await expect(
      client.exportProject("proj-123", { pollIntervalMs: 1 })
    ).rejects.toThrow(ProjectError);
  });
});
