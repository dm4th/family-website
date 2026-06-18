import { NextResponse } from "next/server";
import { createEvents, type EventAttributes } from "ics";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ scope: string }>;

/**
 * Convert "YYYY-MM-DD" to an ics DateArray in local time. End dates in iCal
 * are exclusive — for an all-day booking that ends Friday, the VEVENT DTEND
 * is Saturday. We add a day to express that semantics.
 */
function toDateArray(iso: string, addDays = 0): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Bad ISO date ${iso}`);
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10) + addDays,
  );
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export async function GET(
  _req: Request,
  { params }: { params: RouteParams },
) {
  const { scope } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  type BookingRow = {
    id: string;
    start_date: string;
    end_date: string;
    notes: string | null;
    guest_count: number;
    properties: { name: string; slug: string; location: string | null } | null;
    profiles: { full_name: string | null; email: string } | null;
  };
  let bookings: BookingRow[] = [];
  let feedTitle = "Mathieson Family";

  if (scope === "me") {
    const { data } = await supabase
      .from("bookings")
      .select(
        `id, start_date, end_date, notes, guest_count,
         properties:property_id ( name, slug, location ),
         profiles:requested_by ( full_name, email )`,
      )
      .eq("requested_by", user.id)
      .eq("status", "approved")
      .order("start_date", { ascending: true });
    bookings = (data ?? []) as unknown as BookingRow[];
    feedTitle = "Mathieson Family — My bookings";
  } else {
    const { data: property } = await supabase
      .from("properties")
      .select("id, name")
      .eq("slug", scope)
      .single();
    if (!property) {
      return new NextResponse("Not found", { status: 404 });
    }
    const { data } = await supabase
      .from("bookings")
      .select(
        `id, start_date, end_date, notes, guest_count,
         properties:property_id ( name, slug, location ),
         profiles:requested_by ( full_name, email )`,
      )
      .eq("property_id", property.id)
      .eq("status", "approved")
      .order("start_date", { ascending: true });
    bookings = (data ?? []) as unknown as BookingRow[];
    feedTitle = `Mathieson Family — ${property.name}`;
  }

  const events: EventAttributes[] = bookings.map((b) => {
    const guest = b.profiles?.full_name ?? b.profiles?.email ?? "—";
    const propName = b.properties?.name ?? "Property";
    return {
      title: scope === "me" ? propName : guest,
      start: toDateArray(b.start_date),
      end: toDateArray(b.end_date, 1),
      uid: `booking-${b.id}@mathiesonfamily.app`,
      description:
        (b.notes ? b.notes + "\n\n" : "") +
        `${b.guest_count} guest${b.guest_count === 1 ? "" : "s"}`,
      location: b.properties?.location ?? undefined,
      status: "CONFIRMED",
      busyStatus: "BUSY",
      calName: feedTitle,
      productId: "mathiesonfamily.app/ics",
    };
  });

  const { error, value } = createEvents(events);
  if (error || !value) {
    return new NextResponse("Failed to build calendar", { status: 500 });
  }

  return new NextResponse(value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
