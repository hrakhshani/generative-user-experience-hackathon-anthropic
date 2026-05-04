# UWAL - Universal Web Action Layer

UWAL turns any website into an AI-powered workspace. It lets users select live page elements, save them as structured objects, compare similar items, summarize or translate content, track changes, annotate pages, and re-run saved actions automatically when they return.

<p align="center">
  <a href="https://v0-web-action-layer.vercel.app/"><strong>Live app</strong></a>
  ·
  <a href="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4"><strong>Demo video</strong></a>
  ·
  <a href="https://github.com/hrakhshani/generative-user-experience-hackathon-anthropic"><strong>Repository</strong></a>
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase">
  <img alt="AI SDK" src="https://img.shields.io/badge/AI%20SDK-6-000">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-MV3-4285f4?logo=googlechrome">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

<p align="center">
  <video
    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4"
    controls
    muted
    playsinline
    width="100%"
    aria-label="UWAL demo video"
  >
    <a href="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4">Watch the UWAL demo video</a>
  </video>
</p>

## Contents

- [What UWAL does](#what-uwal-does)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Chrome extension setup](#chrome-extension-setup)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Security notes](#security-notes)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## What UWAL does

Most AI browser tools stop at chat. UWAL gives users and agents primitives for acting on real web pages:

- Select page elements directly instead of copying text into a chatbot.
- Save cards, rows, listings, articles, tables, or full pages as structured objects.
- Apply semantic filter, rank, summarize, translate, compare, extract, and tracking actions.
- Save page rules so actions run again on matching pages.
- Persist saved objects, annotations, tracking snapshots, and workspace tokens in Supabase.

## Key features

| Feature | What it provides |
| --- | --- |
| Universal save | Captures a selected element or full page with DOM context, text, metadata, media, and screenshot storage. |
| Visual element picker | Hover-and-click selection for cards, rows, listings, posts, and page sections. Use `[` and `]` to adjust selection scope. |
| Page rules | Repeatable rules for filter, rank, summarize, translate, save, compare, and custom selector workflows. |
| Semantic filter and rank | Applies natural-language criteria to live DOM elements. |
| AI comparison tables | Compares 2-8 selected items and returns a structured table, verdict, and top pick. |
| Structured extraction | Converts page or element text into JSON using AI SDK structured outputs. |
| Change tracking | Stores snapshots for selected objects so content drift can be detected later. |
| Dashboard | Provides auth, saved object browsing, object detail views, rules, settings, and token management. |
| Workspace tokens | Allows the Chrome extension to authenticate through scoped bearer tokens instead of a browser session. |

## Tech stack

- Next.js 16 App Router and React 19
- Tailwind CSS v4 and shadcn/ui components
- Supabase Auth, Postgres, and Row-Level Security
- AI SDK 6 with Vercel AI Gateway by default
- Optional direct OpenAI or Anthropic API keys
- Vercel Blob for screenshots
- Chrome Manifest V3 extension with plain JavaScript and no build step

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env.local
```

See [Environment variables](#environment-variables) for the required keys.

### 3. Create the database schema

Run the SQL files in `scripts/` against your Supabase project:

1. `scripts/001_create_schema.sql`
2. `scripts/004_add_object_media.sql`

`scripts/000_ping.sql` is only a connectivity check.

### 4. Start the dashboard

```bash
pnpm dev
```

Open the [local dashboard](http://localhost:3000), sign up, then create a workspace token in **Settings**.

### 5. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Open the extension **Options** page.
5. Set the dashboard URL and workspace token.
6. Click **Test connection**, then **Save**.

Press `Alt+U` on any web page to open the UWAL action layer.

## Environment variables

Every required variable is documented in `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by client and server code. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key for browser-side auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side key used by API routes that resolve workspace tokens. Keep this secret. |
| `AI_GATEWAY_API_KEY` | Yes, unless using direct provider keys | Vercel AI Gateway key. |
| `OPENAI_API_KEY` | Optional | Direct OpenAI fallback when not using the gateway. |
| `ANTHROPIC_API_KEY` | Optional | Direct Anthropic fallback when not using the gateway. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token for screenshot storage. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Optional | Local auth redirect override for non-default origins. |

The API also supports user-supplied provider keys from request headers:

- `x-openai-key`
- `x-anthropic-key`

Those keys let extension users bypass the gateway for supported routes.

## Database setup

The current SQL scripts create these RLS-protected tables:

- `objects`
- `annotations`
- `tracked_objects`
- `tracking_snapshots`
- `comparisons`
- `workspace_tokens`

The app also references `page_rules` for the rules dashboard and `/api/v1/page-rules` routes. Make sure your Supabase project includes that table before relying on saved rules.

Run schema changes in order. If you add new migrations, keep them numbered and idempotent with `if not exists` or equivalent guards where practical.

## Chrome extension setup

The extension lives in `extension/` and does not need a bundler.

| File | Purpose |
| --- | --- |
| `extension/manifest.json` | Manifest V3 permissions, commands, and extension metadata. |
| `extension/background.js` | Service worker that owns config, token handling, and API calls. |
| `extension/content.js` | Shadow-DOM toolbar, element picker, and page-rule runtime. |
| `extension/popup.html` / `extension/popup.js` / `extension/popup.css` | Browser-action popup. |
| `extension/options.html` / `extension/options.js` / `extension/options.css` | API URL and token settings UI. |

The content script does not call the backend directly. It sends typed messages to the background service worker, which adds the bearer token and forwards requests to the Next.js API.

## Architecture

```text
+--------------------------+        +-----------------------------+
| Chrome Extension (MV3)   | HTTPS  | Next.js App Router          |
|                          +------->| /api/v1/*                   |
| - content script         | Bearer |                             |
| - Shadow-DOM toolbar     | token  | - Supabase Auth + RLS       |
| - visual element picker  |        | - AI SDK structured output  |
| - page-rule engine       |        | - Vercel AI Gateway support |
| - service worker proxy   |        | - Vercel Blob screenshots   |
+--------------------------+        +--------------+--------------+
                                                  |
                                                  v
                                      +---------------------------+
                                      | Supabase Postgres         |
                                      | objects, rules, tokens    |
                                      +---------------------------+
```

The split keeps credentials out of page contexts, gives the dashboard and extension the same backend, and keeps saved browser activity queryable through Supabase.

## API reference

All API routes live under `/api/v1/*`. Extension routes require:

```http
Authorization: Bearer <workspace-token>
```

| Route | Purpose |
| --- | --- |
| `GET /api/v1/me` | Verify a workspace token. |
| `GET /api/v1/objects` | List saved objects. |
| `POST /api/v1/objects` | Save a page or selected element. |
| `GET /api/v1/objects/:id` | Read a saved object. |
| `PATCH /api/v1/objects/:id` | Update object metadata. |
| `DELETE /api/v1/objects/:id` | Delete a saved object. |
| `POST /api/v1/objects/:id/summarize` | Summarize a saved object. |
| `GET /api/v1/objects/:id/annotations` | List annotations for a saved object. |
| `POST /api/v1/objects/:id/annotations` | Add an annotation. |
| `POST /api/v1/objects/:id/track` | Start tracking object fields and capture an initial snapshot. |
| `DELETE /api/v1/objects/:id/track` | Stop tracking an object. |
| `GET /api/v1/page-rules` | List saved page rules. |
| `POST /api/v1/page-rules` | Create a page rule. |
| `PATCH /api/v1/page-rules/:id` | Update a page rule. |
| `DELETE /api/v1/page-rules/:id` | Delete a page rule. |
| `POST /api/v1/compare` | Compare saved objects. |
| `POST /api/v1/compare-text` | Compare raw selected text snippets. |
| `POST /api/v1/extract` | Extract structured JSON from raw text. |
| `POST /api/v1/extract-object` | Extract structured data from an object-like payload. |
| `POST /api/v1/generalize` | Generate a robust selector for similar elements. |
| `POST /api/v1/summarize` | Stateless summarization. |
| `POST /api/v1/translate` | Stateless translation. |
| `POST /api/v1/rank` | Rank items against a natural-language query. |
| `POST /api/v1/categorize` | Classify one item. |
| `POST /api/v1/derive-categories` | Derive categories from a corpus. |
| `POST /api/v1/customize` | Generate selector and page-rule configuration from a description. |
| `POST /api/v1/visual-search` | Run visual search over supplied page context. |
| `POST /api/v1/grammar-check` | Check and revise text. |
| `POST /api/v1/screenshot` | Render and store a screenshot. |
| `GET /api/v1/blob/get` | Stream stored Blob assets through the app. |

## Page rules

A page rule is a small JSON document that tells the content script which page to match, which elements to target, and which action to apply.

```jsonc
{
  "id": "rule_abc",
  "match": { "url": "https://news.ycombinator.com/*" },
  "scope": "all",
  "selector": ".athing",
  "pattern": { "elements": [] },
  "kind": "rank",
  "config": { "query": "AI startups raising in healthcare" }
}
```

Rules are structural rather than purely text-based, so they are designed to survive common SPA updates, infinite scroll insertions, and minor markup changes.

## Security notes

- Workspace tokens are stored in `chrome.storage.local`.
- Tokens are held by the extension service worker, not the page content script.
- Supabase Row-Level Security is enabled on user-owned tables.
- Server-side service role access stays in API routes only.
- Inputs are validated with Zod before AI and database operations.
- User-supplied provider keys are forwarded only to the selected provider path.

Do not commit `.env.local`, service role keys, provider API keys, or workspace tokens.

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js development server. |
| `pnpm build` | Build the production app. |
| `pnpm start` | Start the production build. |
| `pnpm lint` | Run ESLint. |

Recommended local workflow:

1. Start the dashboard with `pnpm dev`.
2. Load or reload the unpacked extension from `chrome://extensions`.
3. Use the extension options page to point at [localhost](http://localhost:3000).
4. Run `pnpm lint` before opening a pull request.

## Deployment

The app is designed for Vercel:

1. Create a Supabase project and run the SQL files in `scripts/`.
2. Create or connect a Vercel Blob store.
3. Add the required environment variables in Vercel project settings.
4. Deploy the Next.js app.
5. Update the Chrome extension options to use the deployed app URL.

The current hosted deployment is available at the [live app](https://v0-web-action-layer.vercel.app/).

## Contributing

Pull requests are welcome. Useful areas include:

- New page-rule kinds such as bookmark, redact, vote, or webhook.
- Site-specific selector packs for common marketplaces, job boards, and content feeds.
- Additional provider integrations.
- More robust migration and test coverage around saved objects, page rules, and token flows.

Keep changes scoped, document new environment variables, and update this README when setup or runtime behavior changes.

## License

MIT.

## Keywords

`ai-agent`, `browser-agent`, `chrome-extension`, `manifest-v3`, `web-automation`, `structured-extraction`, `llm-tools`, `openai`, `anthropic`, `vercel-ai-sdk`, `nextjs`, `react`, `supabase`, `postgres`, `tailwindcss`, `shadcn-ui`, `vercel-blob`, `shadow-dom`, `mutation-observer`, `page-rules`, `semantic-filter`, `semantic-rank`, `ai-comparison`, `change-tracking`, `market-intelligence`, `rag-ingestion`
