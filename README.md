# UWAL — Universal Web Action Layer

> Turn any website into an AI-powered workspace. Save, compare, track, annotate, summarize, translate, rank, filter, and extract structured data from any page, then re-apply those actions automatically every time you come back.

<p align="center">
  <a href="https://v0-web-action-layer.vercel.app/"><strong>Launch deployed app</strong></a>
  ·
  <a href="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4"><strong>Watch demo video</strong></a>
  ·
  <a href="#-quick-start"><strong>Run locally</strong></a>
</p>

<p align="center">
  <a href="https://v0-web-action-layer.vercel.app/">
    <img alt="Live demo" src="https://img.shields.io/badge/Live%20Demo-Open%20App-111827?style=for-the-badge&logo=vercel">
  </a>
  <a href="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4">
    <img alt="Demo video" src="https://img.shields.io/badge/Demo%20Video-Watch%20MP4-ef4444?style=for-the-badge">
  </a>
</p>

## 🎥 Demo

GitHub and some package registries do not reliably play externally hosted MP4 files inside README HTML. Use the direct video link below if the embedded preview does not render in your viewer.

https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0502-rdhDogYz15ib1Sz47RHWyOUmtc1cja.mp4

**Live deployment:** <https://v0-web-action-layer.vercel.app/>

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

## Contents

- [Demo](#-demo)
- [Why UWAL?](#-why-uwal)
- [What makes it different?](#-what-makes-it-different)
- [What you get out of the box](#-what-you-get-out-of-the-box)
- [Example workflows](#-example-workflows)
- [Quick start](#-quick-start)
- [Architecture](#-architecture)
- [API reference](#-api-reference-high-level)

---

## ✨ Why UWAL?

Most web AI tools stop at chat. UWAL goes further: it lets users point at real page elements, run useful actions on them, and save those actions as repeatable page rules.

Product teams usually rebuild the same browser-side stack every time they need this:

- A content script that can safely understand page structure
- A visual picker for selecting cards, rows, listings, posts, and tables
- An LLM proxy with structured outputs
- A dashboard for saved objects, rules, tokens, and auditability
- A persistence layer that survives reloads, SPAs, React re-renders, and infinite scroll

UWAL packages that into one open, hostable action layer.

> **For enterprise and platform teams:** UWAL is a horizontal browser-side action layer for structured extraction, semantic ranking, semantic filtering, change tracking, and multi-item AI comparison. It gives browser agents, sales tools, e-commerce copilots, market-intelligence workflows, RAG ingestion pipelines, and competitive-monitoring systems the same reliable primitives.

## 🧠 The product in one sentence

UWAL is a programmable browser companion that lets people and agents act on the live web as if every page had an API.

| For users | For teams | For agents |
|---|---|---|
| Turn messy pages into usable workspaces. | Ship browser-side AI workflows without rebuilding the extension/backend stack. | Get stable primitives for selecting, extracting, ranking, comparing, and persisting web context. |

---

## ⚡ What makes it different?

| Capability | Why it matters |
|---|---|
| **Point at anything** | Users work directly on page elements instead of copying text into a chatbot. |
| **Rules that come back** | Save an action once and run it again automatically when the matching page loads. |
| **Element-aware AI** | The extension sends structured element context, not just loose page text. |
| **Side-by-side comparison** | Select 2-8 items and get a table, verdict, and top pick in seconds. |
| **Hostable stack** | Next.js, Supabase, Vercel Blob, AI SDK, and MV3 extension code you control. |
| **BYO model keys** | Use Vercel AI Gateway by default or bring OpenAI / Anthropic keys per user. |

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

## 🧭 Example workflows

| Page type | What UWAL can do |
|---|---|
| Job boards | Filter roles by seniority, rank by fit, compare compensation, save promising listings. |
| Product grids | Compare prices, specs, reviews, delivery times, and return policies across cards. |
| News feeds | Summarize articles, cluster themes, track updates, extract structured claims. |
| Real estate | Rank listings by commute, budget, amenities, neighborhood signals, and tradeoffs. |
| Market research | Extract competitor claims, track page changes, annotate evidence, build RAG-ready records. |

---

## 🕹️ 60-second demo path

1. Open any page with repeated items: jobs, products, apartments, articles, search results.
2. Press `Alt+U` to bring up the UWAL action layer.
3. Select one card, then choose whether to target similar items.
4. Run `Filter`, `Rank`, `Summarize`, `Translate`, `Save`, or `Compare`.
5. Reload the page and watch the saved rule apply again automatically.

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

### Option A: Open the deployed app

Start with the hosted dashboard:

<https://v0-web-action-layer.vercel.app/>

### Option B: Run locally

#### 1. Clone & install

```bash
git clone https://github.com/your-org/uwal.git
cd uwal
pnpm install
```

#### 2. Set environment variables

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

#### 3. Run the dashboard

```bash
pnpm dev
```

Open <http://localhost:3000>, sign up, and create a **workspace token** in **Settings**.

#### 4. Load the Chrome extension

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
