# Progress Log — Documentation AI Agent

## Architecture Decision
**Approach**: RAG (Retrieval-Augmented Generation)
- You can't "train" Claude — there's no fine-tuning. Instead, retrieve relevant docs at query time and inject into context.
- Vector embeddings via OpenAI `text-embedding-3-small` (1536d) stored in pgvector
- Claude Sonnet 4.6 synthesizes answers from retrieved chunks
- Two integration points: standalone docs-agent + copilot-autonomous tool

## Current State (Before)
- `useSupportChat` does naive PostgreSQL `textSearch` on `docs_articles.content`
- `generateAnswer` just extracts first 600 characters of first match — no AI
- No embeddings on docs_articles table
- copilot-autonomous has no documentation search tool
- pgvector + embedding infra exists for skills but not wired to docs

## Codebase Patterns
- Edge functions use Anthropic SDK with native `tool_use` for agentic loops
- SSE streaming pattern from `copilot-autonomous` (ReadableStream + TextEncoder)
- Embedding generation via OpenAI `text-embedding-3-small` (1536d)
- Vector search via `match_*_by_embedding` RPCs with cosine similarity
- CORS via `getCorsHeaders(req)` from `_shared/corsHelper.ts`

---

## Session Log

(No stories executed yet)
