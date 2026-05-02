# UWAL — Universal Web Action Layer

> 🧠 **An AI-native action layer for the entire web.** Save, compare, track, annotate, summarize, translate, rank, filter, and extract structured data from *any* page — with rules that re-apply automatically every time you visit.

![Demo](./demo.gif)

<p align="center">
  <em>Chrome Extension (MV3) &nbsp;·&nbsp; Next.js 16 dashboard &nbsp;·&nbsp; Supabase &nbsp;·&nbsp; AI SDK 6 &nbsp;·&nbsp; OpenAI / Anthropic / Vercel AI Gateway</em>
</p>

<p align="center">
  <img alt="Stack" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase">
  <img alt="AI SDK" src="https://img.shields.io/badge/AI%20SDK-6-000">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-MV3-4285f4?logo=googlechrome">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## ✨ Why UWAL?

Today, every product team that wants to *do something useful* on top of someone else's web page builds **the same thing from scratch**: a content script, an MV3 service worker, an LLM proxy, a Supabase auth flow, a "remember the selector for next time" engine. UWAL is that platform — open, tokenable, AI-native, and yours to host.

> 💼 **For enterprise & big tech:** UWAL is a **horizontal browser-side action layer** with strong primitives for **structured extraction**, **semantic ranking**, **semantic filtering**, **change tracking**, and **multi-item AI comparison** — the building blocks of modern browser agents, vertical sales-tools, e-commerce co-pilots, market intelligence, RAG ingestion, and competitive monitoring. Drop it into a workspace, get a fleet-ready browser action layer with audit trails, RLS, and per-user keys.

---

## 🚀 What you get out of the box

| | |
|---|---|
| 💾 **Universal Save** | One click captures any element or full page as a structured object (DOM + screenshot + clean text). |
| 🧩 **Visual Element Picker** | Hover-and-click to select any card, row, or section. `[` / `]` to widen / narrow scope. |
| 🪄 **AI Page Rules** | Save a rule once → it re-runs every time you visit that page. Rules survive React re-renders & infinite scroll. |
| 🧠 **Semantic Filter** | "Hide everything that isn't a senior backend role" — applied to the live DOM in milliseconds. |
| 🏆 **Semantic Rank** | "Rank these listings by closest to the beach" — adds a numeric chip to each match. |
| 📊 **AI Comparison Tables** | Tick 2–8 cards with a checkbox → get a side-by-side comparison **table + verdict + top pick**, in ~2s. |
| 📝 **Summarize / Translate** | Per-card buttons that swap content in-place with one click. |
| 🛰️ **Change Tracking** | Snapshot any element, get notified when its content drifts. |
| 🗂️ **Structured Extraction** | LLM-powered "give me JSON of every product on this listing page". |
| 🏷️ **Annotate** | Highlight, comment, and tag any region of any page. |
| 🔐 **Per-user API tokens** | Workspace tokens with Supabase RLS — bring-your-own-key OpenAI / Anthropic supported. |

---

## 🎬 How it feels

```
1.  Visit a job board, product listing, news feed — anything with cards.
2.  Press Alt+U → the UWAL pill appears.
3.  Click a card → "All similar?" → choose an action:
       Filter  ·  Rank  ·  Summarize  ·  Translate  ·  Save  ·  Compare
4.  The rule is saved. Next time you load that page, it just runs.
```

**Compare flow** (the headline feature):

```
[ ] Card 1     [ ] Card 2     [✓] Card 3     [✓] Card 4     [✓] Card 5
                                                                   │
                                          ┌────────────────────────┘
                                          ▼
                          ┌──────────────────────────────────┐
                          │  Compare · 3 selected            │
                          │  [ Clear ]   [ Compare → ]       │
                          └──────────────────────────────────┘
                                          │
                                          ▼
                  ╔════════════════════════════════════════════╗
                  ║  Comparison · 3 items   gpt-4o-mini        ║
                  ╠══════╦══════════╦═════════╦════════════════╣
                  ║ Item ║  Price   ║ Weight  ║  Battery       ║
                  ╠══════╬══════════╬═════════╬════════════════╣
                  ║ A    ║  $129    ║  245 g  ║  18 h     🏆   ║
                  ║ B    ║  $159    ║  280 g  ║  22 h          ║
                  ║ C    ║  $99     ║  210 g  ║  12 h          ║
                  ╚══════╩══════════╩═════════╩════════════════╝
                  Verdict: A is the best balance of price & runtime.
```

