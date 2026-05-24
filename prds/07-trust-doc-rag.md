# 07 — Trust Document RAG / Agentic Search

**Phase**: 3 · **Depends on**: security model decision (see master plan open decisions)

## Goal

Let family members ask plain-language questions about complex trust / wealth / estate documents and get cited answers — without having to call a lawyer for routine questions. Long-term, route richer questions to an agent that can reason across multiple documents.

> **Gating**: do not start build until the trust-doc security model is decided. See `00-master-plan.md` → "Open decisions".

## User stories

- As a beneficiary, I ask "When can I access my trust funds?" and get a cited answer pointing to the specific clause.
- As any member, I ask "What's the distribution schedule for Trust X?" and the answer references the relevant document with a page link.
- As an admin, I upload a new version of a trust document and the system reindexes it.
- As a member, I see which questions I've asked before and can revisit citations.

## In scope (initial)

- Document upload (PDF, DOCX) — admin-only at first
- Chunking + embedding pipeline → pgvector in Supabase
- Chat UI with streaming responses (Vercel AI SDK + Anthropic Claude)
- Citation rendering: every claim hyperlinks back to the source chunk with page number
- Per-document access control via `document_access` table (some docs are beneficiary-specific)
- Audit log of every query + answer (who asked, what they saw)

## Out of scope (initial)

- Cross-trust reasoning (multi-document agent) — Phase 3.5
- Edit / annotate documents in-app
- Generated PDFs / summaries
- Financial projections / calculations

## Open questions — these need answers before scoping

- **Where do the docs live?** Supabase Storage with at-rest encryption sufficient, or do we need a separate stricter store (e.g., AWS S3 with KMS, self-hosted MinIO)?
- **Which LLM, under what data agreement?** Anthropic Claude with zero-retention enterprise terms is the leading option. Cannot use anything that trains on data.
- **Vector DB**: pgvector in Supabase, or external (Pinecone / Weaviate) for stricter isolation?
- **Embeddings provider**: OpenAI is cheapest/best today but routes through a third party. Voyage AI or self-hosted alternatives?
- **Per-document access**: how granular? Per beneficiary, per branch, per individual document?
- **Disclaimer / liability**: do we surface "This is not legal advice" prominently? Recommendation: yes, on every answer.

## References / reuse

- Vercel AI SDK with `streamText` and tool calls — same SDK works for the simple chat case and the later agent case
- pgvector schema patterns documented in Supabase docs
