import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

// When the extension is configured with the user's own Anthropic API key
// (X-Anthropic-Key header), bypass the Vercel AI Gateway entirely and call
// Anthropic directly. This lets users keep working when the gateway needs
// a credit card on file. Gateway model strings and a tier hint map to
// Anthropic model IDs as follows:
//
//   tier "smart" -> claude-opus-4-5    (selector engineering, custom rules)
//   tier "fast"  -> claude-sonnet-4-5  (extraction, summarization)
//
// Returns either an AI-SDK model instance (when using the user key) or a
// gateway model id string (default).

const ANTHROPIC_HEADER = "x-anthropic-key"
const OPENAI_HEADER = "x-openai-key"

// Three latency/quality tiers:
//
//   smart  - opus / gpt-5         (selector engineering, custom rules)
//   fast   - sonnet / gpt-5-mini  (extraction, summarization)
//   nano   - haiku / gpt-4o-mini  (table-style structured output)
//
// "nano" exists because the gpt-5* / claude-4-5* families are reasoning
// models — they run an internal think step before answering, which adds
// 15-30s of latency on what should be a 1-3s structured-output call. For
// routes like /compare-text where we just need the model to fill in a
// fixed-shape table from short snippets, the older non-reasoning minis
// are dramatically faster and quality-equivalent for that task.
const TIER_MODEL: Record<"smart" | "fast" | "nano", string> = {
  smart: "claude-opus-4-5",
  fast: "claude-sonnet-4-5",
  nano: "claude-3-5-haiku-latest",
}

const OPENAI_TIER_MODEL: Record<"smart" | "fast" | "nano", string> = {
  smart: "gpt-5",
  fast: "gpt-5-mini",
  nano: "gpt-4o-mini",
}

export type ChatTier = "smart" | "fast" | "nano"

export type ResolvedModel = {
  model: LanguageModel | string
  usingUserKey: boolean
}

export function getUserAnthropicKey(req: Request): string | null {
  const raw = req.headers.get(ANTHROPIC_HEADER)
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Loose sanity check; Anthropic keys begin with "sk-ant-".
  if (!/^sk-/.test(trimmed)) return null
  return trimmed
}

export function getUserOpenAIKey(req: Request): string | null {
  const raw = req.headers.get(OPENAI_HEADER)
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Loose sanity check; OpenAI keys begin with "sk-".
  if (!/^sk-/.test(trimmed)) return null
  return trimmed
}

export function resolveModel(
  req: Request,
  opts: { gatewayModel: string; tier: ChatTier },
): ResolvedModel {
  const key = getUserAnthropicKey(req)
  if (key) {
    const anthropic = createAnthropic({ apiKey: key })
    return { model: anthropic(TIER_MODEL[opts.tier]), usingUserKey: true }
  }
  return { model: opts.gatewayModel, usingUserKey: false }
}

// Multi-provider chat resolver used by routes (like /api/v1/compare-text)
// that don't care which provider runs the request — they just need a chat
// model that works without the gateway when the gateway is blocked behind
// a card-on-file requirement. Resolution order:
//
//   1. OpenAI key set       -> openai/gpt-5* direct (cheapest path)
//   2. Anthropic key set    -> claude-* direct
//   3. Gateway              -> opts.gatewayModel
//
// `provider` is a human-readable string surfaced back to the client so the
// in-page status banner can show "openai/gpt-5-mini (direct)" vs the
// gateway model id.
export type ResolvedChatModel = ResolvedModel & {
  provider: string
}

export function resolveChatModel(
  req: Request,
  opts: { gatewayModel: string; tier: ChatTier },
): ResolvedChatModel {
  const openai = getUserOpenAIKey(req)
  if (openai) {
    const client = createOpenAI({ apiKey: openai })
    const id = OPENAI_TIER_MODEL[opts.tier]
    return {
      model: client(id),
      usingUserKey: true,
      provider: `openai/${id} (direct)`,
    }
  }
  const anthropic = getUserAnthropicKey(req)
  if (anthropic) {
    const client = createAnthropic({ apiKey: anthropic })
    const id = TIER_MODEL[opts.tier]
    return {
      model: client(id),
      usingUserKey: true,
      provider: `anthropic/${id} (direct)`,
    }
  }
  return {
    model: opts.gatewayModel,
    usingUserKey: false,
    provider: opts.gatewayModel,
  }
}
