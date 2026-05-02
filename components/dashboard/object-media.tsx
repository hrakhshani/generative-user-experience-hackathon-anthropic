// Structured "captured contents" view for a saved object.
//
// The extension extracts a stable schema (`media-1`) from the live element
// at save time: links, images, videos, headings, hashtags, mentions, and a
// best-effort author + timestamp. We render those panels here so users get
// a queryable, semantically meaningful representation of the saved item
// even if the screenshot is unavailable.

import Link from "next/link"
import { ExternalLink, Heading, Image as ImageIcon, Link as LinkIcon, User, Clock, Hash, AtSign, Film } from "lucide-react"

export type MediaLink = { url: string; text: string }
export type MediaImage = { url: string; alt: string; width: number | null; height: number | null }
export type MediaVideo = { url: string | null; poster: string | null }
export type MediaEmbed = { url: string; title: string | null }
export type MediaHeading = { level: number; text: string }

export type Media = {
  __schema?: string
  text?: string
  headings?: MediaHeading[]
  links?: MediaLink[]
  images?: MediaImage[]
  videos?: MediaVideo[]
  embeds?: MediaEmbed[]
  hashtags?: string[]
  mentions?: string[]
  author?: string | null
  timestamp?: string | null
}

function PanelTitle({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {typeof count === "number" ? <span className="ml-1 text-muted-foreground/60">({count})</span> : null}
      </p>
    </div>
  )
}

export function ObjectMedia({ media }: { media: Media }) {
  const headings = media.headings ?? []
  const links = media.links ?? []
  const images = media.images ?? []
  const videos = media.videos ?? []
  const embeds = media.embeds ?? []
  const hashtags = media.hashtags ?? []
  const mentions = media.mentions ?? []

  // If literally every section is empty there's nothing to show.
  const hasAny =
    headings.length ||
    links.length ||
    images.length ||
    videos.length ||
    embeds.length ||
    hashtags.length ||
    mentions.length ||
    media.author ||
    media.timestamp
  if (!hasAny) return null

  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Captured contents</p>

      {(media.author || media.timestamp) && (
        <div className="flex flex-wrap items-center gap-2">
          {media.author ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs">
              <User className="h-3 w-3 text-muted-foreground" />
              {media.author}
            </span>
          ) : null}
          {media.timestamp ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {formatTimestamp(media.timestamp)}
            </span>
          ) : null}
        </div>
      )}

      {headings.length > 0 && (
        <div className="rounded-lg border border-border bg-background p-4">
          <PanelTitle icon={Heading} label="Headings" count={headings.length} />
          <ul className="mt-2 flex flex-col gap-1">
            {headings.map((h, i) => (
              <li key={i} className="text-sm text-foreground" style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                <span className="mr-2 font-mono text-xs text-muted-foreground">h{h.level}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {images.length > 0 && (
        <div className="rounded-lg border border-border bg-background p-4">
          <PanelTitle icon={ImageIcon} label="Images" count={images.length} />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {images.map((img, i) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block overflow-hidden rounded-md border border-border bg-muted/30"
                title={img.alt || img.url}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url || "/placeholder.svg"}
                  alt={img.alt}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-square h-auto w-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {(videos.length > 0 || embeds.length > 0) && (
        <div className="rounded-lg border border-border bg-background p-4">
          <PanelTitle icon={Film} label="Video & embeds" count={videos.length + embeds.length} />
          <ul className="mt-2 flex flex-col gap-2">
            {videos.map((v, i) => (
              <li key={`v${i}`} className="flex items-center gap-2 text-sm">
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">video</span>
                {v.url ? (
                  <Link href={v.url} target="_blank" className="break-all text-foreground hover:underline">
                    {v.url}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">(inline player)</span>
                )}
              </li>
            ))}
            {embeds.map((e, i) => (
              <li key={`e${i}`} className="flex items-center gap-2 text-sm">
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">embed</span>
                <Link href={e.url} target="_blank" className="break-all text-foreground hover:underline">
                  {e.title || e.url}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div className="rounded-lg border border-border bg-background p-4">
          <PanelTitle icon={LinkIcon} label="Links" count={links.length} />
          <ul className="mt-2 flex flex-col gap-1.5">
            {links.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-col gap-0.5"
                >
                  <span className="truncate text-foreground hover:underline">
                    {l.text || l.url}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{l.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(hashtags.length > 0 || mentions.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {hashtags.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-4">
              <PanelTitle icon={Hash} label="Hashtags" count={hashtags.length} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hashtags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mentions.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-4">
              <PanelTitle icon={AtSign} label="Mentions" count={mentions.length} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mentions.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    @{m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function formatTimestamp(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  // ISO 8601 → human-readable; fall through if not parseable so we still
  // render the original string (e.g. relative "3h ago" labels from X).
  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime()) && /^\d{4}-/.test(trimmed)) {
    return d.toLocaleString()
  }
  return trimmed
}
