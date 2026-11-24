#!/usr/bin/env python3
"""Family-website intake: email -> triaged bug files -> builder -> reporter notified.

Two stages, run separately (see README.md):

  intake.py triage   Reads Claude's AgentMail inbox. Mail from active family members that passes
                     DMARC is triaged by a tool-less Claude into a PII-scrubbed bug file, opened as a
                     DRAFT PR labelled `bug`. Feature ideas and other mail go to Dan. Also sends the
                     reporter emails: "started" once a builder claims the PR, and "live" once it's
                     merged and deployed.
  intake.py build    Claims the oldest unclaimed draft `bug` PR (adds `in-progress`) and runs a fix
                     agent on its branch inside the OS sandbox (no network, no credentials). The
                     script, not the agent, guards the diff, pushes, and marks the PR ready.

Any session can be a builder instead: claim a PR by adding `in-progress`, push the fix to the same
branch, mark it ready. The reporter emails follow the PR's state, not who did the work.

Flags: --dry-run (no writes, no mail).  Machine-local, private state (never in the repo):
~/.local/state/family-intake/{tickets.json,allowlist.txt}. AgentMail key: Keychain
service "agentmail-api-key", account "claude-home".
"""
import datetime as dt, fcntl, json, os, re, subprocess, sys, urllib.parse, urllib.request

HOME = os.path.expanduser("~")
HERE = os.path.dirname(os.path.abspath(__file__))
STATE_DIR = os.path.join(HOME, ".local/state/family-intake")
STATE = os.path.join(STATE_DIR, "tickets.json")
ALLOW = os.path.join(STATE_DIR, "allowlist.txt")
WORK = os.path.join(HOME, "intake-work")
DEPS_REPO = os.path.join(HOME, "code/family-website")  # its node_modules is reused by fix clones
GH_REPO = "dm4th/family-website"
GH_URL = f"https://github.com/{GH_REPO}.git"
SUPABASE_REF = "mtwkxklxdkeisatwvgno"
INBOX = "claude.mathieson@agentmail.to"
SITE_SENDER = "notifications@mathiesonfamily.app"  # the site's own Send Feedback alerts
API = "https://api.agentmail.to/v0"
SITE = "mathiesonfamily.app"
DRY = "--dry-run" in sys.argv
SIGN = "Claude\n(the family website's helper)"
TRAILER = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
os.environ["PATH"] = f"{HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
os.makedirs(STATE_DIR, exist_ok=True)
os.makedirs(WORK, exist_ok=True)


# Secrets and personal data that must never reach the public repo. Checked mechanically on the rendered
# bug file + PR text before filing, and on every line a builder adds.
PII_RX = re.compile(
    r"(gh[opsu]_[A-Za-z0-9]{20,}|github_pat_|sk-ant-|sb_secret_|sb_publishable_|re_[A-Za-z0-9]{20,}"
    r"|eyJ[A-Za-z0-9_-]{20,}\.eyJ|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[^\s:]+:[^\s@]+@|AKIA[0-9A-Z]{16}"
    r"|[\w.+-]+@[\w-]+(\.[\w-]+)+"                       # any email address, any TLD
    r"|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+\d[\d\s-]{8,}\d"  # phone numbers
    r"|\b(?!20\d{12}\b)\d{8,}\b)",                        # long digit runs (account / policy numbers),
                                                           # but not YYYYMMDDHHMMSS migration timestamps
    re.I)


def log(msg):
    print(f"{dt.datetime.now():%F %T} {msg}", flush=True)


def run(cmd, cwd=None, check=True, inp=None, timeout=600):
    r = subprocess.run(cmd, cwd=cwd, input=inp, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:3])} failed ({r.returncode}): {r.stderr[-800:]}")
    return r.stdout


def gh_json(*args):
    out = run(["gh", *args], check=False)
    try:
        return json.loads(out or "null")
    except json.JSONDecodeError:
        return None


# ---------- AgentMail ----------
def _key():
    return run(["security", "find-generic-password", "-s", "agentmail-api-key", "-a", "claude-home", "-w"]).strip()


