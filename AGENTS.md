# AGENTS.md - Sermon Manager Codebase Guidelines

## Project Overview

TypeScript sermon management app for churches. Deployed on Vercel with Cloudflare R2 for storage.

## Build Commands

```bash
# Install dependencies
bun install

# Compile TypeScript (frontend + API)
bun run build

# Watch mode for development
bun run dev:ts

# Deploy to production
bun run deploy
```

**Note**: No test runner is configured. No linting (ESLint) is set up - only Prettier for formatting.

## Project Structure

```
├── src/          # Frontend TypeScript (compiles to public/js/)
├── api/          # Vercel serverless functions
├── lib/          # Shared server-side utilities
├── public/       # Static frontend files
```

## TypeScript Configuration

Two separate configs:

- `tsconfig.json` - Frontend: ES2020 modules, outputs to `public/js/`
- `tsconfig.api.json` - API: CommonJS, outputs to `dist/`

## Code Style Guidelines

### Imports

- Use `import type` for type-only imports
- Group imports: external libs first, then internal modules
- Example: `import type { VercelRequest } from "@vercel/node";`

### Formatting

- Prettier with default settings (empty .prettierrc)
- 2-space indentation
- Semicolons required
- Double quotes for strings
- Trailing commas in multi-line objects/arrays

### Types & Naming

- **Interfaces**: PascalCase (e.g., `Sermon`, `PodcastMeta`)
- **Functions/Variables**: camelCase (e.g., `getSermons`, `audioUrl`)
- **Constants**: UPPER_SNAKE_CASE for true constants only
- Use strict TypeScript (`strict: true`)
- Explicit return types on exported functions

### Frontend Patterns

- Wrap files in IIFE: `(function () { ... })();`
- DOM queries after page load (inside `init()`)
- Type assertions for DOM elements: `as HTMLButtonElement`
- Event listeners use typed events: `(e: Event) =>`

### Error Handling

- Use try/catch with typed errors: `catch (error: any)`
- Log errors with context: `console.error("Context:", error)`
- Return structured error responses in APIs
- Use safeLog/safeError from lib/logger for server-side logging

### API Handler Pattern

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    // Handler logic
    return res.status(200).json({ data });
  } catch (error: any) {
    console.error("Error context:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
```

### Security

- Never log sensitive data (redact authorization/cookie headers)
- Use `authenticateRequest()` from lib/auth for protected routes
- Environment variables: `process.env.VAR_NAME`

### File Size Limits

- Audio uploads: 200MB max
- Use presigned URLs for direct-to-R2 uploads to bypass Vercel limits
