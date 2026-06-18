import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";
import {
  Eyebrow,
  LedgerPanel,
  PageIntro,
  SectionRule,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { PeakPeriodRange } from "@/lib/db/schema";

import { BookingRequestForm } from "./_components/booking-request-form";
import { AdminBookingRow } from "./_components/admin-booking-row";
import { OwnBookingCancel } from "./_components/own-booking-cancel";
import type { CalendarBand } from "./_components/month-calendar";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

type BookingRow = {
  id: string;
  start_date: string;
  end_date: string;
  guest_count: number;
  notes: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  requested_by: string;
  approved_by: string | null;
  cancellation_notes: string | null;
  profiles: { full_name: string | null; email: string } | null;
};

// end_date is EXCLUSIVE (checkout). For display we render the inclusive
// "first night → last night" range — clearer for the family ("Jun 14 → 20"
// reads as 7 nights), and avoids the trap of users assuming they hold the
// checkout day.
function formatRange(startIso: string, endIsoExclusive: string): string {
  const start = new Date(startIso + "T00:00:00");
  const lastNight = new Date(endIsoExclusive + "T00:00:00");
  lastNight.setDate(lastNight.getDate() - 1);
  const sameMonth =
    start.getFullYear() === lastNight.getFullYear() &&
    start.getMonth() === lastNight.getMonth();
  const fmt: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (sameMonth) {
    const startFmt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(start);
    return `${startFmt} → ${lastNight.getDate()}, ${lastNight.getFullYear()}`;
  }
  return `${new Intl.DateTimeFormat("en-US", fmt).format(start)} → ${new Intl.DateTimeFormat(
    "en-US",
    fmt,
  ).format(lastNight)}`;
}

export default async function PropertyCalendarPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, location, max_guests, peak_period_ranges",
    )
    .eq("slug", slug)
    .single();
  if (error || !property) notFound();

  const { ok: canAdmin } = await canManageProperty(property.id);

  // Pull a generous window so the calendar can scroll freely without refetch.
  // Bookings outside ±6 months are reachable via the agenda list.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 7, 0);

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      `id, start_date, end_date, guest_count, notes, status, requested_by,
       approved_by, cancellation_notes,
       profiles:requested_by ( full_name, email )`,
    )
    .eq("property_id", property.id)
    .gte("end_date", start.toISOString().slice(0, 10))
    .lte("start_date", end.toISOString().slice(0, 10))
    .order("start_date", { ascending: true });

  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[];

  const visibleBookings = bookings.filter(
    (b) => b.status === "approved" || b.status === "pending",
  );
  const bands: CalendarBand[] = visibleBookings.map((b) => ({
    bookingId: b.id,
    startIso: b.start_date,
    endIso: b.end_date,
    status: b.status as "approved" | "pending",
    label: (b.profiles?.full_name ?? b.profiles?.email ?? "—").split(" ")[0],
  }));
  const pendingBands = bookings
    .filter((b) => b.status === "pending")
    .map((b) => ({ startIso: b.start_date, endIso: b.end_date }));

  const peakRanges = (property.peak_period_ranges ?? []) as PeakPeriodRange[];
  const pending = bookings.filter((b) => b.status === "pending");
  const upcomingApproved = bookings.filter(
    (b) => b.status === "approved" && b.end_date >= start.toISOString().slice(0, 10),
  );
  const myBookings = bookings.filter(
    (b) =>
      b.requested_by === user.id &&
      (b.status === "pending" || b.status === "approved"),
  );

  return (
    <div className="flex flex-col gap-14">
      <PageIntro
        mode="operations"
        eyebrow="Calendar"
        title={property.name}
        context={
          property.location ? `Bookings · ${property.location}` : "Bookings"
        }
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/properties/${property.slug}`}>Back to property</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/api/ics/${property.slug}`}>Subscribe (ICS)</Link>
            </Button>
          </div>
        }
      />

      {canAdmin && pending.length > 0 && (
        <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <Eyebrow>Pending requests</Eyebrow>
              <h2 className="font-display text-xl leading-tight text-foreground">
                Awaiting your call
              </h2>
            </div>
            <span className="text-xs text-foreground-subtle">
              {pending.length} request{pending.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {pending.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {formatRange(b.start_date, b.end_date)}
                  </p>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {b.profiles?.full_name ?? b.profiles?.email ?? "Unknown"} ·{" "}
                    {b.guest_count} guest{b.guest_count === 1 ? "" : "s"}
                  </p>
                  {b.notes && (
                    <p className="mt-2 text-xs italic text-foreground-muted">
                      {b.notes}
                    </p>
                  )}
                </div>
                <AdminBookingRow bookingId={b.id} mode="pending" />
              </li>
            ))}
          </ul>
        </LedgerPanel>
      )}

      <div className="grid gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-8">
          <BookingRequestForm
            propertyId={property.id}
            bands={bands}
            maxGuests={property.max_guests ?? null}
            peakRanges={peakRanges}
            pendingBands={pendingBands}
          />
        </div>

        <aside className="flex flex-col gap-10 lg:sticky lg:top-24 lg:self-start">
          <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <Eyebrow>Your bookings</Eyebrow>
              <h3 className="font-display text-lg leading-tight text-foreground">
                Your stays
              </h3>
            </div>
            {myBookings.length === 0 ? (
              <p className="px-5 py-6 text-sm italic text-foreground-subtle sm:px-6">
                You haven&apos;t booked this property yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {myBookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6"
                  >
                    <div>
                      <p className="text-sm text-foreground">
                        {formatRange(b.start_date, b.end_date)}
                      </p>
                      <p className="mt-1 text-xs text-foreground-subtle capitalize">
                        {b.status}
                      </p>
                    </div>
                    <OwnBookingCancel bookingId={b.id} />
                  </li>
                ))}
              </ul>
            )}
          </LedgerPanel>

          {peakRanges.length > 0 && (
            <LedgerPanel className="px-5 py-6 sm:px-6 sm:py-7">
              <Eyebrow className="mb-3">Peak windows</Eyebrow>
              <p className="text-xs text-foreground-subtle">
                These dates require admin approval each year.
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-foreground">
                {peakRanges.map((r, i) => (
                  <li key={i}>
                    {r.start} → {r.end}
                  </li>
                ))}
              </ul>
            </LedgerPanel>
          )}
        </aside>
      </div>

      <SectionRule label="The agenda" />

      <section className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Upcoming approved bookings
          </h2>
          <p className="text-xs text-foreground-subtle">
            Window: ±6 months from today
          </p>
        </header>
        {upcomingApproved.length === 0 ? (
          <p className="text-sm italic text-foreground-subtle">
            No approved bookings yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {upcomingApproved.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">
                    {formatRange(b.start_date, b.end_date)}
                  </p>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {b.profiles?.full_name ?? b.profiles?.email ?? "—"} ·{" "}
                    {b.guest_count} guest{b.guest_count === 1 ? "" : "s"}
                  </p>
                </div>
                {(canAdmin || b.requested_by === user.id) && (
                  <span className="text-xs text-foreground-subtle">
                    {b.requested_by === user.id ? "you" : "approved"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
