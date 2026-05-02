// Detects errors thrown by the Vercel AI Gateway that indicate the gateway
// is unreachable for billing/auth reasons (most commonly: a missing credit
// card on file). When this happens, callers should gracefully degrade to a
// non-AI fallback rather than returning HTTP 500 to the extension.

export function isGatewayUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as {
    name?: string
    statusCode?: number
    message?: string
    cause?: { statusCode?: number; message?: string; data?: { error?: { type?: string } } }
  }

  const status = e.statusCode ?? e.cause?.statusCode
  if (status === 401 || status === 402 || status === 403) return true

  const type = e.cause?.data?.error?.type
  if (type === "customer_verification_required" || type === "billing_required") return true

  const msg = `${e.message || ""} ${e.cause?.message || ""}`.toLowerCase()
  if (msg.includes("credit card")) return true
  if (msg.includes("ai gateway requires")) return true
  if (msg.includes("ai_gateway_api_key")) return true

  return false
}

// User-facing message to surface in the extension toast / dashboard.
export const GATEWAY_UNAVAILABLE_MESSAGE =
  "AI features unavailable: the Vercel AI Gateway needs a credit card on file. Using a fallback heuristic instead."