def am(method, path, body=None, query=None):
    url = f"{API}/inboxes/{urllib.parse.quote(INBOX, safe='')}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {_key()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def mid(message_id):
    return "/messages/" + urllib.parse.quote(message_id, safe="")


def label_mail(m, *labels):
    if not DRY:
        am("PATCH", mid(m["message_id"]), {"add_labels": list(labels), "remove_labels": ["unread"]})


def reply(message_id, text, to):
    if DRY:
        log(f"[dry] reply to {to}: {text[:70]!r}")
        return
    am("POST", mid(message_id) + "/reply", {"text": text, "to": [to]})


def owner():
    return open(os.path.join(HOME, "maintenance/alert-recipient")).read().strip()


def email_owner(subject, text):
    if DRY:
        log(f"[dry] email Dan: {subject}")
        return
    am("POST", "/messages/send", {"to": [owner()], "subject": subject[:200], "text": text})


# ---------- private state ----------
def load_state():
    try:
        return json.load(open(STATE))
    except FileNotFoundError:
        return {"tickets": {}, "seen": []}


def save_state(s):
    if not DRY:
        json.dump(s, open(STATE + ".tmp", "w"), indent=2)
        os.replace(STATE + ".tmp", STATE)


def lock(name):
    f = open(os.path.join(STATE_DIR, f".{name}.lock"), "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log(f"{name}: previous run still active, skipping")
        sys.exit(0)
    return f


def sender_addr(frm):
    m = re.search(r"<([^>]+)>", frm or "")
    return (m.group(1) if m else (frm or "")).strip().lower()


def first_name(frm):
    name = (frm or "").split("<")[0].strip().strip('"')
    return name.split()[0] if name and "@" not in name else "there"


def refresh_allowlist():
    """Auth emails of active admins + members in prod (read-only query). Falls back to the cached list."""
    try:
        out = run(["supabase", "db", "query", f"--remote={SUPABASE_REF}", "--read-only", "-o", "json",
                   # auth.users.email, not profiles.email: users can edit their own profile row, and the
                   # site's Send Feedback Reply-To is the session (auth) email, so the two must match.
                   "select lower(u.email) as email from public.profiles p join auth.users u on u.id = p.id "
                   "where p.deactivated_at is null and p.role in ('admin','member')"], cwd=HOME, timeout=120)
        start = min(i for i in (out.find("["), out.find("{")) if i >= 0)
        data = json.loads(out[start:])
        rows = data["rows"] if isinstance(data, dict) else data
        emails = sorted({r["email"] for r in rows if r.get("email")})
        if emails:
            if not DRY:
                open(ALLOW, "w").write("\n".join(emails) + "\n")
            return set(emails)
    except Exception as e:
        log(f"allowlist refresh failed, using cache: {e}")
    try:
        return set(open(ALLOW).read().split())
    except FileNotFoundError:
        return set()


def authenticated(msg, addr):
    a = msg.get("authentication_results") or {}
    return a.get("dmarc") == "pass" and (a.get("dmarc_domain") or "").lower() == addr.rsplit("@", 1)[-1]


def claude_json(prompt_file, payload, budget="1"):
    out = run(["claude", "-p", open(prompt_file).read(), "--tools", "", "--strict-mcp-config",
               "--no-session-persistence", "--max-budget-usd", budget], inp=payload, timeout=300).strip()
    return json.loads(out[out.index("{"): out.rindex("}") + 1])


# ---------- filing (triage stage) ----------
def fresh_clone(path, branch="main"):
    if os.path.isdir(os.path.join(path, ".git")):
        run(["git", "fetch", "-q", "--prune", "origin"], cwd=path)
    else:
        run(["git", "clone", "-q", GH_URL, path])
    run(["git", "checkout", "-q", "-B", branch, f"origin/{branch}"], cwd=path)
    run(["git", "reset", "-q", "--hard", f"origin/{branch}"], cwd=path)
    run(["git", "clean", "-qfd"], cwd=path)


def next_bug_number(clone, state):
    nums = [0]
    for f in os.listdir(os.path.join(clone, "bugs")):
        if m := re.match(r"B(\d+)-", f):
            nums.append(int(m.group(1)))
    for line in run(["git", "branch", "-r"], cwd=clone).split():
        if m := re.match(r"origin/fix/B(\d+)-", line):
            nums.append(int(m.group(1)))
    nums += [int(k[1:]) for k in state["tickets"]]
    return max(nums) + 1


def render_bug(bid, t, today):
    steps = "\n".join(f"{i}. {s}" for i, s in enumerate(t.get("steps") or ["(not given in the report)"], 1))
    return f"""# {bid} — {t['title']}

**Reported**: {today} · **Source**: email · **Reporter**: {t.get('reporter_role') or 'a member'}
**Severity**: {t['severity']} (see [README](README.md#severity))
**Status**: 🔴 open
**Area**: {t.get('area') or 'Other'} · **Related PRD**: (fill in)

---

## What happens

{t['what_happens']}

## Expected

{t['expected']}

## Steps to reproduce

{steps}

**Reproduced?** not yet

## Impact

(Fill in while investigating.)

## Root cause

_Filled in while investigating._

## Fix

_Filled in when fixed._

## Verification

_Filled in after merge._
"""


def add_index_row(readme, bid, fname, t):
    cell = lambda v: str(v).replace("|", "/").replace("\n", " ")
    row = f"| [{bid}]({fname}) | {cell(t['severity'])} | 🔴 open | {cell(t.get('area') or 'Other')} | {cell(t['title'])} |"
    txt = open(readme).read()
    if "| _none yet_ | | | | |" in txt:
        txt = txt.replace("| _none yet_ | | | | |", row, 1)
    else:
        hdr = "|---|---|---|---|---|\n"
        j = txt.index(hdr, txt.index("## Open bugs")) + len(hdr)
        txt = txt[:j] + row + "\n" + txt[j:]
    open(readme, "w").write(txt)


def file_bug(m, sender, t, state):
    clone = os.path.join(WORK, "triage")
    fresh_clone(clone)
    today = dt.date.today().isoformat()
    bid = f"B{next_bug_number(clone, state):03d}"
    slug = re.sub(r"[^a-z0-9-]", "", (t.get("slug") or "bug").lower())[:40].strip("-") or "bug"
    branch, fname = f"fix/{bid}-{slug}", f"{bid}-{slug}.md"
    if DRY:
        log(f"[dry] would file {bid} '{t['title']}' as a draft PR on {branch}")
        return
    rendered = render_bug(bid, t, today)
    if hit := PII_RX.search(rendered + "\n" + t["title"] + "\n" + slug):
        email_owner(f"[Family site] Bug report held back: possible personal data",
                    f"Triage of a report from {m['from']} still contained something that looks like a secret or "
                    f"personal data ({hit.group(0)[:4]}…), so it was NOT filed in the public repo.\n\n"
                    f"Triage output:\n{json.dumps(t, indent=2)}\n\nFile it by hand after editing, or tell me to.")
        label_mail(m, "triaged", "held-pii")
        log(f"{bid}: held back, PII pattern matched")
        return
    run(["git", "checkout", "-q", "-b", branch], cwd=clone)
    open(os.path.join(clone, "bugs", fname), "w").write(rendered)
    add_index_row(os.path.join(clone, "bugs/README.md"), bid, fname, t)
    run(["git", "add", "bugs"], cwd=clone)
    run(["git", "commit", "-q", "-m", f"{bid}: file bug report ({t['title']})\n\nFiled from an emailed report.\n\n{TRAILER}"],
        cwd=clone)
    run(["git", "push", "-q", "-u", "origin", branch], cwd=clone)
    body = (f"**Filed bug, not yet fixed.** See [`bugs/{fname}`](https://github.com/{GH_REPO}/blob/{branch}/bugs/{fname}).\n\n"
            f"Reported by email by {t.get('reporter_role') or 'a member'} · **Severity:** {t['severity']} · "
            f"**Area:** {t.get('area')}\n\n**Builders:** claim this by adding the `in-progress` label, push the fix to "
            f"this branch following [bugs/README.md](https://github.com/{GH_REPO}/blob/main/bugs/README.md), then mark "
            "it ready for review. The reporter is emailed automatically when it's claimed and when it's live.\n\n"
            "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
    pr = run(["gh", "pr", "create", "--repo", GH_REPO, "--draft", "--base", "main", "--head", branch, "--label", "bug",
              "--title", f"{bid}: {t['title']}", "--body", body], cwd=clone).strip().splitlines()[-1]
    state["tickets"][bid] = {"message_id": m["message_id"], "thread_id": m["thread_id"], "sender": sender,
                             "from": m["from"], "title": t["title"], "pr": pr, "filed": today}
    save_state(state)
    label_mail(m, "triaged", "bug", bid)
    email_owner(f"[Family site] {bid} filed: {t['title']}",
                f"{t.get('summary_for_owner')}\n\nReported by: {m['from']}\nSeverity: {t['severity']} · Area: {t.get('area')}\n"
                f"Draft PR: {pr}\n\nThe local builder will pick it up within the hour.")
    log(f"{bid}: filed {pr}")


# ---------- reporter notifications (follow PR state) ----------
def deployed(sha):
    for d in gh_json("api", f"repos/{GH_REPO}/deployments?sha={sha}&environment=Production") or []:
        if any(s.get("state") == "success" for s in gh_json("api", d["statuses_url"]) or []):
            return True
    return False


def notify_reporters(state):
    for bid, tk in state["tickets"].items():
        if tk.get("done") or tk.get("closed"):
            continue
        pr = gh_json("pr", "view", tk["pr"], "--repo", GH_REPO, "--json", "state,isDraft,labels,mergeCommit,mergedAt")
        if not pr:
            continue
        labels = {l["name"] for l in pr.get("labels", [])}
        claimed = "in-progress" in labels or not pr.get("isDraft") or pr.get("state") == "MERGED"
        if claimed and not tk.get("started"):
            reply(tk["message_id"], f"Hi {first_name(tk['from'])},\n\nThanks for reporting this. I've logged it as {bid} "
                  f"(\"{tk['title']}\") and work on a fix has started. I'll email you again once it's live on the site.\n\n{SIGN}",
                  tk["sender"])
            tk["started"] = dt.date.today().isoformat()
            log(f"{bid}: reporter told work started")
        if pr.get("state") == "CLOSED":
            tk["closed"] = dt.date.today().isoformat()
            email_owner(f"[Family site] {bid} closed without merging",
                        f"{tk['pr']} was closed. I haven't told the reporter ({tk['from']}). Let me know what to say.")
        elif pr.get("state") == "MERGED":
            sha = (pr.get("mergeCommit") or {}).get("oid")
            merged_at = dt.datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            stale = dt.datetime.now(dt.timezone.utc) - merged_at > dt.timedelta(hours=3)
            live = bool(sha) and deployed(sha)
            if live or stale:
                reply(tk["message_id"], f"Hi {first_name(tk['from'])},\n\nGood news: the fix for {bid} (\"{tk['title']}\") "
                      f"is now live on {SITE}. If you still see the problem, just reply to this email and I'll take "
                      f"another look.\n\n{SIGN}", tk["sender"])
                tk["done"] = dt.date.today().isoformat()
                log(f"{bid}: reporter told it's live ({'deployed' if live else 'no deploy signal after 3h'})")
        save_state(state)


# ---------- triage stage ----------
def triage():
    _l = lock("triage")
    state = load_state()
    notify_reporters(state)
    readme = gh_json("api", f"repos/{GH_REPO}/contents/bugs/README.md?ref=main")
    main_has_bugs = isinstance(readme, dict) and readme.get("name") == "README.md"
    allow = refresh_allowlist()
    if not allow:
        raise RuntimeError("family allowlist is empty (prod query failed, no cache); leaving mail unread")
    msgs = am("GET", "/messages", query={"labels": "unread", "limit": 50, "ascending": "true"}).get("messages", [])
    for m in msgs:
        if "received" not in m["labels"] or m["message_id"] in state["seen"]:
            continue
        sender = sender_addr(m["from"])
        if sender == INBOX:
            continue
        full = None
        if sender == SITE_SENDER and authenticated(m, sender) and (m.get("subject") or "").startswith("New feedback"):
            full = am("GET", mid(m["message_id"]))
            rt = full.get("reply_to") or []
            rt = rt[0] if isinstance(rt, list) and rt else (rt if isinstance(rt, str) else "")
            body = (full.get("extracted_text") or full.get("text") or "")[:6000]
            if not rt or sender_addr(rt) not in allow:  # no Reply-To, or a guest: forward, don't file
                email_owner(f"[Family site] Site feedback from {sender_addr(rt) or 'unknown'} (not auto-filed)", body)
                label_mail(m, "triaged", "site-feedback")
                state["seen"].append(m["message_id"]); save_state(state)
                continue
            m = dict(m, **{"from": rt})
            sender = sender_addr(rt)
        elif sender not in allow or not authenticated(m, sender):
            log(f"ignored mail from {sender} ({'not family' if sender not in allow else 'failed DMARC'}): {m.get('subject')!r}")
            label_mail(m, "ignored")
            state["seen"].append(m["message_id"]); save_state(state)
            continue
        full = full or am("GET", mid(m["message_id"]))
        text = full.get("extracted_text") or full.get("text") or full.get("preview") or ""
        known = next((b for b, tk in state["tickets"].items() if tk["thread_id"] == m["thread_id"]), None)
        if known:
            email_owner(f"[Family site] Follow-up on {known} from {m['from']}", f"Subject: {m.get('subject')}\n\n{text[:6000]}")
            label_mail(m, "triaged", "followup", known)
            state["seen"].append(m["message_id"]); save_state(state)
            continue
        cache = state.setdefault("triage_cache", {})
        t = cache.get(m["message_id"]) or claude_json(
            os.path.join(HERE, "triage-prompt.md"), f"<email>\nSubject: {m.get('subject', '')}\n\n{text[:12000]}\n</email>")
        cache[m["message_id"]] = t
        if t.get("kind") == "bug":
            if not main_has_bugs:
                log(f"bug from {sender} deferred: bugs/ isn't on main yet")
                continue  # stays unread; retried next run
            state["seen"].append(m["message_id"]); save_state(state)
            file_bug(m, sender, t, state)
        elif t.get("kind") == "feature":
            email_owner(f"[Family site] Feature idea from {first_name(m['from'])}: {t.get('title')}",
                        f"{t.get('summary_for_owner')}\n\nFrom: {m['from']}\nSubject: {m.get('subject')}\n\n--- original ---\n"
                        f"{text[:6000]}\n\nTell me if you want a PRD written for it.")
            reply(m["message_id"], f"Hi {first_name(m['from'])},\n\nThanks for the idea! New features go through Dan first, "
                  f"so I've passed this along to him.\n\n{SIGN}", sender)
            label_mail(m, "triaged", "feature")
            state["seen"].append(m["message_id"]); save_state(state)
            log(f"feature idea from {sender} forwarded to Dan")
        else:
            email_owner(f"[Family site] Message from {first_name(m['from'])}: {m.get('subject')}",
                        f"{t.get('summary_for_owner')}\n\nFrom: {m['from']}\n\n{text[:6000]}")
            label_mail(m, "triaged", "other")
            state["seen"].append(m["message_id"]); save_state(state)
    # Only still-unread mail (e.g. a bug deferred above) needs its cached triage; drop the rest.
    unread = {m["message_id"] for m in msgs}
    cache = state.setdefault("triage_cache", {})
    for k in [k for k in cache if k not in unread or k in state["seen"]]:
        del cache[k]
    save_state(state)
    log("triage run complete")


# ---------- build stage ----------
SENSITIVE = ["~/.config", "~/.ssh", "~/.supabase", "~/.claude", "~/.claude.json", "~/Library/Keychains",
             "~/Library/Application Support/com.vercel.cli", "~/maintenance", "~/.local/state", "~/code",
             os.path.join(WORK, "triage"), os.path.join(WORK, "push"), os.path.join(WORK, "runner")]


def _expand(p):
    return p.replace("~", HOME, 1) if p.startswith("~") else p


def _rule(tool, p):
    p = _expand(p)
    return f"{tool}(/{p})" if p.endswith(".json") else f"{tool}(/{p}/**)"


FIX_SETTINGS = json.dumps({
    "sandbox": {"enabled": True, "failIfUnavailable": True, "autoAllowBashIfSandboxed": True,
                "allowUnsandboxedCommands": False, "network": {"allowedDomains": []},
                "filesystem": {"denyRead": [_expand(p) for p in SENSITIVE]}},
    "permissions": {
        "defaultMode": "dontAsk",
        "allow": ["Read(./**)", "Edit(./**)"],
        "deny": [r for p in SENSITIVE for r in (_rule("Read", p), _rule("Edit", p))]
                + ["Edit(./.git/**)", "Bash(git push:*)", "Bash(git remote:*)", "Bash(git config:*)", "Bash(curl:*)",
                   "Bash(gh:*)", "Bash(supabase:*)", "Bash(vercel:*)", "Bash(security:*)"],
    },
})
# Paths a fix may touch. Anything else (package.json, lockfile, vercel.json, config, ops/, .github) needs a human.
ALLOWED_PATHS = re.compile(r"^(src/|bugs/|supabase/migrations/|supabase/tests/|prds/|evals/|docs/|public/)")
BRANCH_RX = re.compile(r"^fix/(B\d{3,})-[a-z0-9-]+$")
# Hardened git for anything touching agent output: no hooks, no fsmonitor, no external diff/textconv.
SAFE_GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=", "-c", "diff.external=",
            "-c", "protocol.file.allow=always"]


def guard_diff(repo, base, head):
    """Problems with head vs base in the (trusted) pristine repo. [] = safe to push."""
    problems = []
    for f in run(SAFE_GIT + ["diff", "--no-ext-diff", "--no-textconv", "--name-only", f"{base}...{head}"], cwd=repo).split():
        if not ALLOWED_PATHS.match(f):
            problems.append(f"touches a file outside the allowed paths: {f}")
    for l in run(SAFE_GIT + ["diff", "--no-ext-diff", "--no-textconv", f"{base}...{head}"], cwd=repo).splitlines():
        if l.startswith("+") and not l.startswith("+++") and (m := PII_RX.search(l)):
            problems.append(f"added line looks like a secret or personal data: {m.group(0)[:12]}…")
    return problems


def pr_comment(n, text):
    if not DRY:
        run(["gh", "pr", "comment", str(n), "--repo", GH_REPO, "--body", text], check=False)


def hand_to_human(n, bid, why, detail=""):
    run(["gh", "pr", "edit", str(n), "--repo", GH_REPO, "--remove-label", "in-progress", "--add-label", "needs-human"], check=False)
    pr_comment(n, f"The local builder stopped: **{why}**. Left as a draft for Dan.")
    email_owner(f"[Family site] {bid} needs you: {why}"[:200], f"https://github.com/{GH_REPO}/pull/{n}\n\n{why}\n\n{detail}")
    log(f"build {bid}: needs human: {why}")


def build():
    _l = lock("build")
    prs = gh_json("pr", "list", "--repo", GH_REPO, "--state", "open", "--label", "bug", "--limit", "50",
                  "--json", "number,title,headRefName,isDraft,labels,createdAt") or []
    queue = sorted((p for p in prs if p["isDraft"] and BRANCH_RX.match(p["headRefName"])
                    and not ({l["name"] for l in p["labels"]} & {"in-progress", "needs-human"})),
                   key=lambda p: p["createdAt"])
    if not queue:
        log("build: queue empty")
        return
    pr = queue[0]
    n, branch = pr["number"], pr["headRefName"]
    bid = BRANCH_RX.match(branch).group(1)
    log(f"build: claiming #{n} {pr['title']}")
    if DRY:
        return
    run(["gh", "pr", "edit", str(n), "--repo", GH_REPO, "--add-label", "in-progress"])
    wt = os.path.join(WORK, bid)
    logf = os.path.join(STATE_DIR, f"{bid}-build.log")
    try:
        _build_claimed(n, branch, bid, pr["title"], wt, logf)
    except Exception as e:
        hand_to_human(n, bid, f"builder error: {str(e)[:150]}", f"Log: {logf}\nWork dir: {wt}")


def _build_claimed(n, branch, bid, title, wt, logf):
    # 1. Agent workspace: a fresh clone plus a copy-on-write copy of node_modules (APFS clonefile, so it's
    #    near-instant and the agent can't write through to the real one).
    run(["rm", "-rf", wt])
    run(["git", "clone", "-q", "--branch", branch, GH_URL, wt])
    run(["cp", "-c", "-R", os.path.join(DEPS_REPO, "node_modules"), os.path.join(wt, "node_modules")], timeout=900)
    bug_file = next((f for f in os.listdir(os.path.join(wt, "bugs")) if f.startswith(bid + "-")), None)
    if not bug_file:
        raise RuntimeError(f"no bugs/{bid}-*.md on {branch}")
    prompt = open(os.path.join(HERE, "fix-prompt.md")).read().replace("{BUG_FILE}", f"bugs/{bug_file}")

    # 2. The agent, sandboxed.
    try:
        r = subprocess.run(["claude", "-p", prompt, "--tools", "Read,Edit,Write,Glob,Grep,Bash", "--settings", FIX_SETTINGS,
                            "--permission-mode", "dontAsk", "--strict-mcp-config", "--max-budget-usd", "15"],
                           cwd=wt, capture_output=True, text=True, timeout=3600)
        out, err = r.stdout, r.stderr
    except subprocess.TimeoutExpired as e:
        out, err = (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or ""), "TIMEOUT after 3600s"
    open(logf, "w").write(out + "\n--- stderr ---\n" + err)
    last = (out.strip().splitlines() or [""])[-1].strip()
    fixed = last == "RESULT: FIXED"
    reason = last.split("NEEDS_HUMAN:", 1)[1].strip() if "NEEDS_HUMAN:" in last else (last[:150] or "fix agent gave no result")

    # 3. The agent's clone is UNTRUSTED from here on (it could have edited .git/: hooks, remotes, refs).
    #    Never run git in it unsandboxed. Pull its HEAD into a pristine clone we control, guard there,
    #    and push from there.
    push = os.path.join(WORK, "push")
    fresh_clone(push)
    run(SAFE_GIT + ["fetch", "-q", "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}"], cwd=push)
    run(SAFE_GIT + ["fetch", "-q", "--no-tags", "--upload-pack",
                    "git -c core.hooksPath=/dev/null -c core.fsmonitor= upload-pack",
                    f"file://{wt}", "+HEAD:refs/heads/candidate"], cwd=push)
    anc = subprocess.run(SAFE_GIT + ["merge-base", "--is-ancestor", f"origin/{branch}", "candidate"], cwd=push)
    if anc.returncode != 0:
        raise RuntimeError("agent's HEAD doesn't build on the PR branch (history rewritten?)")
    problems = guard_diff(push, "origin/main", "candidate")
    if problems:
        hand_to_human(n, bid, "safety check blocked the push", "\n".join(problems) + f"\n\nAgent output kept at {wt}\nLog: {logf}")
        return
    run(SAFE_GIT + ["push", "-q", "--no-verify", "origin", f"candidate:refs/heads/{branch}"], cwd=push)
    run(["rm", "-rf", wt])

    if fixed:
        run(["gh", "pr", "ready", str(n), "--repo", GH_REPO])
        run(["gh", "pr", "edit", str(n), "--repo", GH_REPO, "--remove-label", "in-progress"], check=False)
        pr_comment(n, "The local builder reports this **fixed** and the PR is ready for review. The bug file has the root "
                      "cause, the fix, and the steps to verify on prod after merge. (Vercel previews are off for `fix/B*` "
                      "branches, so check it locally.)")
        email_owner(f"[Family site] {bid} fix ready for review: {title}", f"https://github.com/{GH_REPO}/pull/{n}\nLog: {logf}")
        log(f"build {bid}: #{n} ready")
    else:
        hand_to_human(n, bid, reason, f"What was checked is in the bug file on the branch.\nLog: {logf}")


if __name__ == "__main__":
    stage = next((a for a in sys.argv[1:] if a in ("triage", "build")), None)
    if not stage:
        sys.exit("usage: intake.py triage|build [--dry-run]")
    try:
        triage() if stage == "triage" else build()
    except Exception as e:
        log(f"ERROR ({stage}): {e}")
        if not DRY:
            try:
                email_owner(f"[Family site] Intake {stage} failed", f"{dt.datetime.now():%F %T}\n\n{e}")
            except Exception:
                pass
        sys.exit(1)
