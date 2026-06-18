import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  Eyebrow,
  LedgerPanel,
  PageIntro,
} from "@/components/shell";

import { MonthCalendar, type CalendarBand } from "../properties/[slug]/calendar/_components/month-calendar";

export const dynamic = "force-dynamic";

// Mode-accent tones for color-coding properties on the unified calendar.
// We rotate through these in property-id order so the assignment is stable.
const TONES = [
  "var(--accent-operations)",
  "var(--accent-family)",
  "var(--accent-advisory)",
  "var(--accent-bronze)",
];

type BookingRow = {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  profiles: { full_name: string | null; email: string } | null;
};

export default async function UnifiedCalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, slug, name")
    .order("name", { ascending: true });

  const propertyList = properties ?? [];
  const propertyTone = new Map<string, string>(
    propertyList.map((p, i) => [p.id, TONES[i % TONES.length]]),
  );
  const propertyName = new Map<string, string>(
    propertyList.map((p) => [p.id, p.name]),
  );
  const propertySlug = new Map<string, string>(
    propertyList.map((p) => [p.id, p.slug]),
  );

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 7, 0);

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      `id, property_id, start_date, end_date, status,
       profiles:requested_by ( full_name, email )`,
    )
    .in("status", ["approved", "pending"])
    .gte("end_date", start.toISOString().slice(0, 10))
    .lte("start_date", end.toISOString().slice(0, 10))
    .order("start_date", { ascending: true });

  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[];

  const bands: CalendarBand[] = bookings.map((b) => ({
    bookingId: b.id,
    startIso: b.start_date,
    endIso: b.end_date,
    status: b.status as "approved" | "pending",
    tone: propertyTone.get(b.property_id),
    label: propertyName.get(b.property_id) ?? "—",
  }));

  return (
    <div className="flex flex-col gap-14">
      <PageIntro
        mode="operations"
        eyebrow="Calendar"
        title="All properties"
        context="Color-coded across every family property."
      />

      <LedgerPanel className="px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-center gap-4">
          <Eyebrow>Legend</Eyebrow>
          <ul className="flex flex-wrap gap-3">
            {propertyList.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: propertyTone.get(p.id),
                  }}
                />
                <Link
                  href={`/properties/${p.slug}/calendar`}
                  className="text-sm text-foreground underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </LedgerPanel>

      <MonthCalendar bands={bands} />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
          Upcoming
        </h2>
        {bookings.length === 0 ? (
          <p className="text-sm italic text-foreground-subtle">
            Nothing on the books yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {bookings
              .filter((b) => b.status === "approved")
              .slice(0, 25)
              .map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-baseline justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm text-foreground">
                      <Link
                        href={`/properties/${propertySlug.get(b.property_id)}/calendar`}
                        className="underline-offset-4 hover:underline"
                      >
                        {propertyName.get(b.property_id)}
                      </Link>{" "}
                      <span className="text-foreground-subtle">
                        · {b.start_date} → {b.end_date}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-foreground-subtle">
                      {b.profiles?.full_name ?? b.profiles?.email ?? "—"}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
