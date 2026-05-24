# 07 — Trust Document RAG / Agentic Search

**Phase**: 3 · **Depends on**: trust-doc security model decision (see Open decisions in [00-master-plan.md](00-master-plan.md))
**Status**: 🔴 blocked. Do not start build until the security model decision has happened. See `Pre-flight decisions` below.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **Confirm the security decision has actually been made** — see the open-decisions list in the master plan. If it hasn't, your first job is to facilitate that conversation, not write code.
3. **You will reuse**:
   - Auth + RLS patterns from the first slice (the same `is_admin()` and `requireAdmin()` gating from `src/app/(app)/admin/actions.ts`)
   - The recording-revision pattern if you want a document-version audit log
   - shadcn/ui chat / message components (will need to add: `npx shadcn add` for chat-specific UI)
4. **Skills**: consult `.agents/skills/supabase` (especially the pgvector section) for embeddings setup. Consult the **claude-api** skill (built-in) for streaming completions and prompt-caching strategy.

## Goal

Let family members ask plain-language questions about complex trust / wealth / estate documents and get **cited** answers — without having to call a lawyer for routine questions. Long-term, route richer questions to an agent that can reason across multiple documents.

## User stories

- As a beneficiary, I ask "When can I access my trust funds?" and get a cited answer pointing to the specific clause.
- As any member, I ask "What's the distribution schedule for Trust X?" and the answer references the relevant document with a page link.
- As an admin, I upload a new version of a trust document and the system reindexes it.
- As a member, I see which questions I've asked before and can revisit citations.

## Pre-flight decisions (MUST happen before code)

These are non-negotiable. Documenting them as a recommendation grid, but every line needs an actual decision from Dan + family lawyer + (ideally) a security-savvy second opinion.

| Decision | Default recommendation | Considerations |
|---|---|---|
| **Where do the docs live at rest?** | Supabase Storage with the platform's at-rest encryption | Alternatives: AWS S3 + KMS for stricter compliance; self-hosted MinIO if you want to remove a vendor. Decision drives infrastructure. |
| **Which LLM, under what data agreement?** | Anthropic Claude under Enterprise terms with zero-retention + no-training | Cannot use anything that trains on data. Anthropic Enterprise is the safe default. |
| **Vector DB** | pgvector in Supabase | Alternatives: Pinecone / Weaviate for stricter isolation. pgvector keeps things colocated and inexpensive. |
| **Embeddings provider** | OpenAI `text-embedding-3-large` (zero-retention) | Voyage AI is competitive; self-hosted is possible but expensive to maintain. |
| **Per-document access** | New `document_access` table — per (document, profile) row | Some trust docs are beneficiary-specific. Don't try to do this via family_branch alone. |
| **Disclaimer / liability** | "Not legal advice" banner on every answer; log every Q + A for legal review on demand | Family lawyer should sign off on the exact wording. |
| **Reindex triggers** | Manual button + automatic on new upload | Don't auto-reindex on every storage change — too noisy. |

If you cannot get all of these decided, **don't ship anything**. Write up the alternatives in this PRD's Implementation section instead, and escalate.

## In scope (initial)

- `documents` table: `id`, `name`, `storage_path`, `version`, `uploaded_by`, `uploaded_at`, `category` (trust / estate / general), `replaces_id` (nullable, for version history)
- `document_chunks` table: `id`, `document_id`, `chunk_index`, `text`, `embedding` (vector), `page_number`, `bounding_box` (optional JSONB for PDF coords)
- `document_access` table: `document_id`, `profile_id` (admin-only inserts; SELECT respects auth.uid())
- `chat_sessions` + `chat_messages` tables for audit log
- `/documents` admin upload + version management (admins only)
- `/ask` chat UI with streaming responses (Vercel AI SDK)
- Citation rendering: every claim hyperlinks back to the source chunk with page number
- Disclaimer banner on every response

## Out of scope (initial)

- Cross-trust reasoning (multi-document agent) — Phase 3.5
- Edit / annotate documents in-app
- Generated PDFs / summaries
- Financial projections / calculations (those live in [08-financial-dashboard.md](08-financial-dashboard.md))
- Voice input

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_documents_pgvector.sql   # enable extension, tables, RLS, document_access
src/lib/db/schema.ts                # mirror
src/lib/embeddings.ts               # provider abstraction
src/lib/rag.ts                      # chunk + retrieve + format-citations
src/lib/llm.ts                      # Claude client (zero-retention headers)

src/app/(app)/documents/
  page.tsx                          # admin list + upload
  actions.ts                        # uploadDocument, reindexDocument, grantAccess
  [id]/page.tsx                     # document detail + access management

src/app/(app)/ask/
  page.tsx                          # chat UI
  actions.ts                        # askQuestion (streaming)
  chat-view.tsx                     # Client Component with streaming render
```

## Verification recipe

1. Sign in as admin. Upload a trust PDF. → document row + chunks rows + embeddings populated. Reindex if needed.
2. Sign in as a beneficiary with `document_access`. Open `/ask`. → can ask questions, see streamed answers with inline citations.
3. Click a citation. → opens the source document scrolled to the right page (or shows the chunk text inline).
4. Sign in as a member *without* `document_access` for that doc. Ask the same question. → either no results, or results from only the docs they can access. Verify RLS is doing the work, not the application layer.
5. Check `chat_messages` table. → every question + answer + cited chunks recorded.
6. Toggle the LLM provider to a deliberately broken endpoint. → error path is graceful, user sees a friendly fallback, no half-streamed response left in the UI.

## References / reuse

- Vercel AI SDK: `streamText` + tool calls — same SDK works for the simple chat case and a later agent case
- pgvector schema patterns: see Supabase docs + the `supabase` skill
- For PDF parsing + page-accurate citations: `pdf-parse` (basic) or `unstructured-io` (better, more deps)
- For chunk-with-overlap strategies: see LlamaIndex / LangChain docs for proven values (e.g., 800 tokens with 200 overlap is a common starting point)

## Implementation

_To be filled in by the contributor who ships this — but only after the security decisions are made and documented._

- **Status**: blocked on security decision
- **Key files**: (list once shipped)
- **Decisions made**: (capture the actual answers to the pre-flight grid)
- **Open follow-ups**: (what's deferred)
