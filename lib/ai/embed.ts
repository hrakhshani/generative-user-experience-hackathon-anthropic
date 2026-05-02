// Embedding model resolver.
//
// By default we route through the Vercel AI Gateway by passing a model
// id string ("openai/text-embedding-3-small") to embedMany / embed.
// That works great when the project has a card on file but blocks
// every embedding call with a `customer_verification_required` error
// otherwise.
//
// To unblock users without a card, the extension can ship a per-user
// OpenAI API key on the `x-openai-key` request header. When that
// header is present we instantiate an `@ai-sdk/openai` provider with
// the user's key and bypass the gateway entirely. Same model, same
// vector space, same cosine scores — just billed to the user's OpenAI
// account instead of Vercel.
//
// Returns a tuple of (model, label) so the calling route can both pass
// the model into the AI SDK and report the resolved model id back to
// the client for transparency.

import { createOpenAI } from "@ai-sdk/openai"
import type { EmbeddingModel } from "ai"

export const DEFAULT_EMBEDDING_MODEL_ID = "openai/text-embedding-3-small"
export const DEFAULT_OPENAI_EMBEDDING_MODEL_ID = "text-embedding-3-small"

export type ResolvedEmbeddingModel = {
  /** The thing you pass into embedMany/embed. */
  model: string | EmbeddingModel<string>
  /** Human-readable id for the response payload + diagnostic logs. */
  modelId: string
  /** True if we're routing through the Vercel AI Gateway. */
  viaGateway: boolean
}

/**
 * Decide which embedding model to use for this request.
 *
 * Headers checked (in order of precedence):
 *   - x-openai-key     → call OpenAI directly with this key.
 *
 * Falls back to the gateway-routed model id string.
 */
export function resolveEmbeddingModel(req: Request): ResolvedEmbeddingModel {
  const openaiKey = req.headers.get("x-openai-key")?.trim()
  if (openaiKey && /^sk-/.test(openaiKey)) {
    const provider = createOpenAI({ apiKey: openaiKey })
    return {
      model: provider.textEmbeddingModel(DEFAULT_OPENAI_EMBEDDING_MODEL_ID),
      modelId: `openai/${DEFAULT_OPENAI_EMBEDDING_MODEL_ID} (direct)`,
      viaGateway: false,
    }
  }

  return {
    model: DEFAULT_EMBEDDING_MODEL_ID,
    modelId: DEFAULT_EMBEDDING_MODEL_ID,
    viaGateway: true,
  }
}
