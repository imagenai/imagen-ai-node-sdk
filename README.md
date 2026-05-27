# Imagen AI Node.js SDK

Node.js/TypeScript SDK for the [Imagen AI](https://imagen-ai.com) photo editing workflow.

## Requirements

- Node.js 18 or later
- An Imagen AI API key

## Installation

```bash
npm install imagen-ai-sdk
```

## Quick start

The `quickEdit` helper runs the entire workflow — upload, edit, and optionally export and download — in a single call:

```typescript
import { quickEdit, PhotographyType } from "imagen-ai-sdk";

const result = await quickEdit(process.env.IMAGEN_API_KEY!, {
  profileKey: 12345,
  imagePaths: ["./photos/DSC001.CR2", "./photos/DSC002.CR2"],
  photographyType: PhotographyType.WEDDING,
  download: true,
  downloadDir: "./edited",
});

console.log(`Project: ${result.projectUuid}`);
console.log(`Uploaded: ${result.uploadSummary.successful}/${result.uploadSummary.total}`);
console.log(`Downloaded to: ${result.downloadedFiles}`);
```

## Step-by-step workflow

Use `ImagenClient` directly when you need more control over individual steps.

### 1. Create a client

```typescript
import { ImagenClient } from "imagen-ai-sdk";

const client = new ImagenClient(process.env.IMAGEN_API_KEY!);
```

### 2. List your profiles

```typescript
const profiles = await client.getProfiles();
// [{ profileKey: 12345, profileName: "My Wedding Style", imageType: "RAW", profileType: "..." }]
```

### 3. Create a project

```typescript
const projectUuid = await client.createProject("Summer Wedding 2024");
```

### 4. Upload images

```typescript
const summary = await client.uploadImages(
  projectUuid,
  ["./photos/DSC001.CR2", "./photos/DSC002.CR2"],
  {
    maxConcurrent: 5,
    onProgress: (current, total, file) =>
      console.log(`Uploading ${current}/${total}: ${file}`),
  }
);
console.log(`${summary.successful}/${summary.total} files uploaded`);
```

### 5. Start editing

```typescript
import { PhotographyType } from "imagen-ai-sdk";

const status = await client.startEditing(projectUuid, {
  profileKey: 12345,
  photographyType: PhotographyType.WEDDING,
});
// Polls until the edit completes or fails
console.log(status.status); // "Completed"
```

### 6. Download edited files

```typescript
const downloadLinks = await client.getDownloadLinks(projectUuid);
const files = await client.downloadFiles(downloadLinks, "./output", {
  onProgress: (current, total) => console.log(`Downloading ${current}/${total}`),
});
```

### 7. Export (optional)

Export produces delivery-ready JPEGs from your RAW edits:

```typescript
await client.exportProject(projectUuid);
const exportLinks = await client.getExportLinks(projectUuid);
const exportedFiles = await client.downloadFiles(exportLinks, "./output/exported");
```

### 8. Clean up

```typescript
await client.close();
// Or use the async disposable pattern:
await using client = new ImagenClient(apiKey);
```

## API reference

### `ImagenClient`

```typescript
new ImagenClient(apiKey: string, options?: ClientOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | Imagen API endpoint | Override the API base URL |
| `timeout` | `number` | `300000` | Request timeout in milliseconds |
| `logger` | `Logger` | silent | Pass `console` or any object with `debug/info/warn/error` methods |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `getProfiles()` | `Promise<Profile[]>` | List all profiles on your account |
| `createProject(name?)` | `Promise<string>` | Create a project, returns its UUID |
| `uploadImages(projectUuid, paths, options?)` | `Promise<UploadSummary>` | Upload image files to a project |
| `startEditing(projectUuid, options)` | `Promise<StatusDetails>` | Start editing and wait for completion |
| `exportProject(projectUuid, options?)` | `Promise<StatusDetails>` | Export edited images to JPEG and wait |
| `getDownloadLinks(projectUuid)` | `Promise<string[]>` | Get presigned download URLs for edited files |
| `getExportLinks(projectUuid)` | `Promise<string[]>` | Get presigned download URLs for exported files |
| `downloadFiles(links, outputDir, options?)` | `Promise<string[]>` | Download files and return their local paths |
| `close()` | `Promise<void>` | Release the client |

### `quickEdit(apiKey, options)`

Convenience function that runs the full workflow.

| Option | Type | Default | Description |
|---|---|---|---|
| `profileKey` | `number` | required | Profile to apply |
| `imagePaths` | `string[]` | required | Local paths of images to edit |
| `projectName` | `string` | — | Optional project name |
| `photographyType` | `PhotographyType` | — | Hint that improves edit quality |
| `editOptions` | `EditOptions` | — | Fine-grained editing features |
| `export` | `boolean` | `false` | Export to JPEG after editing |
| `download` | `boolean` | `false` | Download files locally after editing |
| `downloadDir` | `string` | `"downloads"` | Directory for downloaded edit files |
| `exportDownloadDir` | `string` | `downloadDir/exported` | Directory for downloaded export files |
| `uploadOptions` | `UploadOptions` | — | Options forwarded to `uploadImages` |
| `downloadOptions` | `DownloadOptions` | — | Options forwarded to `downloadFiles` |
| `pollIntervalMs` | `number` | `10000` | Initial polling interval in ms |
| `signal` | `AbortSignal` | — | Cancellation signal |

### `getProfiles(apiKey, baseUrl?)`

Standalone helper to fetch profiles without managing a client.

```typescript
import { getProfiles } from "imagen-ai-sdk";

const profiles = await getProfiles(process.env.IMAGEN_API_KEY!);
```

### `getProfile(apiKey, profileKey, baseUrl?)`

Fetch a single profile by key.

```typescript
import { getProfile } from "imagen-ai-sdk";

const profile = await getProfile(process.env.IMAGEN_API_KEY!, 12345);
```

### `checkFilesMatchProfileType(filePaths, profile)`

Validates that all files are compatible with a profile's image type (`RAW` or `JPG`). Throws `UploadError` on mismatch.

```typescript
import { checkFilesMatchProfileType } from "imagen-ai-sdk";

checkFilesMatchProfileType(["./photo.CR2"], profile);
```

## Edit options

Pass `editOptions` to `startEditing` or `quickEdit` to enable optional editing features:

```typescript
await client.startEditing(projectUuid, {
  profileKey: 12345,
  editOptions: {
    crop: true,
    straighten: true,
    smooth_skin: true,
    sky_replacement: false,
  },
});
```

| Option | Type | Description |
|---|---|---|
| `crop` | `boolean` | Auto-crop |
| `straighten` | `boolean` | Auto-straighten (mutually exclusive with `perspective_correction`) |
| `hdr_merge` | `boolean` | HDR merge |
| `portrait_crop` | `boolean` | Portrait-specific crop (mutually exclusive with `crop` and `headshot_crop`) |
| `smooth_skin` | `boolean` | Skin smoothing |
| `subject_mask` | `boolean` | Subject masking |
| `headshot_crop` | `boolean` | Headshot crop (mutually exclusive with `crop` and `portrait_crop`) |
| `perspective_correction` | `boolean` | Perspective correction (mutually exclusive with `straighten`) |
| `sky_replacement` | `boolean` | Sky replacement |
| `sky_replacement_template_id` | `number` | Sky template to use with `sky_replacement` |
| `window_pull` | `boolean` | Window pull (real estate) |
| `crop_aspect_ratio` | `CropAspectRatio` | Aspect ratio when `crop` is enabled |

Available crop ratios:

```typescript
import { CropAspectRatio } from "imagen-ai-sdk";

CropAspectRatio.RATIO_2X3  // "2X3"
CropAspectRatio.RATIO_4X5  // "4X5"
CropAspectRatio.RATIO_5X7  // "5X7"
```

## Photography types

Providing a photography type improves edit accuracy:

```typescript
import { PhotographyType } from "imagen-ai-sdk";

PhotographyType.WEDDING
PhotographyType.PORTRAITS
PhotographyType.REAL_ESTATE
PhotographyType.FAMILY_NEWBORN
PhotographyType.EVENTS
PhotographyType.LANDSCAPE_NATURE
PhotographyType.SPORTS
PhotographyType.BOUDOIR
PhotographyType.OTHER
PhotographyType.NO_TYPE
```

## Upload and download options

### `UploadOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxConcurrent` | `number` | `5` | Number of parallel uploads |
| `calculateMd5` | `boolean` | `false` | Send MD5 checksums with upload requests |
| `onProgress` | `(current, total, file) => void` | — | Progress callback |
| `signal` | `AbortSignal` | — | Cancellation signal |

### `DownloadOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxConcurrent` | `number` | `5` | Number of parallel downloads |
| `onProgress` | `(current, total, file) => void` | — | Progress callback |
| `signal` | `AbortSignal` | — | Cancellation signal |

## Error handling

All errors extend `ImagenError`:

| Class | Thrown when |
|---|---|
| `ImagenError` | Base class for all SDK errors |
| `AuthenticationError` | API key is invalid or missing |
| `ProjectError` | Project creation, edit, or export failure |
| `UploadError` | Upload fails or no valid files found |
| `DownloadError` | Download fails or no links provided |

```typescript
import { ImagenError, AuthenticationError } from "imagen-ai-sdk";

try {
  await client.startEditing(projectUuid, { profileKey: 12345 });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error("Check your API key");
  } else if (err instanceof ImagenError) {
    console.error("SDK error:", err.message);
  }
}
```

## Cancellation

Pass an `AbortSignal` to cancel any long-running operation:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000);

await client.startEditing(projectUuid, {
  profileKey: 12345,
  signal: controller.signal,
});
```

## Logging

Pass any logger that implements `debug`, `info`, `warn`, and `error`. Passing `console` is the simplest option:

```typescript
const client = new ImagenClient(apiKey, { logger: console });
```

## Supported file types

RAW: `.cr2`, `.cr3`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`, `.dng`, `.raw`

JPEG: `.jpg`, `.jpeg`

## License

MIT
