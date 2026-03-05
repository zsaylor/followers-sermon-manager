# Sermon Manager

A self-hosted sermon management application deployed on Vercel that allows a church pastor to upload sermons via a simple web form. The application automatically:

1. Stores audio files in Cloudflare R2
2. Generates a podcast-spec RSS feed that Spotify, Apple Podcasts, and other platforms consume
3. Displays sermons on the church's Squarespace website via an embeddable player

## Tech Stack

- **Language:** TypeScript
- **Frontend:** Static HTML + TypeScript (compiled with `tsc`)
- **Backend:** Vercel serverless functions (API routes)
- **Audio Storage:** Cloudflare R2 (S3-compatible)
- **Metadata Storage:** A `sermons.json` file stored in R2
- **Deployment:** Vercel (free tier)

## Project Structure

```
sermon-manager/
├── public/                     # Static frontend
│   ├── index.html              # Upload form page
│   ├── sermons.html            # Public sermon listing
│   ├── embed.html              # Embeddable player
│   ├── css/styles.css
│   └── js/                     # Compiled JS output
├── src/                        # Frontend TypeScript source
│   ├── upload.ts
│   ├── sermons.ts
│   └── embed.ts
├── api/                        # Vercel serverless functions
│   ├── upload.ts
│   ├── feed.ts
│   ├── sermons.ts
│   └── delete.ts
├── lib/                        # Shared server-side utilities
│   ├── r2.ts
│   ├── rss.ts
│   ├── auth.ts
│   └── types.ts
├── package.json
├── tsconfig.json
├── tsconfig.api.json
└── vercel.json
```

## Setup Instructions

### 1. Cloudflare R2 Setup

1. Create a Cloudflare account (free) at https://cloudflare.com
2. Go to **R2** in the Cloudflare dashboard
3. Create a bucket named `sermons`
4. Enable **Public Access** on the bucket (this generates a `pub-xxx.r2.dev` URL)
5. Go to **Manage R2 API Tokens** and create a new API token with:
   - **Permission:** Read & Write
   - **TTL:** No expiration (or set as needed)
6. Copy the **Access Key ID** and **Secret Access Key**
7. Copy your **Account ID** from the R2 overview page
8. Upload a podcast cover image to your bucket as `cover.jpg`:
   - Must be square, at least 1400x1400px, max 3000x3000px (Apple Podcast requirement)

### 2. Initialize Sermons Data

Upload an empty `sermons.json` file to your R2 bucket with the following content:

```json
{ "sermons": [] }
```

Create a `podcastMeta.json` file in your R2 bucket with your church's information:

```json
{
  "title": "Your Church Name Sermons",
  "description": "Weekly sermons from Your Church Name",
  "link": "https://yourchurch.com",
  "language": "en",
  "author": "Your Church Name",
  "email": "pastor@yourchurch.com",
  "imageUrl": "https://pub-xxx.r2.dev/cover.jpg",
  "category": "Religion & Spirituality",
  "subcategory": "Christianity"
}
```

### 3. Environment Variables

Set these in Vercel's project settings (and in a `.env.local` file for local development):

```
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=sermons
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
ADMIN_PASSWORD=choose_a_strong_password_here
```

### 4. Installation & Build

```bash
# Install dependencies
bun install

# Compile TypeScript to JavaScript
bun run build
```

### 5. Local Development

```bash
# Install Vercel CLI if you haven't already
bun install -g vercel

# Run locally
vercel dev
```

### 6. Deployment

```bash
# Deploy to Vercel
vercel --prod
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

## Usage

### Uploading Sermons

1. Visit `https://your-app.vercel.app/index.html`
2. Enter the admin password (same as `ADMIN_PASSWORD` env var)
3. Fill in the sermon details and upload an MP3 file
4. The audio duration is automatically calculated client-side

Note: uploads are performed directly from the browser to Cloudflare R2 using a presigned URL. This avoids Vercel request body limits on the Hobby plan.

#### Cloudflare R2 CORS

Because the browser uploads directly to R2, you must allow CORS on your R2 bucket for your site origin.

In Cloudflare Dashboard -> R2 -> your bucket -> CORS, add a rule similar to:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.vercel.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Public Sermon Page

Visit `https://your-app.vercel.app/sermons.html` to see all sermons with audio players.

### Podcast RSS Feed

The RSS feed is available at:

```
https://your-app.vercel.app/api/feed
```

Submit this URL to:

- Apple Podcasts: https://podcastsconnect.apple.com
- Spotify: https://podcasters.spotify.com
- Google Podcasts

### Embedding in Squarespace

Add an **Embed Block** to your Squarespace page with this code:

```html
<iframe
  src="https://your-app.vercel.app/embed.html?limit=5"
  width="100%"
  height="600"
  frameborder="0"
  style="border:none;"
>
</iframe>
```

The `limit` parameter controls how many sermons to display (default is 5).

## API Endpoints

### POST /api/upload-url

- Returns a presigned URL for directly uploading audio to R2
- Requires `Authorization: Bearer <ADMIN_PASSWORD>` header
- JSON body fields: `title`, `description`, `speaker`, `date`, `durationSeconds`, `contentType`, `fileSize`

### POST /api/upload-complete

- Finalizes an upload by saving sermon metadata to `sermons.json`
- Requires `Authorization: Bearer <ADMIN_PASSWORD>` header
- JSON body fields: `id`, `title`, `description`, `speaker`, `date`, `durationSeconds`, `audioUrl`, `audioFileSize`

### POST /api/upload (legacy)

- Legacy multipart upload endpoint (kept for compatibility)
- Requires `Authorization: Bearer <ADMIN_PASSWORD>` header
- Form data fields: `title`, `description`, `speaker`, `date`, `audio` (MP3 file), `durationSeconds`

### GET /api/feed

- Returns podcast RSS feed
- Public endpoint, no authentication required

### GET /api/sermons

- Returns list of sermons as JSON
- Query params: `?page=N&limit=M` for pagination
- Public endpoint, no authentication required

### DELETE /api/delete

- Delete a sermon by ID
- Requires `Authorization: Bearer <ADMIN_PASSWORD>` header
- Request body: `{ "id": "sermon-uuid" }`

## Security Notes

- The `ADMIN_PASSWORD` is a simple shared secret. Keep it secure.
- Only authenticated requests can upload or delete sermons.
- File uploads are limited to 200MB.
- Only MP3 files are accepted.

## Development

The project uses:

- **TypeScript** for type safety
- **Vercel** for serverless hosting
- **Cloudflare R2** for object storage (S3-compatible)
- **Busboy** for multipart form parsing

To modify the frontend:

1. Edit files in `src/`
2. Run `bun run build` to compile to `public/js/`

To modify API routes:

1. Edit files in `api/` or `lib/`
2. Changes are automatically compiled by Vercel

## Future Enhancements

- YouTube video upload automation
- Sermon series and tags
- Search functionality
- Analytics dashboard

## License

MIT
