import {
  renderEmailHtml,
  renderEmailText,
  type EmailDetail,
} from "@/lib/email/layout";
import { parseIsoDate } from "@/lib/bookings";

/** A fully-rendered email ready to hand to `sendEmail()`. */
export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Format a half-open stay [startIso, endIso) for humans, e.g.
 * "Sat, Jun 14 → Sat, Jun 21, 2026 · 7 nights". `endIso` is the EXCLUSIVE
 * checkout day (see src/lib/bookings.ts), so nights = days between the two.
 */
export function formatStayRange(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return `${startIso} → ${endIso}`;

  const dayFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fullFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const nights = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  const nightLabel = `${nights} night${nights === 1 ? "" : "s"}`;
  return `${dayFmt.format(start)} → ${fullFmt.format(end)} · ${nightLabel}`;
}

/** Shared context every booking email is built from. */
export type BookingEmailContext = {
  propertyName: string;
  requesterName: string;
  startDate: string; // ISO
  endDate: string; // ISO (exclusive)
  guestCount: number;
  notes: string | null;
  /** Absolute URL to the property's calendar page. */
  calendarUrl: string;
};

function baseDetails(ctx: BookingEmailContext): EmailDetail[] {
  const details: EmailDetail[] = [
    { label: "Property", value: ctx.propertyName },
    { label: "Dates", value: formatStayRange(ctx.startDate, ctx.endDate) },
    {
      label: "Guests",
      value: `${ctx.guestCount} ${ctx.guestCount === 1 ? "person" : "people"}`,
    },
  ];
  if (ctx.notes) details.push({ label: "Notes", value: ctx.notes });
  return details;
}

/**
 * To property admins: a new request is waiting in the approval queue.
 * Sent only when the request landed `pending` (peak period or pending overlap).
 */
export function bookingRequestedEmail(
  ctx: BookingEmailContext,
): RenderedEmail {
  const heading = `New booking request: ${ctx.propertyName}`;
  const content = {
    preview: `${ctx.requesterName} requested ${ctx.propertyName}`,
    heading,
    paragraphs: [
      `${ctx.requesterName} has requested a stay at ${ctx.propertyName} and it's waiting for your approval.`,
      "Open the calendar to approve or decline the request.",
    ],
    details: baseDetails(ctx),
    cta: { label: "Review Request", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

/**
 * To the requester: their stay is confirmed. Covers both admin approval and
 * the auto-approval path (no conflict, outside peak periods).
 */
export function bookingApprovedEmail(
  ctx: BookingEmailContext,
  opts: { autoApproved: boolean } = { autoApproved: false },
): RenderedEmail {
  const heading = `Your ${ctx.propertyName} booking is confirmed`;
  const lead = opts.autoApproved
    ? `Your stay at ${ctx.propertyName} is confirmed. These dates were open, so it was booked automatically.`
    : `Good news: your stay at ${ctx.propertyName} has been approved.`;
  const content = {
    preview: `Confirmed: ${ctx.propertyName}, ${formatStayRange(
      ctx.startDate,
      ctx.endDate,
    )}`,
    heading,
    paragraphs: [
      lead,
      "It's on the family calendar now. You can add it to your own calendar from the property page.",
    ],
    details: baseDetails(ctx),
    cta: { label: "View on the Calendar", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

/**
 * To property admins + the site admin: a booking auto-approved (open, off-peak
 * dates, no conflict) so no one had to act. Deliberately CALM — distinct from
 * the urgent `bookingRequestedEmail` — because it's an FYI, not a task.
 */
export function bookingAutoApprovedAdminEmail(
  ctx: BookingEmailContext,
): RenderedEmail {
  const stay = formatStayRange(ctx.startDate, ctx.endDate);
  const heading = `Booked: ${ctx.propertyName}`;
  const content = {
    preview: `${ctx.requesterName} booked ${ctx.propertyName} (${stay})`,
    heading,
    paragraphs: [
      `${ctx.requesterName} booked ${ctx.propertyName}. These dates were open and outside any peak period, so it was confirmed automatically.`,
      "No action needed, just so you know. Open the calendar if you'd like to see the details.",
    ],
    details: baseDetails(ctx),
    cta: { label: "View on the Calendar", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

/**
 * To the requester: their request landed `pending` (a peak period, or an
 * overlap with another pending request) and is waiting for an admin to approve.
 * A calm acknowledgement so the booker isn't left wondering, mirroring the
 * reassurance the auto-approve confirmation already gives.
 */
export function bookingPendingRequesterEmail(
  ctx: BookingEmailContext,
): RenderedEmail {
  const heading = `Your ${ctx.propertyName} request is in`;
  const content = {
    preview: `Request received: ${ctx.propertyName}, ${formatStayRange(
      ctx.startDate,
      ctx.endDate,
    )}`,
    heading,
    paragraphs: [
      `Thanks! Your request for ${ctx.propertyName} is in and waiting for an admin to approve it.`,
      "You'll get an email as soon as there's a decision. Nothing to do in the meantime.",
    ],
    details: baseDetails(ctx),
    cta: { label: "View on the Calendar", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

/** To the requester: their request was declined by an admin. */
export function bookingDeclinedEmail(
  ctx: BookingEmailContext,
): RenderedEmail {
  const heading = `Your ${ctx.propertyName} booking request wasn't approved`;
  const content = {
    preview: `Update on your ${ctx.propertyName} request`,
    heading,
    paragraphs: [
      `Your request for ${ctx.propertyName} wasn't approved this time. It may have conflicted with another stay, or fallen in a peak period that's spoken for.`,
      "Open the calendar to see what's available and request different dates.",
    ],
    details: baseDetails(ctx),
    cta: { label: "Find Open Dates", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

/**
 * To the requester: an admin cancelled their (pending or approved) booking.
 * `cancellationNote` carries the admin's required explanation.
 */
export function bookingCancelledEmail(
  ctx: BookingEmailContext,
  cancellationNote: string | null,
): RenderedEmail {
  const heading = `Your ${ctx.propertyName} booking was cancelled`;
  const details = baseDetails(ctx);
  if (cancellationNote) {
    details.push({ label: "Reason", value: cancellationNote });
  }
  const content = {
    preview: `Your ${ctx.propertyName} booking was cancelled`,
    heading,
    paragraphs: [
      `A booking administrator cancelled your stay at ${ctx.propertyName}.`,
      cancellationNote
        ? "The reason they gave is below. Reach out to them directly if you have questions."
        : "Reach out to a booking administrator if this was unexpected.",
    ],
    details,
    cta: { label: "Open the Calendar", url: ctx.calendarUrl },
  };
  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}
