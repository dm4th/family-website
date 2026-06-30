#!/usr/bin/env bash
#
# PRD 15 — Guest Access: direct-PostgREST negative suite.
#
# RLS correctness can't be eyeballed; these are the acceptance criteria. This
# hits the REST API DIRECTLY with a guest's access token (not the UI), so it
# proves the database — not just the app — enforces the scoping.
#
# Prereqs: the migration (20260629000002_guest_access.sql) is applied, and you
# have a guest who has been granted exactly ONE property.
#
# Usage:
#   export SUPABASE_URL="https://<project>.supabase.co"
#   export SUPABASE_ANON_KEY="<publishable/anon key>"   # the apikey header
#   export GUEST_TOKEN="<a guest user's access_token (JWT)>"
#   export GRANTED_PROPERTY_ID="<uuid the guest is granted>"   # optional, for self-grant test
#   export OTHER_PROPERTY_ID="<uuid the guest is NOT granted>" # optional, for self-grant test
#   ./scripts/verify-guest-access.sh
#
# How to get GUEST_TOKEN: sign in as the guest (incognito), then in the browser
# console run `JSON.parse(localStorage[Object.keys(localStorage).find(k=>k.includes('auth-token'))]).access_token`
# or pull it from the Supabase session. The token encodes the guest's identity;
# PostgREST applies their RLS to every call below.
#
# Exit code is non-zero if any check fails.

set -u

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
: "${GUEST_TOKEN:?set GUEST_TOKEN}"

REST="${SUPABASE_URL%/}/rest/v1"
PASS=0
FAIL=0

# GET a table and return the JSON array length (or -1 on a non-2xx).
count() {
  local path="$1"
  local body http
  body="$(curl -sS -w $'\n%{http_code}' \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${GUEST_TOKEN}" \
    "${REST}/${path}")"
  http="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [[ "$http" =~ ^2 ]]; then
    printf '%s' "$body" | jq 'length' 2>/dev/null || echo "-1"
  else
    echo "-1"
  fi
}

# Assert the row count returned for a table matches an expectation.
#   check_count "<label>" "<path>" "<op>" "<n>"   op ∈ {eq,le}
check_count() {
  local label="$1" path="$2" op="$3" want="$4"
  local got; got="$(count "$path")"
  local ok=0
  case "$op" in
    eq) [[ "$got" == "$want" ]] && ok=1 ;;
    le) [[ "$got" != "-1" && "$got" -le "$want" ]] && ok=1 ;;
  esac
  if [[ "$ok" == 1 ]]; then
    echo "  ✅ $label — got $got row(s)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label — expected $op $want, got $got"
    FAIL=$((FAIL+1))
  fi
}

# Assert a write is denied (non-2xx).
check_denied() {
  local label="$1"; shift
  local http
  http="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"
  if [[ "$http" =~ ^2 ]]; then
    echo "  ❌ $label — write SUCCEEDED (http $http); RLS did not block it"
    FAIL=$((FAIL+1))
  else
    echo "  ✅ $label — denied (http $http)"
    PASS=$((PASS+1))
  fi
}

echo "== Guest read scoping (only granted/own rows; family-only tables empty) =="
check_count "profiles → own row only"        "profiles?select=id"              eq 1
check_count "properties → granted only"      "properties?select=id"            le 2
check_count "people → hidden"                "people?select=id"                eq 0
check_count "revisions → hidden"             "revisions?select=id"             eq 0
check_count "invitations → hidden"           "invitations?select=id"           eq 0
check_count "photo_subjects → hidden"        "photo_subjects?select=photo_id"  eq 0
check_count "property_admins → hidden"       "property_admins?select=property_id" eq 0
check_count "bookings → own only (0 in v1)"  "bookings?select=id"              eq 0

echo
echo "== Guest write guards (every one must be DENIED) =="

# Role self-escalation on own profile.
OWN_ID="$(curl -sS -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${GUEST_TOKEN}" \
  "${REST}/profiles?select=id" | jq -r '.[0].id // empty')"
if [[ -n "${OWN_ID}" ]]; then
  check_denied "PATCH own profile role=admin" \
    -X PATCH "${REST}/profiles?id=eq.${OWN_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${GUEST_TOKEN}" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d '{"role":"admin"}'
else
  echo "  ⚠️  couldn't resolve own profile id — skipping role-escalation check"
fi

# Self-grant a property_guests row (needs a property id to target).
if [[ -n "${OTHER_PROPERTY_ID:-}" && -n "${OWN_ID:-}" ]]; then
  check_denied "POST property_guests self-grant" \
    -X POST "${REST}/property_guests" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${GUEST_TOKEN}" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"property_id\":\"${OTHER_PROPERTY_ID}\",\"profile_id\":\"${OWN_ID}\",\"granted_by\":\"${OWN_ID}\"}"
else
  echo "  ⚠️  set OTHER_PROPERTY_ID to exercise the self-grant denial"
fi

# Wiki edit a property (granted or not — guests never write).
if [[ -n "${GRANTED_PROPERTY_ID:-}" ]]; then
  check_denied "PATCH properties wiki edit" \
    -X PATCH "${REST}/properties?id=eq.${GRANTED_PROPERTY_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${GUEST_TOKEN}" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d '{"description":"guest tried to edit"}'
else
  echo "  ⚠️  set GRANTED_PROPERTY_ID to exercise the wiki-edit denial"
fi

echo
echo "----------------------------------------"
echo "PASS=${PASS}  FAIL=${FAIL}"
echo
echo "Manual checks NOT automated here (do them too):"
echo "  • Deactivate this guest, re-run: counts must NOT widen (no member access)."
echo "  • property_contacts / photos: only granted-property rows; no legacy/profile photos."
echo "  • UI: /family /admin /calendar /photos redirect; non-granted property 404s."
[[ "${FAIL}" -eq 0 ]]
