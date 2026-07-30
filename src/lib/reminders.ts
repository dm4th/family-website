/**
 * Reminder recurrence: one stored rule, expanded into dates on demand.
 *
 * A repeating reminder is a single row (`property_reminders`), not eighty rows.
 * Everything that needs to show it on a date — the property calendar, the
 * unified calendar, the subscribed calendar feed — calls `expandOccurrences`
 * here. That is the whole point of this file: **one expansion, used everywhere**,
 * so the date the site shows and the date that lands in someone's phone can't
 * drift apart.
 *
 * All dates are handled as plain "YYYY-MM-DD" strings and plain Y/M/D
 * arithmetic, never as `Date` instants. A due date is a calendar square, not a
 * moment; parsing it into a `Date` invites a timezone to shift it a day, which
 * is exactly the bug a reminder feature can least afford.
 */

import type { ReminderRecurrence } from "@/lib/db/schema";

export type { ReminderRecurrence };

/** How often a reminder repeats, in the member's words. */
export const RECURRENCE_LABELS: Record<ReminderRecurrence, string> = {
  none: "Just once",
  monthly: "Every month",
  quarterly: "Every three months",
  annually: "Every year",
};

/** Months between occurrences. `none` never repeats. */
const RECURRENCE_MONTHS: Record<ReminderRecurrence, number> = {
  none: 0,
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

export const RECURRENCE_VALUES: ReminderRecurrence[] = [
  "none",
  "monthly",
  "quarterly",
  "annually",
];

export function isReminderRecurrence(
  value: unknown,
): value is ReminderRecurrence {
  return (
    typeof value === "string" &&
    (RECURRENCE_VALUES as string[]).includes(value)
  );
}

type Ymd = { year: number; month: number; day: number };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD". Returns null for anything else, including "2026-02-31". */
export function parseYmd(iso: string): Ymd | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatYmd({ year, month, day }: Ymd): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. Constructed in local
  // time and read back in local time, so no zone can shift it.
  return new Date(year, month, 0).getDate();
}

/**
 * Add whole months, clamping the day to the end of the target month.
 *
 * The 31st matters here. A bill due the 31st, repeating monthly, has no 31st of
 * February to land on. RFC 5545's default answer is to *skip* February
 * entirely; ours is to clamp to the 28th. Clamping is the right answer for this
 * feature: a member who set "due the 31st" means the end of the month, and a
 * reminder that silently vanishes in February is worse than one that arrives on
 * the 28th. The feed emits our expanded dates rather than an RRULE precisely so
 * a subscriber's calendar app can't apply the other rule.
 */
function addMonthsClamped(anchor: Ymd, months: number): Ymd {
  const zeroBased = anchor.month - 1 + months;
  const year = anchor.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { year, month, day: Math.min(anchor.day, daysInMonth(year, month)) };
}

/**
 * How far ahead a never-ending reminder is projected when no explicit window is
 * given. Long enough that a subscriber's calendar shows next year's renewal,
 * short enough that the feed stays small.
 */
export const DEFAULT_HORIZON_MONTHS = 24;

/**
 * Every date this reminder falls on within `[windowStart, windowEnd]`, inclusive.
 *
 * Occurrences before the due date don't exist — a reminder created today with a
 * monthly repeat starts today, it was not also due every month of last year.
 * A window entirely before the due date yields nothing.
 */
export function expandOccurrences(
  dueDate: string,
  recurrence: ReminderRecurrence,
  windowStart: string,
  windowEnd: string,
): string[] {
  const anchor = parseYmd(dueDate);
  if (!anchor) return [];
  if (windowEnd < windowStart) return [];

  const step = RECURRENCE_MONTHS[recurrence] ?? 0;
  if (step === 0) {
    return dueDate >= windowStart && dueDate <= windowEnd ? [dueDate] : [];
  }

  // Jump straight to the first occurrence at or after the window rather than
  // stepping from the anchor, so a monthly reminder set years ago doesn't cost
  // hundreds of iterations every time a month renders.
  const start = parseYmd(windowStart);
  if (!start) return [];
  const monthsToWindow =
    (start.year - anchor.year) * 12 + (start.month - anchor.month);
  // Divided by the step, because the index counts *occurrences*, not months —
  // a quarterly reminder eleven months out is at index 3, not index 11. Then one
  // step back, because clamping means the occurrence in the window's first month
  // can still land before windowStart (or, going the other way, the previous
  // occurrence's clamped date can land inside it).
  let index = Math.max(0, Math.floor(monthsToWindow / step) - 1);

  const out: string[] = [];
  // Bounded so a malformed window can never spin forever. 12 years of monthly
  // occurrences is far beyond any window this app renders.
  for (let guard = 0; guard < 512; guard += 1) {
    const iso = formatYmd(addMonthsClamped(anchor, index * step));
    if (iso > windowEnd) break;
    if (iso >= windowStart && iso >= dueDate) out.push(iso);
    index += 1;
  }
  return out;
}

/**
 * The next date this reminder is due, on or after `from`. Null for a one-off
 * that has already passed.
 */
export function nextOccurrence(
  dueDate: string,
  recurrence: ReminderRecurrence,
  from: string,
): string | null {
  const anchor = parseYmd(from);
  if (!anchor) return null;
  const horizonEnd = formatYmd(
    addMonthsClamped(anchor, DEFAULT_HORIZON_MONTHS),
  );
  return expandOccurrences(dueDate, recurrence, from, horizonEnd)[0] ?? null;
}

/**
 * "2026-08-15" → "Aug 15, 2026".
 *
 * Built from the Y/M/D parts rather than `new Date(iso)`, which parses a bare
 * date as UTC midnight and renders as the day before anywhere west of Greenwich.
 */
export function formatDueDate(iso: string): string {
  const parts = parseYmd(iso);
  if (!parts) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parts.year, parts.month - 1, parts.day));
}

/** Today as "YYYY-MM-DD" in the viewer's local calendar. */
export function todayIso(now: Date = new Date()): string {
  return formatYmd({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}
