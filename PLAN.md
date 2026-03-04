# Sermon Manager — Implementation Plan

## Overview

Build a self-hosted sermon management application deployed on Vercel that allows a church pastor to upload sermons via a simple web form. The application automatically:

1. Stores audio files in Cloudflare R2
2. Generates a podcast-spec RSS feed that Spotify, Apple Podcasts, and other platforms consume
3. Displays sermons on the church's Squarespace website via an embeddable player
4. (Future) Generates a video and uploads to YouTube via the YouTube Data API

The entire application is written in TypeScript. The frontend is a static site (plain HTML + TypeScript compiled to JS, no framework). The backend consists of Vercel serverless API routes. There is no database — sermon metadata is stored as a `sermons.json` file in R2 alongside the audio files.

---

## Tech Stack

- **Language:** TypeScript everywhere
- **Frontend:** Static HTML + TypeScript (compiled with `tsc` or `esbuild`)
- **Backend:** Vercel serverless functions (API routes in `api/` directory)
- **Audio Storage:** Cloudflare R2 (S3-compatible)
- **Metadata Storage:** A `sermons.json` file stored in R2
- **Deployment:** Vercel (free tier)
- **Package manager:** Bun
- **Dev dependencies:** `typescript`, `@vercel/node`, `@aws-sdk/client-s3` (R2 is S3-compatible)

---

## Project Structure

```
sermon-manager/
├── public/                     # Static frontend (served by Vercel)
│   ├── index.html              # Upload form page
│   ├── sermons.html            # Public sermon listing / player page
│   ├── embed.html              # Embeddable player for Squarespace iframe
│   ├── css/
│   │   └── styles.css          # Simple, clean stylesheet
│   └── js/                     # Compiled JS output directory
│       ├── upload.js           # (compiled from src/upload.ts)
│       ├── sermons.js          # (compiled from src/sermons.ts)
│       └── embed.js            # (compiled from src/embed.ts)
├── src/                        # Frontend TypeScript source
│   ├── upload.ts               # Upload form logic
│   ├── sermons.ts              # Sermon listing page logic
│   └── embed.ts                # Embeddable player logic
├── api/                        # Vercel serverless functions
│   ├── upload.ts               # POST: receive sermon upload, store in R2
│   ├── feed.ts                 # GET: generate and return podcast RSS XML
│   ├── sermons.ts              # GET: return sermons.json as JSON API
│   └── delete.ts               # DELETE: remove a sermon
├── lib/                        # Shared server-side utilities
│   ├── r2.ts                   # R2 client setup and helpers
│   ├── rss.ts                  # RSS XML generation
│   ├── auth.ts                 # Simple authentication
│   └── types.ts                # Shared TypeScript interfaces
├── tsconfig.json               # TypeScript config for frontend src/
├── tsconfig.api.json           # TypeScript config for api/ and lib/ (if needed)
├── vercel.json                 # Vercel configuration
├── package.json
└── README.md
```

---

## Data Model

### `Sermon` interface (defined in `lib/types.ts`)

```typescript
interface Sermon {
  id: string; // UUID v4
  title: string; // Sermon title
  description: string; // Sermon description/summary
  speaker: string; // Pastor/speaker name
  date: string; // ISO 8601 date string (e.g. "2026-02-09")
  audioUrl: string; // Public R2 URL to the mp3 file
  audioFileSize: number; // File size in bytes (required for RSS enclosure)
  durationSeconds: number; // Duration in seconds (required for RSS)
  createdAt: string; // ISO 8601 timestamp of when it was uploaded
}
```

### `sermons.json` format (stored in R2)

```json
{
  "sermons": [
    {
      "id": "uuid-here",
      "title": "Sermon Title",
      "description": "Description",
      "speaker": "Pastor Name",
      "date": "2026-02-09",
      "audioUrl": "https://pub-xxx.r2.dev/sermons/2026-02-09-sermon-title.mp3",
      "audioFileSize": 34567890,
      "durationSeconds": 2400,
      "createdAt": "2026-02-09T15:30:00Z"
    }
  ]
}
```

Sermons are stored in reverse chronological order (newest first).

### `podcastMeta.json` — Podcast-level metadata (also in R2, or hardcoded)

```json
{
  "title": "Church Name Sermons",
  "description": "Weekly sermons from Church Name",
  "link": "https://yourchurch.com",
  "language": "en",
  "author": "Church Name",
  "email": "pastor@yourchurch.com",
  "imageUrl": "https://pub-xxx.r2.dev/cover.jpg",
  "category": "Religion & Spirituality",
  "subcategory": "Christianity"
}
```

