// Renders a saved-object screenshot stored in Vercel Blob (private store).
//
// `url` is actually the blob pathname (e.g. `screenshots/<userId>/<uuid>.jpg`)
// not a public URL — we stream it through `/api/v1/blob/get` which checks
// the dashboard user's session and confirms the path prefix matches their
// own user id before returning the bytes. This keeps screenshots fully
// private even though the dashboard is rendered server-side from cookies.
//
// We deliberately render with a plain <img> rather than next/image: the
// blob proxy already returns a properly compressed JPEG at the right size,
// and we want the image to display at its captured aspect ratio without any
// layout-shift gymnastics.

type Props = {
  url: string
  title: string
}

export function ObjectScreenshot({ url, title }: Props) {
  const proxied = `/api/v1/blob/get?path=${encodeURIComponent(url)}`
  return (
    <a
      href={proxied}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied || "/placeholder.svg"}
        alt={`Screenshot of ${title}`}
        className="block h-auto w-full"
        loading="lazy"
        decoding="async"
      />
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
        Open full size
      </span>
    </a>
  )
}
