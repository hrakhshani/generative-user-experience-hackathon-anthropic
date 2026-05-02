// POST /api/v1/screenshot
//
// Accepts a base64-encoded PNG of an element snapshot from the extension and
// uploads it to Vercel Blob (private store). The resulting pathname is
// returned to the caller and persisted on the saved object as
// `screenshot_url` — the dashboard streams that pathname through
// /api/v1/blob/get on render.
//
// We keep this route private because saved snapshots can contain personal
// information (DMs, profile data, etc.) and must not be exposed via the
// public Blob URL.

import { put } from "@vercel/blob"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = (await req.json().catch(() => null)) as { dataUrl?: unknown; ext?: unknown } | null
  if (!body || typeof body.dataUrl !== "string") {
    return jsonResponse({ error: "dataUrl required" }, { status: 400 })
  }

  const dataUrl = body.dataUrl
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/)
  if (!match) {
    return jsonResponse({ error: "Expected data:image/{png|jpeg|webp};base64,..." }, { status: 400 })
  }

  const mime = `image/${match[1]}`
  const ext = match[1] === "jpeg" ? "jpg" : match[1]
  const base64 = match[2].replace(/\s+/g, "")

  let buf: Buffer
  try {
    buf = Buffer.from(base64, "base64")
  } catch {
    return jsonResponse({ error: "Could not decode base64 payload" }, { status: 400 })
  }

  // Reject anything bigger than ~12MB after decoding so a misbehaving page
  // can't DoS the blob store. A typical element screenshot is 80–600KB.
  if (buf.byteLength > 12 * 1024 * 1024) {
    return jsonResponse({ error: "Screenshot exceeds 12MB limit" }, { status: 413 })
  }

  const pathname = `screenshots/${auth.userId}/${crypto.randomUUID()}.${ext}`

  // Saved screenshots can contain personal information (DMs, profiles, paid
  // content, etc.) so we use the private blob store. Reads go through the
  // authenticated proxy at /api/v1/blob/get which enforces a per-user path
  // prefix.
  try {
    const blob = await put(pathname, buf, {
      access: "private",
      contentType: mime,
      // Random suffix is unnecessary because we already use a uuid.
      addRandomSuffix: false,
    })
    return jsonResponse({ pathname: blob.pathname })
  } catch (err) {
    console.log("[v0] screenshot upload failed", err)
    const msg = err instanceof Error ? err.message : "Upload failed"
    return jsonResponse({ error: msg }, { status: 500 })
  }
}
