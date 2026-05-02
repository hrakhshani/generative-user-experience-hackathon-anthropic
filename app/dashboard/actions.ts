"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { generateText } from "ai"

async function requireUserId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  return { supabase, userId: user.id }
}

export async function deleteObject(id: string) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("objects").delete().eq("id", id).eq("user_id", userId)
  revalidatePath("/dashboard")
}

export async function addAnnotation(formData: FormData) {
  const { supabase, userId } = await requireUserId()
  const objectId = String(formData.get("object_id") ?? "")
  const body = String(formData.get("body") ?? "").trim()
  const field = String(formData.get("field") ?? "").trim() || null

  if (!objectId || !body) return
  await supabase.from("annotations").insert({
    user_id: userId,
    object_id: objectId,
    body: body.slice(0, 10_000),
    field,
  })
  revalidatePath(`/dashboard/objects/${objectId}`)
}

export async function deleteAnnotation(id: string, objectId: string) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("annotations").delete().eq("id", id).eq("user_id", userId)
  revalidatePath(`/dashboard/objects/${objectId}`)
}

export async function summarizeObject(objectId: string) {
  const { supabase, userId } = await requireUserId()
  const { data: obj } = await supabase
    .from("objects")
    .select("id, title, text, url, attributes")
    .eq("id", objectId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!obj) return

  const source = [
    obj.title ? `Title: ${obj.title}` : "",
    obj.url ? `URL: ${obj.url}` : "",
    obj.attributes ? `Attributes: ${JSON.stringify(obj.attributes).slice(0, 2000)}` : "",
    obj.text ? `Content: ${String(obj.text).slice(0, 12_000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  if (!source.trim()) return

  const { text } = await generateText({
    model: "openai/gpt-5-mini",
    system:
      "You produce concise, neutral summaries of arbitrary web content. " +
      "Output 2-4 sentences. No preamble, no markdown, no lists.",
    prompt: source,
  })

  await supabase
    .from("objects")
    .update({ summary: text.trim().slice(0, 8000) })
    .eq("id", objectId)
    .eq("user_id", userId)

  revalidatePath(`/dashboard/objects/${objectId}`)
}

export async function startTracking(formData: FormData) {
  const { supabase, userId } = await requireUserId()
  const objectId = String(formData.get("object_id") ?? "")
  const fieldsRaw = String(formData.get("fields") ?? "")
  const intervalMinutes = Math.max(15, Math.min(Number(formData.get("interval_minutes") ?? 1440), 60 * 24 * 30))
  const fields = fieldsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32)

  if (!objectId) return

  const { data: obj } = await supabase
    .from("objects")
    .select("id, attributes")
    .eq("id", objectId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!obj) return

  const { data: tracked } = await supabase
    .from("tracked_objects")
    .upsert(
      {
        user_id: userId,
        object_id: objectId,
        fields,
        interval_minutes: intervalMinutes,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,object_id" },
    )
    .select("id")
    .single()

  if (tracked) {
    await supabase.from("tracking_snapshots").insert({
      user_id: userId,
      tracked_id: tracked.id,
      payload: { attributes: obj.attributes },
    })
  }

  revalidatePath(`/dashboard/objects/${objectId}`)
  revalidatePath("/dashboard/tracked")
}

export async function stopTracking(objectId: string) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("tracked_objects").delete().eq("object_id", objectId).eq("user_id", userId)
  revalidatePath(`/dashboard/objects/${objectId}`)
  revalidatePath("/dashboard/tracked")
}

export async function createWorkspaceToken(formData: FormData) {
  const { supabase, userId } = await requireUserId()
  const name = String(formData.get("name") ?? "Chrome Extension").slice(0, 100) || "Chrome Extension"
  await supabase.from("workspace_tokens").insert({ user_id: userId, name })
  revalidatePath("/dashboard/settings")
}

export async function revokeWorkspaceToken(id: string) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("workspace_tokens").update({ revoked: true }).eq("id", id).eq("user_id", userId)
  revalidatePath("/dashboard/settings")
}

export async function togglePageRule(id: string, enabled: boolean) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("page_rules").update({ enabled }).eq("id", id).eq("user_id", userId)
  revalidatePath("/dashboard/rules")
}

export async function deletePageRule(id: string) {
  const { supabase, userId } = await requireUserId()
  await supabase.from("page_rules").delete().eq("id", id).eq("user_id", userId)
  revalidatePath("/dashboard/rules")
}
