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
  startIso: string; // YYYY-MM-DD
  endIso: string; // YYYY-MM-DD
  status: "approved" | "pending";
  tone?: string; // optional CSS color, used by unified /calendar
  label?: string;
};

type Props = {
  initialMonth?: Date;
  bands: CalendarBand[];
  /**
   * When provided, the calendar supports click-and-drag range selection
   * and reports the selection back via this callback.
   */
  onSelect?: (range: { start: string; end: string } | null) => void;
  selection?: { start: string; end: string } | null;
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
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  const gridStart = startOfWeek(viewMonth, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
  const days = useMemo(
    () => eachDayInclusive(gridStart, gridEnd),
    [gridStart, gridEnd],
  );

  // Map each date to the bands that cover it.
  const bandsByDay = useMemo(() => {
    const map = new Map<string, CalendarBand[]>();
    for (const b of bands) {
      const s = fromIso(b.startIso);
      const e = fromIso(b.endIso);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      for (const d of eachDayInclusive(s, e)) {
        const key = toIso(d);
        const arr = map.get(key) ?? [];
        arr.push(b);
        map.set(key, arr);
      }
    }
    return map;
  }, [bands]);

  const activeSelection = useMemo(() => {
    if (dragStart && dragEnd) {
      const [a, b] = [dragStart, dragEnd].sort();
      return { start: a, end: b };
    }
    return selection ?? null;
  }, [dragStart, dragEnd, selection]);

  function onCellMouseDown(iso: string) {
    if (!onSelect) return;
    setDragStart(iso);
    setDragEnd(iso);
  }
  function onCellMouseEnter(iso: string) {
    if (!onSelect || !dragStart) return;
    setDragEnd(iso);
  }
  function onCellMouseUp() {
    if (!onSelect || !dragStart || !dragEnd) return;
    const [a, b] = [dragStart, dragEnd].sort();
    onSelect({ start: a, end: b });
    setDragStart(null);
    setDragEnd(null);
  }

  function jumpMonths(delta: number) {
    setViewMonth((m) => addMonths(m, delta));
  }

  function inSelection(iso: string): boolean {
    if (!activeSelection) return false;
    return iso >= activeSelection.start && iso <= activeSelection.end;
  }

  return (
    <div
      className="flex flex-col gap-4 select-none"
      onMouseLeave={() => {
        if (dragStart) {
          // Cancel an in-flight drag if the cursor exits the grid.
          setDragStart(null);
          setDragEnd(null);
        }
      }}
    >
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
              onMouseDown={() => onCellMouseDown(iso)}
              onMouseEnter={() => onCellMouseEnter(iso)}
              onMouseUp={onCellMouseUp}
              className={className}
              disabled={!onSelect}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