---

## Environment Variables

These are set in Vercel's project settings (and in a `.env.local` file for local dev):

```
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=sermons
R2_PUBLIC_URL=https://pub-xxxx.r2.dev    # R2 public bucket URL

ADMIN_PASSWORD=a_strong_password          # Simple auth for upload/delete
```

---

## API Routes — Detailed Specifications

### `POST /api/upload`

**Purpose:** Receive a sermon upload from the frontend form, store the audio in R2, update `sermons.json`.

**Authentication:** Require `Authorization: Bearer <ADMIN_PASSWORD>` header. Compare against `process.env.ADMIN_PASSWORD`. Return 401 if invalid.

**Request:** `multipart/form-data` with fields:

- `title` (string, required)
- `description` (string, required)
- `speaker` (string, required)
- `date` (string, required, ISO date)
- `audio` (file, required, must be audio/mpeg)

**Logic:**

1. Validate auth header
2. Parse multipart form data (use `formidable` or `busboy` — add as a dependency)
3. Validate required fields and file type (accept .mp3 only for simplicity)
4. Generate a UUID for the sermon ID
5. Generate a filename: `sermons/{date}-{slugified-title}.mp3`
6. Upload audio file to R2 using `@aws-sdk/client-s3` `PutObjectCommand`
7. Calculate audio duration — use a lightweight approach: either accept `durationSeconds` as a form field that the frontend calculates client-side using the Web Audio API, or use a library like `music-metadata` on the server side. Prefer client-side calculation to avoid adding server dependencies.
8. Read current `sermons.json` from R2 (`GetObjectCommand`)
9. Prepend the new sermon to the array
10. Write updated `sermons.json` back to R2 (`PutObjectCommand`)
11. Return 200 with the new sermon object as JSON

**Error handling:** Return appropriate HTTP status codes (400 for validation, 401 for auth, 500 for R2 errors) with JSON error messages.

**Important Vercel config:** Disable body parsing for this route since it handles multipart data. In `vercel.json` or via export config:

```typescript
export const config = {
  api: { bodyParser: false },
};
```

### `GET /api/feed`

**Purpose:** Dynamically generate and return a valid podcast RSS feed.

**Authentication:** None (public endpoint — podcast platforms need to access it).

**Response:** Content-Type `application/rss+xml; charset=utf-8`

**Logic:**

1. Read `sermons.json` from R2
2. Use `lib/rss.ts` to generate the XML string
3. Return the XML

**RSS format:** Must conform to the Apple Podcast RSS spec (which Spotify also uses). Use the `itunes` namespace. Required elements:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Church Name Sermons</title>
    <link>https://yourchurch.com</link>
    <language>en</language>
    <description>Weekly sermons from Church Name</description>
    <itunes:author>Church Name</itunes:author>
    <itunes:owner>
      <itunes:name>Church Name</itunes:name>
      <itunes:email>pastor@yourchurch.com</itunes:email>
    </itunes:owner>
    <itunes:image href="https://pub-xxx.r2.dev/cover.jpg"/>
    <itunes:category text="Religion &amp; Spirituality">
      <itunes:category text="Christianity"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <atom:link href="https://your-app.vercel.app/api/feed" rel="self" type="application/rss+xml"/>

    <!-- One <item> per sermon, newest first -->
    <item>
      <title>Sermon Title</title>
      <description>Sermon description</description>
      <enclosure url="https://pub-xxx.r2.dev/sermons/file.mp3"
                 length="34567890"
                 type="audio/mpeg"/>
      <guid isPermaLink="false">uuid-here</guid>
      <pubDate>Sun, 09 Feb 2026 10:00:00 GMT</pubDate>
      <itunes:author>Speaker Name</itunes:author>
      <itunes:duration>2400</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>
  </channel>