---

## 🏗️ Architecture

```
┌──────────────────────────┐         ┌─────────────────────────────┐
│  Chrome Extension (MV3)  │ ───────▶│  Next.js 16 App Router      │
│                          │  HTTPS  │  /api/v1/*                  │
│  • content.js            │  Bearer │                             │
│    Shadow-DOM toolbar    │  Token  │  • Supabase Auth + RLS      │
│    Visual element picker │         │  • AI SDK 6 + Vercel AI GW  │
│    Page-rule engine      │         │  • OpenAI / Anthropic keys  │
│  • background.js         │         │  • Structured outputs (zod) │
│    Service worker proxy  │         │  • Vercel Blob screenshots  │
│  • options.html          │         │                             │
└──────────────────────────┘         └─────────────────────────────┘
            │                                       │
            └────── Page rules persist ─────────────┤
            └────── Saved objects persist ──────────┤
                          ▼                         ▼
                    ┌──────────────────────────────────┐
                    │  Supabase Postgres (RLS-secured) │
                    └──────────────────────────────────┘
```

**Why this split?**

- 🔒 **Tokens never touch page context** — the content script only speaks to the service worker, which holds the token and signs requests.
- 🧱 **Same backend for web dashboard and extension** — every action you take in the browser is mirrored in the dashboard, queryable, and auditable.
- 🧠 **One LLM gateway** — switch between OpenAI direct, Anthropic direct, and the Vercel AI Gateway by setting (or unsetting) headers. No code changes.

---

## 📦 Tech stack

