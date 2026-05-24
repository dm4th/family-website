# 08 — Financial Dashboard & Trust Insights

**Phase**: 3 · **Depends on**: 07 (security model decided), real conversation with Dan's dad about what data should surface

## Goal

A transparent view of trust performance and distributions for family members who are beneficiaries. The bar is *useful summaries*, not full portfolio software — we are not building Addepar or Bloomberg.

> **Gating**: depends on the same security model decision as `07-trust-doc-rag.md`, and on a real scoping conversation with Dan's dad. The PRD's grand "Portfolio overview / Tax optimization / Risk assessment" framing is aspirational — pick a few high-value cuts and ship those first.

## User stories (initial, scope TBD)

- As a beneficiary, I see my current trust value, recent distributions, and a high-level performance trend.
- As any member, I see family-wide aggregate metrics (no individual-level disclosure unless I'm the beneficiary).
- As an admin / trustee, I upload a quarterly statement and the dashboard reflects the new numbers.

## In scope (candidates — pick 2-3 to start)

- Per-beneficiary view: balance, YTD performance, distribution history
- Aggregate family view (anonymized): total assets under management, distributions paid out by year
- Document hooks: link each metric to its source statement
- "Ask the AI" entry point — handoff to `07-trust-doc-rag.md` for questions about the numbers
- Manual entry by trustee (vs. automated brokerage feeds) — start manual

## Out of scope

- Live brokerage / market-data feeds
- Tax-optimization recommendations (AI-generated)
- Real-time portfolio rebalancing
- External advisor portal (CRM-style)
- Risk modeling

## Open questions

- What data does Dan's dad already track and how (spreadsheets? family-office software)? We need to see the source before designing.
- Manual data entry vs. file ingest vs. brokerage API — start with manual / file ingest from quarterly PDFs.
- Show individual numbers to anyone other than the beneficiary themselves? Recommendation: no — beneficiaries see their own; admins see aggregates and individual breakdowns.
- Disclaimers / legal review needed before exposing any dollar figures.

## References / reuse

- Same auth + RLS model — extend with beneficiary-scoped policies
- Recharts or shadcn charts for visualizations
