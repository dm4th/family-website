"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type CalendarBand = {
  bookingId: string;
  startIso: string; // YYYY-MM-DD, inclusive (first stay night)
  endIso: string; // YYYY-MM-DD, EXCLUSIVE (checkout — not painted)
  status: "approved" | "pending";
  tone?: string; // optional CSS color, used by unified /calendar
  label?: string;
};

/**
 * A range selection in progress or complete. Both bounds are INCLUSIVE stay
 * nights (start = arrive, end = last night). `end` is null after the first tap
 * (Arrive chosen) and stays null until the second tap sets the last night — so
 * the parent can render "Last night" blank until the stay is fully picked.
 */
export type DateSelection = { start: string; end: string | null };

type Props = {
  initialMonth?: Date;
  bands: CalendarBand[];
  /**
   * When provided, the calendar becomes a two-tap range picker (touch-first):
   * the first tap sets Arrive (`{start, end: null}`), the second tap on or
   * after Arrive completes the stay (`{start, end}`). A tap before Arrive
   * restarts the selection. The component is controlled — it reports each step
   * via this callback and renders from the `selection` prop.
   */
  onSelect?: (range: DateSelection | null) => void;
  selection?: DateSelection | null;
  /**
   * Treat each cell as a button that navigates to the booking detail when
   * clicked. Used on the unified calendar where there's no form.
   */
  cellHref?: (date: Date) => string | undefined;
};

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(NaN);
  return new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
}

function eachDayInclusive(start: Date, end: Date): Date[] {
  // Inclusive [start, end] — used to lay out the visible month grid. NOT used
  // for booking bands; see eachStayNight.
  const days: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function eachStayNight(startIso: string, endIsoExclusive: string): Date[] {
  // Half-open [start, end). The day stored as end_date is checkout, not a
  // stay night, so the booking band stops before it. This matches what
  // findOverlappingBookings expects on the conflict-math side.
  const s = fromIso(startIso);
  const e = fromIso(endIsoExclusive);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  const days: Date[] = [];
  const cur = new Date(s);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(e);
  stop.setHours(0, 0, 0, 0);
  while (cur.getTime() < stop.getTime()) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function MonthCalendar({
  initialMonth,
  bands,
  onSelect,
  selection,
  cellHref,
}: Props) {
  const [viewMonth, setViewMonth] = useState<Date>(
    () => startOfMonth(initialMonth ?? new Date()),
  );

  const gridStart = startOfWeek(viewMonth, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
  const days = useMemo(
    () => eachDayInclusive(gridStart, gridEnd),
    [gridStart, gridEnd],
  );

  // Map each date to the bands that cover it. endIso is exclusive (checkout)
  // so the band stops short of that day.
  const bandsByDay = useMemo(() => {
    const map = new Map<string, CalendarBand[]>();
    for (const b of bands) {
      for (const d of eachStayNight(b.startIso, b.endIso)) {
        const key = toIso(d);
        const arr = map.get(key) ?? [];
        arr.push(b);
        map.set(key, arr);
      }
    }
    return map;
  }, [bands]);

  // The picker is fully controlled by `selection`. `awaitingLastNight` is true
  // between the first and second tap, so we can prompt for the last night.
  const awaitingLastNight = !!selection && selection.end === null;

  // Tap-to-select (works on touch and desktop). One tap never commits a stay
  // on its own — it only sets Arrive — so an accidental tap can't silently
  // book a one-night stay. The second tap completes the range.
  function onCellClick(iso: string) {
    if (!onSelect) return;
    if (!selection || selection.end !== null) {
      // Nothing pending, or a complete stay already exists → start fresh.
      onSelect({ start: iso, end: null });
    } else if (iso < selection.start) {
      // Tapped before Arrive → treat as a new, earlier Arrive (restart).
      onSelect({ start: iso, end: null });
    } else {
      // Second tap on/after Arrive → commit the stay. Tapping the same day
      // twice is the deliberate one-night stay (arrive == last night).
      onSelect({ start: selection.start, end: iso });
    }
  }

  function clearSelection() {
    onSelect?.(null);
  }

  function jumpMonths(delta: number) {
    setViewMonth((m) => addMonths(m, delta));
  }

  function inSelection(iso: string): boolean {
    if (!selection) return false;
    // While awaiting the last night, only the Arrive cell is highlighted.
    const end = selection.end ?? selection.start;
    return iso >= selection.start && iso <= end;
  }

  return (
    <div className="flex flex-col gap-4 select-none">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => jumpMonths(-1)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-sm text-foreground hover:bg-surface-raised"
          aria-label="Previous month"
        >
          ←
        </button>
        <h3 className="font-display text-xl leading-tight text-foreground">
          {format(viewMonth, "MMMM yyyy")}
        </h3>
        <button
          type="button"
          onClick={() => jumpMonths(1)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-sm text-foreground hover:bg-surface-raised"
          aria-label="Next month"
        >
          →
        </button>
      </header>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-surface-sunken py-2 text-center text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
          >
            {d}
          </div>
        ))}
        {days.map((d) => {
          const iso = toIso(d);
          const cellBands = bandsByDay.get(iso) ?? [];
          const inMonth = isSameMonth(d, viewMonth);
          const selected = inSelection(iso);
          const href = cellHref?.(d);
          const inner = (
            <>
              <div className="flex items-baseline justify-between">
                <span
                  className={
                    inMonth
                      ? "text-sm text-foreground"
                      : "text-sm text-foreground-subtle/60"
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {cellBands.slice(0, 3).map((b) => (
                  <div
                    key={b.bookingId + iso}
                    className={
                      b.status === "approved"
                        ? "truncate rounded-sm px-1 py-0.5 text-[0.65rem] text-accent-operations-foreground"
                        : "truncate rounded-sm border border-dashed border-accent-bronze/60 px-1 py-0.5 text-[0.65rem] text-foreground-muted"
                    }
                    style={
                      b.status === "approved"
                        ? { backgroundColor: b.tone ?? "var(--accent-operations)" }
                        : undefined
                    }
                    title={b.label}
                  >
                    {b.label ?? (b.status === "approved" ? "booked" : "pending")}
                  </div>
                ))}
                {cellBands.length > 3 && (
                  <span className="text-[0.6rem] text-foreground-subtle">
                    +{cellBands.length - 3} more
                  </span>
                )}
              </div>
            </>
          );
          const className =
            "flex min-h-20 flex-col bg-surface px-1.5 py-1.5 text-left transition-colors " +
            (selected
              ? "ring-2 ring-inset ring-accent-operations"
              : onSelect
                ? "hover:bg-surface-raised cursor-pointer"
                : "");
          if (href) {
            return (
              <a key={iso} href={href} className={className}>
                {inner}
              </a>
            );
          }
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onCellClick(iso)}
              className={className}
              disabled={!onSelect}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {onSelect && (
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-foreground-subtle">
            {awaitingLastNight
              ? `Arrive ${format(fromIso(selection!.start), "MMM d")} selected. Now tap your last night.`
              : "Tap your arrival day, then tap your last night."}
          </p>
          {selection && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-foreground-muted underline-offset-4 hover:underline"
            >
              Start Over
            </button>
          )}
        </div>
      )}
    </div>
  );
}