- **Frontend / Dashboard** — Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, Recharts
- **Auth & DB** — Supabase (SSR + RLS) via `@supabase/ssr`
- **AI** — [AI SDK 6](https://ai-sdk.dev) with `generateObject` for structured output, Vercel AI Gateway by default, optional bring-your-own OpenAI / Anthropic keys
- **Models** — `gpt-4o-mini` (fast non-reasoning, used for comparison), `gpt-5` / `claude-opus-4-5` (smart tier), `claude-3-5-haiku` (nano tier)
- **Storage** — Vercel Blob for screenshots
- **Extension** — Chrome MV3, plain ES modules, no build step, Shadow-DOM injection

---

## 🔧 Quick start

### 1. Clone & install

```bash
git clone https://github.com/your-org/uwal.git
cd uwal
pnpm install
```

### 2. Set environment variables

Create `.env.local`:

```bash
# Supabase (auth + DB)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI (one of: gateway OR direct keys)
AI_GATEWAY_API_KEY=...        # Vercel AI Gateway (recommended)
# OPENAI_API_KEY=...          # optional
# ANTHROPIC_API_KEY=...       # optional

# Vercel Blob (screenshots)
BLOB_READ_WRITE_TOKEN=...
```

### 3. Run the dashboard

```bash
pnpm dev
```

Open <http://localhost:3000>, sign up, and create a **workspace token** in **Settings**.

### 4. Load the Chrome extension

1. Go to `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → pick the `extension/` folder
3. Open the extension's **Options** page → paste your dashboard URL + token
4. Click **Test connection** → **Save**
5. Press **`Alt+U`** on any web page 🎉

---

## 🧪 API reference (high-level)

All routes live under `/api/v1/*` and require a `Authorization: Bearer <token>` header.

| Route | Purpose |
|---|---|
| `POST /api/v1/objects` | Save a page or element |
| `GET  /api/v1/objects` | List saved objects |
| `POST /api/v1/objects/:id/summarize` | Summarize a saved object |
| `POST /api/v1/objects/:id/annotations` | Add an annotation |
| `POST /api/v1/objects/:id/track` | Snapshot for change detection |
| `POST /api/v1/extract` | Extract structured JSON from raw text |
| `POST /api/v1/summarize` | Stateless summarization |
| `POST /api/v1/translate` | Stateless translation |
| `POST /api/v1/categorize` | Classify an item into a category |
| `POST /api/v1/derive-categories` | Derive a category set from a corpus |
| `POST /api/v1/rank` | Score items against a natural-language query |
| `POST /api/v1/compare` | Compare *saved* objects |
| `POST /api/v1/compare-text` | **Stateless side-by-side comparison** (table + verdict) |
| `POST /api/v1/customize` | Generate a CSS selector + Page Rule from a description |
| `POST /api/v1/screenshot` | Render and store a screenshot in Vercel Blob |
| `GET  /api/v1/page-rules` | List page rules for the current user |
| `POST /api/v1/page-rules` | Create a page rule (`filter`, `rank`, `summarize`, `translate`, `save_button`, `compare`, …) |
| `GET  /api/v1/me` | Verify the token |

---

## 🧠 The Page Rule engine

A **page rule** is a tiny JSON document that tells the content script:

> "On this URL pattern, find these elements (selector or AI-derived pattern), then do X to each one."

```jsonc
{
  "id": "rule_abc",
  "match": { "url": "https://news.ycombinator.com/*" },
  "scope": "all",                    // single match or every similar element
  "selector": ".athing",             // optional CSS hint
  "pattern": { "elements": [...] },  // AI-derived structural fingerprint
  "kind": "rank",                    // badge | hide | outline | note | save_button
                                     // | translate | filter | summarize | rank | compare
  "config": { "query": "AI startups raising in healthcare" }
}
```

- 🪞 **Pattern matching is structural, not text-based** — it survives React re-renders, lazy loading, and minor markup changes.
- 🧱 **Rules compose** — multiple rules can target the same page (filter + rank + compare on a job board, for example).
- 🔁 **MutationObserver-driven** — newly inserted DOM (infinite scroll, SPA navigation) gets the same treatment instantly.

---

## ⚡ Performance tips

- The **comparison endpoint is pinned to `gpt-4o-mini`** for ~2s structured-table latency, instead of reasoning models which take 15–30s for the same shape of output.
- **Bring your own OpenAI key** in extension **Options** to bypass the AI Gateway entirely (cheapest + fastest path).
- The extension's content script is wrapped in a **Shadow-DOM** so site CSS can't break it, and uses `position: relative` + `overflow: visible` fixups so injected UI shows on `overflow: hidden` cards (Nike-style product grids, LinkedIn posts, etc.).

---

## 🛡️ Security

- ✅ Workspace tokens stored only in the extension's `chrome.storage.local`, never in page contexts
- ✅ Supabase **Row-Level Security** on every table
- ✅ Bring-your-own LLM keys forwarded only to the resolved provider (OpenAI / Anthropic / Gateway)
- ✅ Service worker is the **only** thing that knows the token — the content script can't exfiltrate it
- ✅ Parameterized queries, zod-validated inputs, structured outputs

---

## 🗺️ Roadmap

- [ ] Firefox & Edge support (the extension is MV3, mostly works already)
- [ ] Workflow chaining (rule → rule → webhook)
- [ ] Headless / CI mode (run rules without a browser)
- [ ] Team workspaces with shared rule libraries
- [ ] On-page chat with selected elements as context
- [ ] Browser-agent SDK (give an agent the same primitives the user has)

---

## 🤝 Contributing

PRs welcome! Especially:

- New page-rule kinds (`vote`, `bookmark`, `redact`, …)
- Site-specific selector packs (eBay, Zillow, Indeed, …)
- Provider integrations beyond OpenAI / Anthropic

```bash
pnpm dev          # run dashboard
pnpm lint         # eslint
# Extension has no build step — just reload it from chrome://extensions
```

---

## 📜 License

MIT. Built with care; ship freely.

---

## 🔎 Keywords

> *(here for GitHub discoverability — yes, hi recruiter 👋)*

`ai-agent` · `browser-agent` · `chrome-extension` · `manifest-v3` · `mv3` · `web-automation` · `web-scraping` · `structured-extraction` · `llm-tools` · `openai` · `anthropic` · `claude` · `gpt-4o` · `gpt-5` · `vercel-ai-sdk` · `ai-sdk` · `vercel-ai-gateway` · `nextjs` · `next-16` · `react-19` · `supabase` · `postgres` · `rls` · `tailwindcss` · `shadcn-ui` · `vercel-blob` · `userscripts` · `tampermonkey-alternative` · `greasemonkey-alternative` · `dom-rewriting` · `shadow-dom` · `mutation-observer` · `page-rules` · `semantic-filter` · `semantic-rank` · `ai-comparison` · `change-tracking` · `web-monitoring` · `competitive-intelligence` · `market-intelligence` · `rag-ingestion` · `data-extraction` · `e-commerce-tools` · `productivity` · `enterprise-browser`