</rss>
```

**Important:** `pubDate` must be in RFC 2822 format. `itunes:duration` can be in seconds or HH:MM:SS format. `enclosure length` must be the file size in bytes.

### `GET /api/sermons`

**Purpose:** Return the sermon list as JSON for the frontend.

**Authentication:** None (public).

**Logic:**

1. Read `sermons.json` from R2
2. Return it with `Content-Type: application/json`

**Optional query params:**

- `?limit=N` — return only the N most recent sermons
- `?page=N&limit=M` — basic pagination

### `DELETE /api/delete`

**Purpose:** Delete a sermon by ID.

**Authentication:** Require `Authorization: Bearer <ADMIN_PASSWORD>` header.

**Request:** JSON body `{ "id": "sermon-uuid" }`

**Logic:**

1. Validate auth
2. Read `sermons.json` from R2
3. Find the sermon by ID
4. Delete the audio file from R2 (`DeleteObjectCommand`)
5. Remove the sermon from the array
6. Write updated `sermons.json` back to R2
7. Return 200

---

## Frontend Pages — Detailed Specifications

### General frontend approach

- Plain HTML files in `public/`
- TypeScript source files in `src/`, compiled to `public/js/` via `tsc` or `esbuild`
- Simple, clean CSS — no framework needed, but use a modern sans-serif font and clean layout
- The site should look respectable for a church context — clean, minimal, professional
- Mobile responsive

### `public/index.html` — Upload Form (Admin Page)

**Purpose:** Form for the pastor to upload a new sermon.

**Layout:**

- Page title: "Upload Sermon"
- A simple login section at the top: a password input field. When submitted, store the password in `sessionStorage` and use it as the Bearer token for API requests. If the API returns 401, show an error and clear the stored password.
- Form fields:
  - Title (text input, required)
  - Speaker (text input, required, remember last used value in localStorage)
  - Date (date input, required, default to current date)
  - Description (textarea, required)
  - Audio file (file input, accept=".mp3,audio/mpeg", required)
- A submit button
- A progress indicator for the upload (show percentage if possible)
- Success/error messages
- Below the form: a list of existing sermons with delete buttons (fetch from `GET /api/sermons`)

**Client-side logic (`src/upload.ts`):**

1. On file selection, use the Web Audio API to calculate the duration of the mp3:
   ```typescript
   const audioContext = new AudioContext();
   const arrayBuffer = await file.arrayBuffer();
   const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
   const durationSeconds = Math.round(audioBuffer.duration);
   ```
2. On form submit, create a `FormData` object, append all fields including `durationSeconds`, and POST to `/api/upload` with the auth header.
3. Show upload progress using `XMLHttpRequest` (fetch API doesn't support upload progress; use XHR for this).
4. On success, refresh the sermon list.
5. For delete, confirm with the user, then send DELETE to `/api/delete`.

### `public/sermons.html` — Public Sermon Listing

**Purpose:** A public page listing all sermons with an audio player for each.

**Layout:**

- Page title: "Sermons"
- List of sermon cards, each showing:
  - Title
  - Speaker name
  - Date (formatted nicely, e.g. "February 9, 2026")
  - Description (truncated with "read more" expand)
  - HTML5 `<audio>` player with controls
- Pagination or "load more" if there are many sermons
- Mobile responsive

**Client-side logic (`src/sermons.ts`):**

1. Fetch from `GET /api/sermons`
2. Render sermon cards into the DOM
3. Each card includes an `<audio src="...">` element pointing to the R2 URL

### `public/embed.html` — Embeddable Player for Squarespace

**Purpose:** A minimal, self-contained page designed to be embedded in Squarespace via an `<iframe>`. Shows recent sermons with audio players.

**Layout:**

- No header/footer/navigation — just the sermon list and players
- Minimal styling, designed to look good inside an iframe
- Configurable via URL params: `?limit=5` to control how many sermons to show

**Squarespace integration:** The church adds a Code Block to their Squarespace page containing:

```html
<iframe
  src="https://your-app.vercel.app/embed.html?limit=5"
  width="100%"
  height="600"
  frameborder="0"
  style="border:none;"
></iframe>
```

**Client-side logic (`src/embed.ts`):**

1. Read `limit` from URL search params
2. Fetch from `GET /api/sermons?limit=N`
3. Render a compact sermon list with audio players

---

## Shared Library — Detailed Specifications

### `lib/r2.ts`

Set up and export an S3 client configured for Cloudflare R2:

```typescript
import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME!;
export const PUBLIC_URL = process.env.R2_PUBLIC_URL!;
```

Also export helper functions:

- `getSermons(): Promise<Sermon[]>` — read and parse `sermons.json` from R2
- `putSermons(sermons: Sermon[]): Promise<void>` — write `sermons.json` to R2
- `uploadAudio(key: string, body: Buffer, contentType: string): Promise<void>` — upload an audio file
- `deleteAudio(key: string): Promise<void>` — delete an audio file

### `lib/rss.ts`

Export a function:

```typescript
export function generateRssFeed(sermons: Sermon[], meta: PodcastMeta): string;
```

This function builds the RSS XML string manually (no need for an XML library — template literals are fine for this). Ensure proper XML escaping of special characters (`&`, `<`, `>`, `"`, `'`) in titles and descriptions. Export a helper `escapeXml(str: string): string` for this.

