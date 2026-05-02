// GET /api/v1/blob/get?path=screenshots/<userId>/<uuid>.jpg
//
// Streams a private Vercel Blob to authenticated dashboard users. The
// pathname must be prefixed with the caller's own user id so that one user
// can never read another's screenshots — even if they guess a uuid.
//
// We don't allow extension/workspace-token auth here because the dashboard
// uses Supabase session cookies; the screenshot endpoint that produced the
// pathnames already enforces user_id at upload time, so by the time we read
// we just need to verify the session matches the path's prefix.

import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const path = request.nextUrl.searchParams.get("path")
  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 })
  }

  // Per-user prefix check. We allow either `screenshots/<uid>/...` (the
  // current layout) or any future top-level folder so long as the second
  // segment is the caller's id.
  const segments = path.split("/")
  if (segments.length < 3 || segments[1] !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await get(path, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return new NextResponse("Not found", { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    console.log("[v0] blob get failed", err)
    return NextResponse.json({ error: "Failed to read blob" }, { status: 500 })
  }
}
