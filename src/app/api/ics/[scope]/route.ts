import { NextResponse } from "next/server";
import { createEvents, type EventAttributes } from "ics";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_HORIZON_MONTHS,
  expandOccurrences,
  horizonFrom,
  todayIso,
  type ReminderRecurrence,
} from "@/lib/reminders";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ scope: string }>;

/** What either auth path resolves to. */
type FeedData = { bookings: FeedBooking[]; reminders: FeedReminder[] };

/** A reminder as the feed needs it, from either auth path. */
type FeedReminder = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string;
  recurrence: ReminderRecurrence;
  propertyName: string;
  propertyLocation: string | null;
};

// Normalized booking shape both auth paths reduce to before event building.
type FeedBooking = {
  id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  guest_count: number;
  propertyName: string;
  propertyLocation: string | null;
  guestName: string;
};

/**
 * Convert "YYYY-MM-DD" to an ics DateArray. Our stored end_date is already the
 * EXCLUSIVE checkout day, which matches RFC 5545's DTEND-is-exclusive
 * convention for all-day events — no offset needed.
 */
function toDateArray(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Bad ISO date ${iso}`);
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

function feedTitle(scope: string, bookings: FeedBooking[]): string {
  if (scope === "me") return "Mathieson Family: My Bookings";
  if (scope === "all") return "Mathieson Family: All Properties";
  // Property scope: prefer the real name (from the first row) over the slug.
  const name = bookings[0]?.propertyName ?? scope;
  return `Mathieson Family: ${name}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Token path: cookieless callers (Google/Apple/Outlook pollers) authorize with
 * `?token=`. A SECURITY DEFINER function validates the token and returns the
 * scope's approved bookings, bypassing RLS (the request has no JWT). Returns
 * null to signal an invalid/absent token → the route answers 401.
 */
async function loadByToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: string,
  token: string,
): Promise<FeedData | null> {
  // A feed token is always a uuid. Reject anything else up front as
  // unauthorized — otherwise PostgREST tries to cast it and raises a 22P02
  // (invalid_text_representation), which would surface as a 500 to a poller
  // probing with a junk token instead of a clean 401.
  if (!UUID_RE.test(token)) return null;

  const { data, error } = await supabase.rpc("ics_bookings_for_token", {
    p_token: token,
    p_scope: scope,
  });
  if (error) {
    // Treat an invalid/unparseable token as unauthorized (401), not a 500:
    //   28000 = the function's explicit "invalid ics token" raise
    //   22P02 = a malformed uuid that slipped past the guard (defensive)
    if (error.code === "28000" || error.code === "22P02") return null;
    throw new Error(error.message);
  }
  type Row = {
    id: string;
    start_date: string;
    end_date: string;
    notes: string | null;
    guest_count: number;
    property_name: string;
    property_location: string | null;
    guest_name: string | null;
    guest_email: string;
  };
  const bookings = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    notes: r.notes,
    guest_count: r.guest_count,
    propertyName: r.property_name,
    propertyLocation: r.property_location,
    guestName: r.guest_name ?? r.guest_email,
  }));

  // Reminders come from their own SECURITY DEFINER function, which repeats the
  // same token/deactivation checks and returns nothing at all for a guest.
  // Best-effort: a failure here costs the reminders, not the bookings.
  const { data: reminderData } = await supabase.rpc("ics_reminders_for_token", {
    p_token: token,
    p_scope: scope,
  });
  type ReminderRpcRow = {
    id: string;
    title: string;
    notes: string | null;
    due_date: string;
    recurrence: ReminderRecurrence;
    property_name: string;
    property_location: string | null;
  };
  const reminders = ((reminderData ?? []) as ReminderRpcRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    due_date: r.due_date,
    recurrence: r.recurrence,
    propertyName: r.property_name,
    propertyLocation: r.property_location,
  }));

  return { bookings, reminders };
}

/**
 * Cookie path: a signed-in member viewing the feed in their browser. Reads
 * through normal RLS. Returns null when not signed in (→ 401).
 */
