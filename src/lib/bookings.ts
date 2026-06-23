import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  BookingStatus,
  PeakPeriodRange,
} from "@/lib/db/schema";

export type { Booking, BookingStatus, PeakPeriodRange } from "@/lib/db/schema";

/**
 * Convert an "MM-DD" string to a {month, day} pair. Returns null on bad input
 * so we never throw on stored data — peak ranges are user-editable.
 */
function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/**
 * Does a calendar day fall within an MM-DD range? Range is inclusive on both
 * sides; if end is calendar-before start (e.g. 12-22 → 01-02), the range
 * wraps the year boundary.
 */
function dayInRange(
  date: Date,
  range: PeakPeriodRange,
): boolean {
  const start = parseMonthDay(range.start);
  const end = parseMonthDay(range.end);
  if (!start || !end) return false;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  // Encode as MMDD integer for easy comparison.
  const v = m * 100 + d;
  const s = start.month * 100 + start.day;
  const e = end.month * 100 + end.day;

  if (s <= e) return v >= s && v <= e;
  // Wraps year boundary.
  return v >= s || v <= e;
}

/**
 * True if any stay night [start, end) overlaps any peak range. Iterates
 * day-by-day because the ranges are recurring annual MM-DD windows — a
 * multi-year booking could touch the same window twice. Bookings are at
 * most a few weeks in practice, so this is fine.
 *
 * End is EXCLUSIVE (checkout). The day stored as `end_date` is the
 * departure day and is not a stay night.
 */
export function isInPeakPeriod(
  ranges: PeakPeriodRange[],
  startDate: Date,
  endDate: Date,
): boolean {
  if (ranges.length === 0) return false;
  const cur = new Date(startDate);
  // Normalize to local-midnight to keep the loop tight and predictable.
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cur.getTime() < end.getTime()) {
    for (const r of ranges) {
      if (dayInRange(cur, r)) return true;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

type FindOverlapOpts = {
  propertyId: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  statuses: BookingStatus[];
  excludeBookingId?: string;
};

/**
 * Booking-row shape returned by overlap queries. We only need a subset of the
 * full table for conflict-checking + display.
 */
export type OverlapBooking = Pick<
  Booking,
  | "id"
  | "propertyId"
  | "requestedBy"
  | "startDate"
  | "endDate"
  | "status"
  | "guestCount"
  | "notes"
>;

/**
 * Find bookings on a property whose [start, end) range overlaps the given
 * [startDate, endDate) window and whose status is in the given set. Uses the
 * (property_id, status, start_date, end_date) composite index.
 *
 * Both endpoints are EXCLUSIVE-end (half-open). Two half-open ranges
 * [a, b) and [c, d) overlap iff a < d AND b > c. Strict inequality is
 * what lets same-day turnover work (B starts the day A ends).
 */
export async function findOverlappingBookings(
  opts: FindOverlapOpts,
): Promise<OverlapBooking[]> {
  const supabase = await createClient();
  let q = supabase
    .from("bookings")
    .select(
      "id, property_id, requested_by, start_date, end_date, status, guest_count, notes",
    )
    .eq("property_id", opts.propertyId)
    .in("status", opts.statuses)
    .lt("start_date", opts.endDate)
    .gt("end_date", opts.startDate);
  if (opts.excludeBookingId) {
    q = q.neq("id", opts.excludeBookingId);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    requestedBy: r.requested_by,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status as BookingStatus,
    guestCount: r.guest_count,
    notes: r.notes,
  }));
}

/**
 * Given the conflict picture, decide whether a new request should land as
 * 'approved' or 'pending'. Callers MUST handle approved-overlap rejection
 * separately — this helper assumes the caller has already decided to insert.
 */
export function determineInitialStatus(opts: {
  peakRanges: PeakPeriodRange[];
  startDate: Date;
  endDate: Date;
  pendingOverlapCount: number;
}): "pending" | "approved" {
  if (opts.pendingOverlapCount > 0) return "pending";
  if (isInPeakPeriod(opts.peakRanges, opts.startDate, opts.endDate)) {
    return "pending";
  }
  return "approved";
}

/**
 * Parse an ISO YYYY-MM-DD as a local-midnight Date. Server-side this avoids
 * the timezone footgun where `new Date("2026-07-04")` is UTC midnight and
 * may render as July 3 in negative offsets.
 */
export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/**
 * Format a Date as YYYY-MM-DD in the *local* time zone — matches the parser
 * above. Used when we need to feed dates into Supabase date columns.
 */
export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
