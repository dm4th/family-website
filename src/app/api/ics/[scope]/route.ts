import { NextResponse } from "next/server";
import { createEvents, type EventAttributes } from "ics";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ scope: string }>;

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
): Promise<FeedBooking[] | null> {
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
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    notes: r.notes,
    guest_count: r.guest_count,
    propertyName: r.property_name,
    propertyLocation: r.property_location,
    guestName: r.guest_name ?? r.guest_email,
  }));
}

/**
 * Cookie path: a signed-in member viewing the feed in their browser. Reads
 * through normal RLS. Returns null when not signed in (→ 401).
 */
async function loadByCookie(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: string,
): Promise<FeedBooking[] | null> {
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

  if (scope === "me") {
    query = query.eq("requested_by", user.id);
  } else if (scope !== "all") {
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("slug", scope)
      .single();
    if (!property) return [];
    query = query.eq("property_id", property.id);
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    notes: r.notes,
    guest_count: r.guest_count,
    propertyName: r.properties?.name ?? "Property",
    propertyLocation: r.properties?.location ?? null,
    guestName: r.profiles?.full_name ?? r.profiles?.email ?? "—",
  }));
}

export async function GET(
  req: Request,
  { params }: { params: RouteParams },
) {
  const { scope } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const supabase = await createClient();

  // Token authorizes cookieless pollers; otherwise fall back to the session.
  const bookings = token
    ? await loadByToken(supabase, scope, token)
    : await loadByCookie(supabase, scope);

  if (bookings === null) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

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

  const { error, value } = createEvents(events);
  if (error || !value) {
    return new NextResponse("Failed to build calendar", { status: 500 });
  }

  return new NextResponse(value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Token feeds are polled by third-party servers; allow brief shared
      // caching. Cookie feeds stay private.
      "Cache-Control": token
        ? "public, max-age=300"
        : "private, max-age=300",
    },
  });
}
