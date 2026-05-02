# UWAL — Chrome Extension (MV3)

The UWAL extension augments any web page with a universal action layer:
**Save · Compare · Track · Annotate · Summarize · Extract**.

It is a plain JavaScript Manifest V3 extension — **no build step**. Load it
unpacked from this `extension/` directory.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, commands |
| `background.js` | Service worker — owns config + all API calls |
| `content.js` | Injects a Shadow-DOM toolbar + visual selector on every page |
| `popup.html` / `popup.js` / `popup.css` | Browser-action popup |
| `options.html` / `options.js` / `options.css` | Settings page (API URL + token) |

## Installing (development)

1. Deploy the Next.js dashboard (or run it locally with `pnpm dev`).
2. In the dashboard, go to **Settings → Workspace tokens** and create a token.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**.
4. Pick the `extension/` folder.
5. Open the extension's **Options** page, paste your dashboard URL (e.g.
   `https://your-uwal-app.vercel.app`) and the workspace token.
6. Click **Test connection** → **Save**.

> Tip: Chrome will use a default puzzle-piece icon. Drop PNGs into
> `extension/icons/` (16, 32, 48, 128) and reference them from `manifest.json`
> under `"action.default_icon"` and `"icons"` if you want a branded icon.

## Using it

- Click the toolbar icon → **Save this page**, **Extract structured data**,
  **Summarize**, or **Pick element on page**.
- Or press **Alt+U** anywhere to toggle the floating UWAL pill in the
  bottom-right of the page. Click it to enter selection mode and pick any
  element to act on.
- Use **`[`** / **`]`** while picking to contract / expand the selection.
- Click an element → choose **Save**, **Extract structure**, **Summarize**,
  **Annotate**, **Track changes**, or **Compare with…**.

## How it talks to the backend

The content script never calls your API directly — it sends typed messages
to the background service worker, which adds the `Authorization: Bearer <token>`
header and forwards to your Next.js routes:

- `POST /api/v1/objects` — Save
- `POST /api/v1/objects/:id/summarize` — Summarize (LLM)
- `POST /api/v1/objects/:id/annotations` — Annotate
- `POST /api/v1/objects/:id/track` — Track changes
- `GET  /api/v1/objects?limit=…` — List
- `POST /api/v1/compare` — Compare two or more objects
- `POST /api/v1/extract` — Extract structured fields from raw text (LLM)
- `GET  /api/v1/me` — Verify the token

This split keeps tokens out of page contexts and avoids CORS gymnastics.
