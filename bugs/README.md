# Bug Reports

Features get PRDs in [`prds/`](../prds/00-master-plan.md). Bugs get one of these. A bug is something that already shipped and behaves wrongly: a crash, wrong data, a broken flow, a security or privacy hole, or copy that breaks the conventions in [CLAUDE.md](../CLAUDE.md). If the fix means building something new, write a PRD instead and link it from here.

## Filing a bug

1. Copy [`TEMPLATE.md`](TEMPLATE.md) to `bugs/B###-short-slug.md`, using the next number in the table below (`B001`, `B002`, …).
2. Fill in at least **Reported**, **Severity**, **What happens**, **Expected** and **Steps to reproduce**. Leave the rest for whoever picks it up.
3. Add a row to the **Open bugs** table below.
4. Strip personal data before committing. This repo is public, so describe people by role ("a member", "a guest", "Dad") rather than by email address, and never paste tokens, account numbers or document contents.

**Where reports come from:**
- **Email** to Claude's inbox, `claude.mathieson@agentmail.to`. Claude triages these into bug files or PRDs.
- **In-app feedback** at `/admin/feedback` (PRD 20). Anything that turns out to be a defect gets a bug file, with its feedback row linked.
- **Found during a session.** Any contributor or agent who hits a bug outside their current scope files it here rather than fixing it on the side.

## Severity

| Level | Meaning | Response |
|---|---|---|
| **S1: critical** | Security or privacy exposure, data loss or corruption, or the site is down or unusable for everyone | Drop other work. Fix and verify on prod. |
| **S2: major** | A core flow is broken for some users (sign-in, booking, upload, invites) and there's no reasonable workaround | Next session |
| **S3: minor** | Wrong but has a workaround, or only affects an edge case | Queue it |
| **S4: cosmetic** | Visual or copy problems, including casing and em-dash violations | Batch it with nearby work |

## Status

`🔴 open` → `🔍 investigating` → `🚧 fixing` → `✅ fixed` (merged and verified on prod) · `⚪ won't fix` / `🔁 duplicate` (give the reason)

## Working a bug

1. **Reproduce it first**, locally or on a preview, and record the exact steps in the file. If it can't be reproduced, set the status to `🔍 investigating`, write down what you tried, and stop.
2. **Find the root cause** before writing the fix, and record it under **Root cause**. Name the specific commit or PRD that introduced it if you can.
3. **Branch as `fix/B###-slug`**, one bug per branch. Keep the fix to the smallest change that solves it, and add a regression check (test, eval case or verification step) wherever the code allows.
4. **Verify the fix on prod after merge**, then fill in **Fix** (PR, commit, migration if any) and flip the status to `✅ fixed` in both the file and the table.
5. If the bug was in a shipped PRD's feature, add a one-line note under that PRD's Implementation section pointing to the bug file.

## Open bugs

| Bug | Severity | Status | Area | Summary |
|---|---|---|---|---|
| _none yet_ | | | | |

## Closed bugs

| Bug | Severity | Resolution | Fixed in |
|---|---|---|---|
| _none yet_ | | | |
