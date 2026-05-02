"use client"

// Interactive snapshot of a saved object.
//
// We rebuild the post inside a sandboxed iframe via `srcdoc` so the
// captured HTML — which has fully inlined computed styles, images,
// and links from `extractCapturedHtml` in the extension — renders
// like the real thing without leaking the dashboard's CSS into it.
//
// Why an iframe (rather than just dangerouslySetInnerHTML):
//   1. Style isolation — saved CSS uses class names that almost
//      certainly collide with the dashboard's Tailwind. Wrapping in
//      an iframe gives us a clean document scope.
//   2. Safe rendering — `sandbox` without `allow-same-origin` puts
//      the captured DOM in a unique opaque origin; even if a
//      malicious site sneaks in a tracker, it can't read our cookies
//      or call our APIs.
//   3. Click-to-original — base target=_blank means every link in
//      the snapshot opens the live source in a new tab. Users get a
//      live, clickable saved view.
//
// Auto-sizing: we inject a tiny script into the iframe that posts
// `{ type: "uwal-iframe-height", h }` to the parent on load and on
// any resize. The parent listens and updates the iframe's height
// attribute. Without this the iframe would stick at its default
// 150px and clip every saved post.

import { useEffect, useRef, useState } from "react"

type Props = {
  html: string
  /** Title used for the iframe's accessible name. */
  title: string
}

export function ObjectLivePreview({ html, title }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Start at a reasonable height so first paint isn't a 0px-tall blank.
  // Updated on every uwal-iframe-height message from the iframe child.
  const [height, setHeight] = useState(420)

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!ev.data || typeof ev.data !== "object") return
      if (ev.data.type !== "uwal-iframe-height") return
      // Source check: must be our own iframe's contentWindow. Any other
      // origin posting this exact message shape would be ignored. We
      // can't check `ev.origin === "null"` reliably across browsers, so
      // we compare windows instead.
      if (ev.source !== iframeRef.current?.contentWindow) return
      const h = Number(ev.data.h)
      if (Number.isFinite(h) && h > 0) {
        // Cap at 4000px so a runaway capture doesn't produce an
        // infinite-scrolling card. Real saved posts are well under
        // this, even with comments.
        setHeight(Math.min(4000, Math.max(120, Math.ceil(h))))
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Wrap the captured HTML with:
  //   - <base target="_blank"> so every link opens the live page
  //   - body padding + a system font fallback so isolated snippets
  //     (raw cards without their parent layout) still look okay
  //   - tiny resize-observer script that posts height to the parent
  //
  // We MUST not introduce dangerous attributes here; the captured
  // HTML was already sanitized in the extension (no <script>, no
  // event handlers — see captureHtml's STRIP_TAGS).
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
  /* Make sure the captured root doesn't overflow horizontally even
     if its inline width was wider than the live container. */
  [data-uwal-pseudo] { display: contents; }
</style>
</head>
<body>
${html}
<script>
  // Posts the document's scrollHeight up to the parent on load and on
  // any subsequent layout change. ResizeObserver covers font-load,
  // image-decode, and srcset switching; the load handler covers the
  // initial paint. Both messages are gated to non-zero heights so the
  // parent never sees a transient 0 and collapse the frame.
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
      try {
        parent.postMessage({ type: "uwal-iframe-height", h: h }, "*");
      } catch (e) {}
    }
    window.addEventListener("load", send);
    if (typeof ResizeObserver === "function") {
      try { new ResizeObserver(send).observe(document.documentElement); } catch (e) {}
    }
    // Belt + suspenders: a small interval for the first second to catch
    // late image loads that don't trigger ResizeObserver in some engines.
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
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <iframe
        ref={iframeRef}
        title={`Live preview of ${title}`}
        srcDoc={srcDoc}
        // allow-scripts: needed for the inline auto-resize script.
        // We DO NOT add allow-same-origin, so the iframe runs in a
        // unique opaque origin and cannot read our cookies / storage.
        // allow-popups + allow-popups-to-escape-sandbox: lets links
        // with target=_blank actually open in the user's tab.
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        // referrerpolicy keeps the source URL out of clicks for
        // privacy on third-party links.
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-background"
        style={{ height: `${height}px` }}
      />
    </div>
  )
}
