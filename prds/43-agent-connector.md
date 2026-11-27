# 43 — Family Agent Connector (MCP)

**Phase**: 3 · **Depends on**: nothing to build. The finance tools depend on [42](42-personal-finance-vault.md), and the "chat with finances" slice is gated on 42 shipping.
**Status**: 📝 **draft, awaiting Dan's sign-off** (Dad's request 2026-11-17, "work with Muse on the website"; scoped by Dan 2026-11-27: "a connector for agents to do CRUD operations on data from the site … likely an MCP connector").
**Parallel-safe with**: most PRDs. It adds a new route (`/api/mcp`), an OAuth consent page, an audit table and connector-aware RLS on sensitive tables.

---

## Why this exists

Family members are starting to use **personal AI agents**. Dad uses **Muse** (Meta). Others may use **Claude** (or Claude Duet), **ChatGPT** (or OpenAI's Dots), or **Instinct**. Dan wants those agents to work with the site on the user's behalf: check and request property bookings, look things up in family history and the directory, update a property's how-to, and eventually answer questions about the user's own finances.

The site must **not** grow one integration per agent product. **A single remote MCP server is the common denominator.** Every product above speaks MCP to some degree (research, 2026-11-27, summarized below).

## The non-negotiable: the agent is the user, never more

The same rule as [40](40-trust-document-vault.md):
- **Every tool call runs as the signed-in user, through that user's own Supabase JWT, under RLS.**
- **No service-role key**. This repo has never used one, and it won't start here.
- An agent can't read or change anything its user couldn't by hand.
- Every call is logged under that user.

On top of that, **agents get less than the user** on the most sensitive data (see "Connector-aware RLS").

## Research summary (2026-11-27)

| Agent | What it is | How it connects | Fit |
|---|---|---|---|
| **Muse** (Meta, launched 2026-09) | Personal agent with its own VM and browser | Built-in connectors; a **developer-connector program (apply; terms not public)**; can build its own MCP client over Streamable HTTP. **Bearer token is the documented path, and OAuth into a remote MCP server from the Muse app is reported untested.** | ⚠️ **The weak spot, and it's Dad's agent.** See the Muse decision. |
| **Claude / Duet** (Anthropic; Duet in research preview) | Assistant and proactive agent | Custom connectors = remote MCP + OAuth (Settings → Connectors → Add custom connector) | ✅ Claude. Duet probably inherits it (unconfirmed). |
| **ChatGPT / Dots** (OpenAI, 2026-09) | Assistant and always-on agents | Custom plugins = MCP. **Full read+write only on Business/Enterprise**; Pro gets read/fetch only. | 🟡 Read on Pro, write on business plans |
| **Instinct** (Spear Street, invite beta) | Text-first personal agent | Remote MCP URL plus a sign-in flow (per vendor pages, no official docs) | ✅ probably |

## Architecture

- **MCP server inside the existing Next.js app**:
  - `src/app/api/mcp/[transport]/route.ts`, using **`mcp-handler` v2** (Streamable HTTP; no SSE, no Redis).
  - `withMcpAuth` verifies the bearer token: issuer, audience, expiry and signature against Supabase's JWKS.
  - Protected-resource metadata at `/.well-known/oauth-protected-resource` (RFC 9728).
- **Authorization server = Supabase Auth's OAuth 2.1 server**:
  - Still **beta**, and free on our plan.
  - Access tokens are ordinary Supabase user JWTs, so **existing RLS applies unchanged**. Each token carries a `client_id` claim.
  - We host the **consent page** (`/oauth/consent`, Advisory styling, older-user bar). It shows which agent is asking and what it will be able to do, in plain words.
  - Client registration is **dynamic client registration only** (Supabase doesn't support Client ID Metadata Documents yet). In Claude, pick "Register automatically".
- **Each tool** builds a Supabase client from the caller's bearer JWT and calls the same queries and server-action logic the pages use. Shared logic is factored out of `actions.ts` where needed; it isn't reimplemented.
- **Audience binding.** Supabase has no RFC 8707 resource binding, so a Custom Access Token Hook sets `aud` for connector clients, and `verifyToken` requires it. This stops a token minted for another app being replayed here.

## Connector-aware RLS (agents get less than the user)

Supabase OAuth scopes only cover identity claims and **do not limit database access**. Least privilege therefore lives in two places:

1. **The MCP server's tool allowlist** decides which tools exist at all, per slice.
2. **RLS checks `auth.jwt() ->> 'client_id'`** on sensitive tables. It's a hard floor even if a token leaks or the server has a bug:
   - **Trust vault (40): no access for connector tokens.** Restrictive policies deny when `client_id` is present. A trust document is never read by an agent through this path; PRD 07's in-site adviser is the designed route.
   - **Personal finance vault (42): no access by default.** Slice 3 adds an **owner opt-in per connected agent** (an `agent_finance_access` row the owner creates), read-only.
   - **Everything else:** the user's normal RLS applies.

## Tools (by slice)

Annotate every tool with `readOnlyHint` and `destructiveHint` so clients prompt before writes. Return **structured data** (JSON fields), never prose that could read as instructions.

1. **Slice 1: read-only.**
   - `whoami`
   - `list_properties` / `get_property` (how-to, guidelines, key info, contacts)
   - `get_calendar` (bookings in a date range) / `get_availability`
   - `search_directory` (people, honoring guest visibility)
   - `search_family_history` (stories, timeline, tree)
   - `list_my_requests`
   - Plus the consent page, the audit log and the **Connected Agents** page (under the user menu: lists your agents, last used, and a **Disconnect** button that revokes the agent's sessions).
2. **Slice 2: writes.**
   - `request_booking` / `cancel_my_booking_request`
   - `update_property_how_to` (`recordRevision()`, attributed to the user "via <agent>")
   - `add_reminder`
   - `submit_feedback`
   - **Deletes and cancellations are two-step**: the tool returns a preview and a confirm token, and a second call confirms. Prefer soft deletes.
3. **Slice 3: "chat with my finances."** After 42 ships: read-only tools over the caller's **own** finance vault and statements, gated by the owner opt-in. Nothing from anyone else's vault, ever, including shares (agents act only on the owner's own data in v1).

## Prompt-injection posture

Wiki pages, stories and booking notes are written by other family members, and an agent reads them as text. So:
- tool results mark user-authored text as **content**, never as instructions;
- write tools never take their arguments from fields of earlier read results without the user in the loop (the client's write confirmation covers this);
- finance tools (slice 3) never return free text written by other users.

## Audit

`agent_tool_calls` is append-only, with insert and owner-select policies only (the PRD 40 pattern). Each row records:
- `profile_id` and `client_id`
- tool name and a hash of the arguments
- result status and timestamp

Writes also show up in the normal `revisions` history, marked "via agent". Users see their own log on the Connected Agents page.

## Pre-flight decision grid (needs Dan's sign-off)

| Decision | Recommendation | Notes |
|---|---|---|
| **Protocol** | One remote MCP server (Streamable HTTP) | Covers Claude, Instinct, ChatGPT (read on Pro), and Muse's self-built client. |
| **Auth** | Supabase OAuth 2.1 server (beta) + our consent page | Keeps "agent = user via RLS" with zero new secrets. Accept the beta risk. The fallback, if it breaks, is to pause the connector, not to switch to a service key. |
| **Muse** ⚠️ | **Step 1: test whether Muse can complete the OAuth flow in its own browser** (a throwaway test against slice 1 on a preview). **Step 2, if not: apply to Meta's developer-connector program.** **Step 3, last resort: per-user personal access tokens.** | Step 3 is a real design problem: a long-lived token that acts as the user without a service-role key. One shape is a token that our server exchanges for a short-lived session the user approved, revocable from Connected Agents. It needs its own security review, so it's **not designed here**. |
| **Who can connect** | Active members only in v1. Guests can't. | Guests' scoped visibility makes connector behavior harder to reason about. Revisit later. |
| **Trust vault via agents** | **Never through this connector** | PRD 07's in-site adviser is the path for trust Q&A. |
| **Finances via agents** | Slice 3, owner opt-in per agent, read-only, own data only | Dad's "chat with finances". |
| **Token lifetime** | 1-hour access tokens (Supabase default), refresh via OAuth | Disconnect revokes refresh. |

## Likely file layout

```
src/app/api/mcp/[transport]/route.ts          # mcp-handler + withMcpAuth
src/app/.well-known/oauth-protected-resource/route.ts
src/app/oauth/consent/page.tsx                # consent screen
src/app/(app)/settings/agents/page.tsx        # Connected Agents + disconnect + audit
src/lib/mcp/{auth,tools/*,audit}.ts
supabase/migrations/<ts>_agent_connector.sql  # agent_tool_calls, client_id-aware restrictive policies, token hook
```

New dependencies: `mcp-handler`, `@modelcontextprotocol/server`, Zod 4 (check the repo's current Zod first).

## Verification recipe

- **Negative suite** (real JWTs, with and without a `client_id` claim):
  - A connector token reads zero trust rows and zero finance rows (before opt-in).
  - A guest can't complete consent.
  - A token with the wrong `aud` gets 401.
  - A deactivated user's token is refused.
  - The audit log is append-only.
- **End to end:** add the connector in Claude (custom connector), complete consent, and run each slice-1 tool. Confirm results match what the same user sees in the browser and that every call lands in `agent_tool_calls`. Then attempt the Muse OAuth test.
- `tsc`, `eslint` and `next build` must all pass. Vercel function duration is fine (tools are short queries).

## Out of scope

Agents acting for someone other than the signed-in user, trust-vault access, any service-role path, agent-to-agent messaging, and a public directory listing for the connector.

## Open follow-ups

- Result of the Muse OAuth test, which decides step 2/3.
- Whether Claude Duet picks up custom connectors (unconfirmed as of 2026-11-27).
- Revisit when Supabase's OAuth server leaves beta, or adds CIMD and per-resource audiences.
- **Security review of this PRD's build** with the Claude Security plugin for Claude Code before slice 2 (writes) ships. See the master plan note.
