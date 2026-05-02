"use client"

// ObjectPostCard — single unified card for a saved object.
//
// This card is the ONLY hero element on the detail page. It replaces
// what used to be three separate sections (Screenshot, Post card,
// Live snapshot) with one cohesive component:
//
//   1. The captured Vercel-Blob screenshot is the card's thumbnail.
//      We deliberately do not show a placeholder when no screenshot
//      exists — a card without a thumbnail is just a tighter card.
//   2. The body renders the LLM-cleaned fields from the new
//      `/api/v1/extract-object` route (`media.extracted`). When that
//      payload is missing (older saves, or the LLM round-trip failed),
//      we fall back to the deterministic media-2 fields.
//   3. A "Show original snapshot" toggle reveals the sandboxed live
//      iframe inline at the bottom of the same card. One element, one
//      card, one frame for the user to scan.
//
// Apple-flavored LinkedIn aesthetic: white surface, 18px radius, soft
// layered shadow, system font, hashtag highlighting in LinkedIn blue.

import { useEffect, useRef, useState } from "react"
import {
  ThumbsUp,
  MessageCircle,
  Repeat2,
  Send,
  Star,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Globe2,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────

/** LLM-cleaned record produced by /api/v1/extract-object. */
export type ExtractedObject = {
  kind: "product" | "post" | "article" | "video" | "profile" | "comment" | "generic"
  title: string
  subtitle: string | null
  description: string
  bodyText: string | null
  brand: string | null
  price: string | null
  priceCurrency: string | null
  rating: number | null
  reviewCount: number | null
  authorName: string | null
  authorHandle: string | null
  publishedAt: string | null
  tags: string[]
}

export type Media2Author = {
  name: string | null
  handle: string | null
  avatar: string | null
  profileUrl: string | null
  verified: boolean | null
}

export type Media2Engagement = {
  likes: number | null
  comments: number | null
  shares: number | null
  reposts: number | null
  views: number | null
}

export type Media2Comment = {
  author: string | null
  body: string | null
  timestamp: string | null
  likes: number | null
}

export type Media2 = {
  __schema?: string
  kind?: string | null
  text?: string | null
  authorProfile?: Media2Author | null
  engagement?: Media2Engagement | null
  comments?: Media2Comment[] | null
  timestamp?: string | null
  site?: string | null
  images?: { url: string; alt?: string }[] | null
  videos?: { url: string | null; poster: string | null }[] | null
  hashtags?: string[] | null
  /** New: clean LLM extraction. Optional for backward-compat. */
  extracted?: ExtractedObject | null
}

// ── Constants ────────────────────────────────────────────────────────

const ACCENT = "#0a66c2" // LinkedIn blue. Single brand accent.
const ACCENT_SOFT = "rgba(10,102,194,0.08)"

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ""
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

function relativeTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^\d{4}-/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return trimmed
  const diff = Date.now() - d.getTime()
  const m = Math.round(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.round(h / 24)
  if (days < 30) return `${days}d`
  return d.toLocaleDateString()
}

function initialsFor(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : parts[0][1] || ""
  return (first + last).toUpperCase()
}

/** Render a body text with #hashtags and @mentions linkified. */
function HighlightedText({ text }: { text: string }) {
  const tokens = text.split(/((?:^|\s)[#@][\p{L}0-9_]{2,40})/gu)
  return (
    <>
      {tokens.map((t, i) => {
        const m = t.match(/^(\s?)([#@][\p{L}0-9_]{2,40})$/u)
        if (m) {
          return (
            <span key={i}>
              {m[1]}
              <span style={{ color: ACCENT, fontWeight: 500 }}>{m[2]}</span>
            </span>
          )
        }
        return (
          <span key={i}>
            {t.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </span>
        )
      })}
    </>
  )
}

/** Render the 0-5 star rating as filled stars. */
function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value))
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = v >= i + 1
        const half = !filled && v >= i + 0.5
        return (
          <Star
            key={i}
            className="h-3.5 w-3.5"
            strokeWidth={1.5}
            fill={filled ? "#f5a623" : half ? "url(#half-star)" : "none"}
            stroke="#f5a623"
          />
        )
      })}
    </span>
  )
}

// ── Inline live snapshot ─────────────────────────────────────────────

/** Same sandboxed iframe behaviour as the old standalone
 *  ObjectLivePreview, embedded inside the post card so the detail page
 *  doesn't need a separate section. Renders only once expanded so the
 *  iframe stays cheap until the user asks for it. */
function InlineLiveSnapshot({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(420)

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!ev.data || typeof ev.data !== "object") return
      if (ev.data.type !== "uwal-iframe-height") return
      if (ev.source !== iframeRef.current?.contentWindow) return
      const h = Number(ev.data.h)
      if (Number.isFinite(h) && h > 0) {
        setHeight(Math.min(4000, Math.max(120, Math.ceil(h))))
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const srcDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<base target="_blank">
<meta name="color-scheme" content="light dark">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 12px; color: #111; }
  body > * { max-width: 100%; }
  img, video, iframe { max-width: 100%; height: auto; }
  a { color: inherit; }
  [data-uwal-pseudo] { display: contents; }
</style>
</head>
<body>
${html}
<script>
  (function () {
    var lastSent = 0;
    function send() {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.offsetHeight
      );
      if (!h || h === lastSent) return;
      lastSent = h;
      try { parent.postMessage({ type: "uwal-iframe-height", h: h }, "*"); } catch (e) {}
    }
    window.addEventListener("load", send);
    if (typeof ResizeObserver === "function") {
      try { new ResizeObserver(send).observe(document.documentElement); } catch (e) {}
    }
    var ticks = 0;
    var t = setInterval(function () {
      send();
      if (++ticks > 8) clearInterval(t);
    }, 120);
  })();
</script>
</body>
</html>`

  return (
    <iframe
      ref={iframeRef}
      title={`Live snapshot of ${title}`}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block w-full border-0"
      style={{ height: `${height}px`, background: "#fafafa" }}
    />
  )
}

// ── Action button ────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-[#f5f5f7]"
      style={{ color: active ? ACCENT : "#6e6e73" }}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// ── Main card ────────────────────────────────────────────────────────

type Props = {
  media: Media2
  /** Original URL — used as the header "Open" link. */
  sourceUrl?: string | null
  /** Vercel-Blob pathname for the captured screenshot. We proxy
   *  through /api/v1/blob/get for auth. */
  screenshotPath?: string | null
  /** Captured HTML — toggles into the inline snapshot panel. */
  html?: string | null
}

export function ObjectPostCard({ media, sourceUrl, screenshotPath, html }: Props) {
  const [showSnapshot, setShowSnapshot] = useState(false)

  const ex = media.extracted ?? null

  // Author. Prefer LLM-cleaned authorName/handle, fall back to
  // media-2's structured `authorProfile`.
  const authorName = ex?.authorName || media.authorProfile?.name || null
  const authorHandle = ex?.authorHandle || media.authorProfile?.handle || null
  const authorAvatar = media.authorProfile?.avatar || null
  const authorVerified = !!media.authorProfile?.verified
  const authorProfileUrl = media.authorProfile?.profileUrl || null

  // Title / subtitle / description.
  const title = ex?.title || authorName || ""
  const subtitle = ex?.subtitle || authorHandle || media.site || null
  const description = ex?.description || ""
  const bodyText = ex?.bodyText || media.text || null

  // Engagement (deterministic; LLM doesn't extract these).
  const eng = media.engagement || null
  const likes = eng?.likes ?? null
  const commentsCount = eng?.comments ?? null
  const shares = eng?.shares ?? null
  const reposts = eng?.reposts ?? null

  // Tags: prefer LLM, else hashtags from the body.
  const tags = ex?.tags && ex.tags.length > 0 ? ex.tags : media.hashtags || []

  // Hero thumbnail. Screenshot beats first captured image; if neither,
  // we render no hero block at all.
  const heroSrc = screenshotPath
    ? `/api/v1/blob/get?path=${encodeURIComponent(screenshotPath)}`
    : media.images && media.images.length > 0
      ? media.images[0].url
      : null
  const heroIsScreenshot = !!screenshotPath

  const ts = relativeTime(ex?.publishedAt || media.timestamp)
  const initials = initialsFor(authorName || title)
  const hasProductFacts = !!(ex?.price || typeof ex?.rating === "number" || ex?.brand)
  const comments = media.comments ?? []

  return (
    <div className="flex w-full justify-center">
      <article
        className="w-full max-w-[640px] overflow-hidden rounded-[18px] bg-white"
        style={{
          fontFamily:
            "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          color: "#1d1d1f",
          border: "0.5px solid rgba(0,0,0,0.07)",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.04)",
        }}
      >
        {/* Half-star gradient for partial ratings. */}
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            <linearGradient id="half-star" x1="0" x2="1" y1="0" y2="0">
              <stop offset="50%" stopColor="#f5a623" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3.5">
          <div className="relative shrink-0">
            {authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={authorAvatar || "/placeholder.svg"}
                alt={authorName ?? "Author avatar"}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full text-[17px] font-medium tracking-tight text-white"
                style={{
                  background: `linear-gradient(135deg, ${ACCENT} 0%, #005885 100%)`,
                }}
              >
                {initials}
              </div>
            )}
            {authorName ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full"
                style={{
                  background: "#34C759",
                  border: "2px solid #ffffff",
                }}
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {authorProfileUrl ? (
                <a
                  href={authorProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[15px] font-semibold leading-tight tracking-tight hover:underline"
                  style={{ color: "#1d1d1f", letterSpacing: "-0.2px" }}
                >
                  {authorName || title || "Saved object"}
                </a>
              ) : (
                <span
                  className="truncate text-[15px] font-semibold leading-tight tracking-tight"
                  style={{ color: "#1d1d1f", letterSpacing: "-0.2px" }}
                >
                  {authorName || title || "Saved object"}
                </span>
              )}
              {authorVerified ? (
                <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-label="Verified" />
              ) : null}
            </div>

            {subtitle ? (
              <div
                className="mt-0.5 truncate text-[12px] leading-snug"
                style={{ color: "#6e6e73" }}
              >
                {subtitle}
              </div>
            ) : null}

            <div
              className="mt-1 flex items-center gap-1 text-[11px]"
              style={{ color: "#a1a1a6" }}
            >
              <Globe2 className="h-[11px] w-[11px] opacity-55" />
              {ts ? <span>{ts}</span> : <span>saved</span>}
              {ex?.kind && ex.kind !== "generic" ? (
                <>
                  <span aria-hidden>{"·"}</span>
                  <span className="uppercase tracking-wide">{ex.kind}</span>
                </>
              ) : null}
            </div>
          </div>

          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#e5e7eb] px-3 py-1 text-[12px] font-medium text-[#374151] transition hover:border-[#d1d5db] hover:bg-[#f9fafb]"
              aria-label="Open source"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        {/* ── Title (only when distinct from author) ─────────────── */}
        {title && title !== authorName ? (
          <h2 className="px-5 pb-2 text-[18px] font-semibold leading-snug tracking-tight text-balance">
            {title}
          </h2>
        ) : null}

        {/* ── Body / description ─────────────────────────────────── */}
        {bodyText ? (
          <div className="px-5 pb-3">
            <p
              className="text-[14.5px] leading-[1.65]"
              style={{ color: "#1d1d1f", letterSpacing: "-0.1px" }}
            >
              <HighlightedText
                text={bodyText.length > 1200 ? bodyText.slice(0, 1200).trimEnd() + "…" : bodyText}
              />
            </p>
          </div>
        ) : description ? (
          <p
            className="px-5 pb-3 text-[14.5px] leading-[1.65]"
            style={{ color: "#374151", letterSpacing: "-0.1px" }}
          >
            {description}
          </p>
        ) : null}

        {/* ── Product facts (price + rating + brand) ─────────────── */}
        {hasProductFacts ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-3">
            {ex?.price ? (
              <span className="text-[18px] font-semibold tracking-tight">{ex.price}</span>
            ) : null}
            {typeof ex?.rating === "number" ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-[#374151]">
                <Stars value={ex.rating} />
                <span className="font-medium">{ex.rating.toFixed(1)}</span>
                {typeof ex.reviewCount === "number" ? (
                  <span className="text-[#6b7280]">({fmt(ex.reviewCount)})</span>
                ) : null}
              </span>
            ) : null}
            {ex?.brand ? (
              <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[12px] font-medium text-[#374151]">
                {ex.brand}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* ── Tag pills ──────────────────────────────────────────── */}
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-5 pb-3">
            {tags.slice(0, 8).map((t) => (
              <span
                key={t}
                className="rounded-[20px] px-2.5 py-1 text-[12px] font-medium"
                style={{
                  color: ACCENT,
                  background: ACCENT_SOFT,
                  letterSpacing: "-0.1px",
                }}
              >
                #{String(t).replace(/^#/, "")}
              </span>
            ))}
          </div>
        ) : null}

        {/* ── Hero thumbnail (screenshot or first captured image) ── */}
        {heroSrc ? (
          <a
            href={heroSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[#f4f5f7]"
            aria-label={heroIsScreenshot ? "Open captured screenshot" : "Open image"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroSrc || "/placeholder.svg"}
              alt={title || "Saved thumbnail"}
              className="block h-auto w-full"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </a>
        ) : null}

        {/* ── Reactions row ──────────────────────────────────────── */}
        {(likes != null || commentsCount != null || shares != null || reposts != null) ? (
          <div
            className="flex items-center justify-between px-5 py-2.5"
            style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <div className="flex items-center">
              <div className="flex items-center">
                {["👍", "❤️", "🎉"].map((emoji, i) => (
                  <span
                    key={i}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                    style={{
                      background: "#f5f5f7",
                      border: "1.5px solid #ffffff",
                      marginLeft: i === 0 ? 0 : "-5px",
                    }}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
              {likes != null ? (
                <span className="ml-2 text-[12.5px]" style={{ color: "#6e6e73" }}>
                  {fmt(likes)} reactions
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-[12.5px]" style={{ color: "#6e6e73" }}>
              {commentsCount != null ? <span>{fmt(commentsCount)} comments</span> : null}
              {reposts != null ? <span>{fmt(reposts)} reposts</span> : null}
              {shares != null ? <span>{fmt(shares)} shares</span> : null}
            </div>
          </div>
        ) : null}

        {/* ── Actions bar ────────────────────────────────────────── */}
        <div
          className="flex items-center justify-around px-3 py-1.5"
          style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
        >
          <ActionButton icon={ThumbsUp} label="Like" active />
          <ActionButton icon={MessageCircle} label="Comment" />
          <ActionButton icon={Repeat2} label="Repost" />
          <ActionButton icon={Send} label="Share" />
        </div>

        {/* ── Comment composer ───────────────────────────────────── */}
        <div
          className="flex items-center gap-2.5 px-5 py-3.5"
          style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-white"
            style={{
              background: "linear-gradient(135deg, #5856d6 0%, #3634a3 100%)",
            }}
          >
            {initials.slice(0, 2)}
          </div>
          <input
            type="text"
            placeholder="Add a comment…"
            className="w-full rounded-[20px] px-3.5 py-2 text-[13.5px] outline-none transition-colors"
            style={{
              background: "#f5f5f7",
              border: "0.5px solid rgba(0,0,0,0.07)",
              color: "#6e6e73",
              letterSpacing: "-0.1px",
            }}
          />
        </div>

        {/* ── Top comments ───────────────────────────────────────── */}
        {comments.length > 0 ? (
          <div
            className="flex flex-col gap-2 px-5 pb-4 pt-1"
            style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            {comments.slice(0, 4).map((c, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 rounded-[14px] p-3"
                style={{ background: "#f5f5f7" }}
              >
                {c.author ? (
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "#1d1d1f", letterSpacing: "-0.1px" }}
                  >
                    {c.author}
                    {c.timestamp ? (
                      <span className="ml-1.5 font-normal" style={{ color: "#a1a1a6" }}>
                        {" · "}
                        {relativeTime(c.timestamp)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {c.body ? (
                  <span className="text-[13px] leading-snug" style={{ color: "#1d1d1f" }}>
                    {c.body}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Live-snapshot toggle (collapsible inline) ──────────── */}
        {html && html.length > 0 ? (
          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}>
            <button
              type="button"
              onClick={() => setShowSnapshot((s) => !s)}
              className="flex w-full items-center justify-between gap-2 px-5 py-3 text-[13px] font-medium text-[#374151] transition hover:bg-[#f9fafb]"
              aria-expanded={showSnapshot}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: showSnapshot ? "#34C759" : "#a1a1a6" }}
                  aria-hidden
                />
                {showSnapshot ? "Hide original snapshot" : "Show original snapshot"}
              </span>
              {showSnapshot ? (
                <ChevronUp className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden />
              )}
            </button>
            {showSnapshot ? (
              <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}>
                <InlineLiveSnapshot html={html} title={title || "saved object"} />
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  )
}
