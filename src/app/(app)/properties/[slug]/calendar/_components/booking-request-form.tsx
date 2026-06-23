"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow } from "@/components/shell";

import {
  createBookingRequest,
  type BookingActionState,
} from "../actions";
import { MonthCalendar, type CalendarBand } from "./month-calendar";

const initial: BookingActionState = { status: "idle" };

type PeakRange = { start: string; end: string };

type Props = {
  propertyId: string;
  bands: CalendarBand[];
  maxGuests: number | null;
  peakRanges: PeakRange[];
  /** Stored bookings with exclusive endIso (DB end_date, the checkout day). */
  pendingBands: { startIso: string; endIso: string }[];
};

// The form's internal `range` state holds the user's nights INCLUSIVE
// (start = first stay night, end = last stay night). That matches how the
// calendar drag feels: you paint every cell you'll be there. At submit
// time we convert end to the EXCLUSIVE checkout day to match the storage
// model (end_date = checkout).

function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
}

function dayInPeakRange(date: Date, range: PeakRange): boolean {
  const s = parseMonthDay(range.start);
  const e = parseMonthDay(range.end);
  if (!s || !e) return false;
  const v = (date.getMonth() + 1) * 100 + date.getDate();
  const a = s.month * 100 + s.day;
  const b = e.month * 100 + e.day;
  if (a <= b) return v >= a && v <= b;
  return v >= a || v <= b;
}

function eachInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
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

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = fromIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return toIso(d);
}

function nightCount(startIso: string, lastNightIso: string): number {
  const s = fromIso(startIso);
  const e = fromIso(lastNightIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

function formatHumanDate(iso: string): string {
  const d = fromIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function BookingRequestForm({
  propertyId,
  bands,
  maxGuests,
  peakRanges,
  pendingBands,
}: Props) {
  const action = createBookingRequest.bind(null, propertyId);
  const [state, formAction, isPending] = useActionState(action, initial);
  // `range` is INCLUSIVE — end is the last stay night, not checkout.
  const [range, setRange] = useState<{ start: string; end: string } | null>(
    null,
  );

  // Exclusive checkout = last stay night + 1 day. This is what we submit.
  const exclusiveEnd = range ? addDaysIso(range.end, 1) : "";
  const nights = range ? nightCount(range.start, range.end) : 0;

  const needsApproval = useMemo(() => {
    if (!range || peakRanges.length === 0) return false;
    const start = fromIso(range.start);
    const end = fromIso(range.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    for (const d of eachInclusive(start, end)) {
      for (const r of peakRanges) {
        if (dayInPeakRange(d, r)) return true;
      }
    }
    return false;
  }, [range, peakRanges]);

  const pendingConflicts = useMemo(() => {
    if (!range) return 0;
    // pendingBands carry EXCLUSIVE endIso. Convert ours to exclusive too,
    // then standard half-open overlap test: a < d AND b > c. String compare
    // works on YYYY-MM-DD.
    const myExclusiveEnd = addDaysIso(range.end, 1);
    let n = 0;
    for (const p of pendingBands) {
      if (range.start < p.endIso && myExclusiveEnd > p.startIso) n++;
    }
    return n;
  }, [range, pendingBands]);

  return (
    <div className="flex flex-col gap-6">
      <MonthCalendar
        bands={bands}
        selection={range}
        onSelect={(r) => setRange(r)}
      />

      <form action={formAction} className="flex flex-col gap-4">
        <Eyebrow>Request these dates</Eyebrow>
        <input type="hidden" name="start_date" value={range?.start ?? ""} />
        <input type="hidden" name="end_date" value={exclusiveEnd} />

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label
              htmlFor="bk-start"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Arrive
            </Label>
            <Input
              id="bk-start"
              type="date"
              value={range?.start ?? ""}
              onChange={(e) =>
                setRange((r) => ({
                  start: e.target.value,
                  end: r?.end ?? e.target.value,
                }))
              }
              required
            />
          </Field>
          <Field>
            <Label
              htmlFor="bk-end"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Last night
            </Label>
            <Input
              id="bk-end"
              type="date"
              value={range?.end ?? ""}
              onChange={(e) =>
                setRange((r) => ({
                  start: r?.start ?? e.target.value,
                  end: e.target.value,
                }))
              }
              required
            />
          </Field>
        </div>

        {range && nights > 0 && (
          <p className="text-xs text-foreground-subtle">
            {nights} night{nights === 1 ? "" : "s"} · arrive{" "}
            {formatHumanDate(range.start)}, depart{" "}
            {formatHumanDate(exclusiveEnd)}
          </p>
        )}

        <Field>
          <Label
            htmlFor="bk-guests"
            className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
          >
            Guest count
          </Label>
          <Input
            id="bk-guests"
            name="guest_count"
            type="number"
            min={1}
            max={maxGuests ?? undefined}
            defaultValue={1}
            required
          />
          {maxGuests != null && (
            <p className="text-xs text-foreground-subtle">
              This property sleeps up to {maxGuests}.
            </p>
          )}
        </Field>

        <Field>
          <Label
            htmlFor="bk-notes"
            className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
          >
            Notes
          </Label>
          <Textarea
            id="bk-notes"
            name="notes"
            rows={3}
            placeholder="Who's coming, any context the family should know"
          />
        </Field>

        {needsApproval && (
          <p className="text-sm text-foreground-muted">
            These dates fall in a peak window — request will sit pending until
            a property admin approves.
          </p>
        )}
        {pendingConflicts > 0 && (
          <p className="text-sm text-foreground-muted">
            Heads up: {pendingConflicts} other pending request
            {pendingConflicts === 1 ? "" : "s"} overlap{pendingConflicts === 1
              ? "s"
              : ""}{" "}
            these dates.
          </p>
        )}

        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "saved" && (
          <p className="text-sm text-accent-operations">
            {state.bookingStatus === "approved"
              ? "Approved — these dates are yours."
              : "Submitted — a property admin will review."}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || !range}>
            {isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}