async function loadByCookie(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: string,
): Promise<FeedData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  type Row = {
    id: string;
    start_date: string;
    end_date: string;
    notes: string | null;
    guest_count: number;
    properties: { name: string; slug: string; location: string | null } | null;
    profiles: { full_name: string | null; email: string } | null;
  };

  let query = supabase
    .from("bookings")
    .select(
      `id, start_date, end_date, notes, guest_count,
       properties:property_id ( name, slug, location ),
       profiles:requested_by ( full_name, email )`,
    )
    .eq("status", "approved")
    .order("start_date", { ascending: true });

  // Scoping a property once, up front: both bookings and reminders need it.
  let scopedPropertyId: string | null = null;
  if (scope === "me") {
    query = query.eq("requested_by", user.id);
  } else if (scope !== "all") {
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("slug", scope)
      .single();
    if (!property) return { bookings: [], reminders: [] };
    scopedPropertyId = property.id;
    query = query.eq("property_id", property.id);
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const bookings = rows.map((r) => ({
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    notes: r.notes,
    guest_count: r.guest_count,
    propertyName: r.properties?.name ?? "Property",
    propertyLocation: r.properties?.location ?? null,
    guestName: r.profiles?.full_name ?? r.profiles?.email ?? "—",
  }));

  // "me" is a personal booking feed; a reminder belongs to a property, not to a
  // person, so that scope carries none. Mirrors ics_reminders_for_token.
  // Guests get an empty list from RLS.
  let reminders: FeedReminder[] = [];
  if (scope !== "me") {
    type ReminderRow = {
      id: string;
      title: string;
      notes: string | null;
      due_date: string;
      recurrence: ReminderRecurrence;
      properties: { name: string; location: string | null } | null;
    };
    let reminderQuery = supabase
      .from("property_reminders")
      .select(
        `id, title, notes, due_date, recurrence,
         properties:property_id ( name, location )`,
      )
      .order("due_date", { ascending: true });
    if (scopedPropertyId) {
      reminderQuery = reminderQuery.eq("property_id", scopedPropertyId);
    }
    const { data: reminderData } = await reminderQuery;
    reminders = ((reminderData ?? []) as unknown as ReminderRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      due_date: r.due_date,
      recurrence: r.recurrence,
      propertyName: r.properties?.name ?? "Property",
      propertyLocation: r.properties?.location ?? null,
    }));
  }

  return { bookings, reminders };
}

export async function GET(
  req: Request,
  { params }: { params: RouteParams },
) {
  const { scope } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const supabase = await createClient();

  // Token authorizes cookieless pollers; otherwise fall back to the session.
  const feed = token
    ? await loadByToken(supabase, scope, token)
    : await loadByCookie(supabase, scope);

  if (feed === null) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { bookings, reminders } = feed;
  const title = feedTitle(scope, bookings);
  const events: EventAttributes[] = bookings.map((b) => ({
    title: `${b.propertyName} | ${b.guestName}`,
    start: toDateArray(b.start_date),
    end: toDateArray(b.end_date),
    uid: `booking-${b.id}@mathiesonfamily.app`,
    description:
      (b.notes ? b.notes + "\n\n" : "") +
      `${b.guest_count} guest${b.guest_count === 1 ? "" : "s"}`,
    location: b.propertyLocation ?? undefined,
    status: "CONFIRMED",
    busyStatus: "BUSY",
    calName: title,
    productId: "mathiesonfamily.app/ics",
  }));

  // Reminders are emitted as one all-day VEVENT per occurrence rather than as a
  // single event carrying an RRULE. That is deliberate: RFC 5545's monthly rule
  // SKIPS months that have no such day, so a bill due the 31st would simply
  // vanish in February in the subscriber's calendar while still showing on the
  // site, which clamps. Expanding here with the same function the site uses
  // means the two can't tell a member different things. The cost is a bounded
  // handful of extra VEVENTs.
  const from = todayIso();
  const horizonEnd = horizonFrom(from, DEFAULT_HORIZON_MONTHS);
  for (const r of reminders) {
    for (const iso of expandOccurrences(
      r.due_date,
      r.recurrence,
      from,
      horizonEnd,
    )) {
      const day = toDateArray(iso);
      events.push({
        title: `${r.propertyName} | ${r.title}`,
        start: day,
        // All-day, single day. DTEND is exclusive in RFC 5545, so the duration
        // says one day rather than computing tomorrow's date by hand.
        duration: { days: 1 },
        // Occurrence-scoped uid: each date is its own event to the subscriber,
        // and re-fetching the feed updates them in place rather than duplicating.
        uid: `reminder-${r.id}-${iso}@mathiesonfamily.app`,
        description: r.notes ?? undefined,
        location: r.propertyLocation ?? undefined,
        status: "CONFIRMED",
        // A bill due doesn't make anyone unavailable.
        busyStatus: "FREE",
        transp: "TRANSPARENT",
        calName: title,
        productId: "mathiesonfamily.app/ics",
      });
    }
  }

  const { error, value } = createEvents(events);
  if (error || !value) {
    return new NextResponse("Failed to build calendar", { status: 500 });
  }

  return new NextResponse(value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Both paths stay private. The token IS the secret and lives in the URL,
      // and token feeds are now guest-scoped (PRD 25) — a shared/CDN cache
      // keyed on the URL must never serve one caller's scoped feed to another.
      // Third-party pollers (Google/Apple) fetch per-subscriber anyway, so
      // brief per-client caching is all we need.
      "Cache-Control": "private, max-age=300",
    },
  });
}