Format `pubDate` in RFC 2822 format. Format `itunes:duration` in seconds.

### `lib/auth.ts`

Export a function:

```typescript
export function authenticate(req: VercelRequest): boolean;
```

Extracts the `Authorization` header, expects `Bearer <token>`, and compares the token against `process.env.ADMIN_PASSWORD`. Returns true/false.

### `lib/types.ts`

Export the `Sermon` and `PodcastMeta` interfaces. These are shared between API routes.

---

## Configuration Files

### `vercel.json`

```json
{
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/$1" }],
  "headers": [
    {
      "source": "/api/feed",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/rss+xml; charset=utf-8"
        },
        {
          "key": "Cache-Control",
          "value": "s-maxage=300, stale-while-revalidate=600"
        }
      ]
    },
    {
      "source": "/api/sermons",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate=120"
        }
      ]
    },
    {
      "source": "/embed.html",
      "headers": [{ "key": "X-Frame-Options", "value": "ALLOWALL" }]
    }
  ]
}
```

### `tsconfig.json` (for frontend `src/` files)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "strict": true,
    "outDir": "public/js",
    "rootDir": "src",
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/**/*.ts"]
}
```

### `package.json`

```json
{
  "name": "sermon-manager",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@vercel/node": "^3.0.0",
    "@types/node": "^20.0.0"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "busboy": "^1.6.0"
  }
}
```

Add `@types/busboy` to devDependencies.

---

## Build and Deploy Steps

1. `bun install`
2. `bun run build` — compiles `src/*.ts` to `public/js/*.js`
3. `vercel dev` — runs locally for development
4. `vercel --prod` — deploys to production

Vercel automatically:

- Serves `public/` as static files
- Compiles and deploys `api/*.ts` as serverless functions

---

## R2 Bucket Setup (Manual — Document in README)

The developer needs to:

1. Create a Cloudflare account (free)
2. Go to R2 in the Cloudflare dashboard
3. Create a bucket (e.g., `sermons`)
4. Enable public access on the bucket (generates a `pub-xxx.r2.dev` URL)
5. Create an R2 API token with read/write permissions
6. Initialize the bucket with an empty `sermons.json`: `{"sermons": []}`
7. Upload a podcast cover image (`cover.jpg`) — must be square, at least 1400x1400px, max 3000x3000px (Apple Podcast requirement)

---

## Security Considerations

- The `ADMIN_PASSWORD` is a simple shared secret. This is acceptable for a small church use case. The upload and delete routes must validate it on every request.
- All API routes that modify data must check authentication before doing anything else.
- The upload route must validate file type and reject non-mp3 files.
- Consider adding a max file size check (e.g., 200 MB) to prevent abuse.
- The public endpoints (`/api/feed`, `/api/sermons`) require no authentication.
- CORS: The embed page may need CORS headers if accessed cross-origin. Add `Access-Control-Allow-Origin: *` to the `/api/sermons` endpoint headers in `vercel.json` so the Squarespace iframe can fetch sermon data.

---

## Future Enhancements (Not in initial build)

These are documented for future implementation:

### YouTube Upload Automation

- Add `POST /api/youtube` endpoint
- Use FFmpeg (via a Vercel function or external service) to combine the audio with a static image to create an mp4
- Use the YouTube Data API v3 with OAuth2 to upload the video
- Note: Vercel serverless functions have a 50 MB payload limit and execution time limits. Large files may require a different approach (e.g., a long-running job on Railway or a Cloudflare Worker with longer timeouts).

### Sermon Series / Tags

- Add optional `series` and `tags` fields to the Sermon interface
- Allow filtering by series on the sermons page

### Search

- Add client-side search/filter on the sermons page

### Squarespace RSS Integration

- Instead of the iframe embed, Squarespace's "Summary" blocks can consume RSS feeds. The `/api/feed` endpoint could potentially be used directly, though Squarespace's RSS consumption is limited to their blog import feature.
