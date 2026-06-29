"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";
import { recordRevision } from "@/lib/revisions";
import {
  determineInitialStatus,
  findOverlappingBookings,
  parseIsoDate,
  type PeakPeriodRange,
} from "@/lib/bookings";
import {
  notifyBookingApproved,
  notifyBookingCancelled,
  notifyBookingDeclined,
  notifyBookingRequested,
} from "@/lib/notifications/bookings";

export type BookingActionState =
  | { status: "idle" }
  | { status: "saved"; bookingStatus?: "pending" | "approved" }
  | { status: "error"; message: string };

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function readInt(formData: FormData, key: string): number | null {
  const v = readText(formData, key);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function createBookingRequest(
  propertyId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const startIso = readText(formData, "start_date");
  const endIso = readText(formData, "end_date");
  if (!startIso || !endIso) {
    return { status: "error", message: "Both start and end dates are required." };
  }
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) {
    return { status: "error", message: "Invalid date format." };
  }
  if (end.getTime() <= start.getTime()) {
    return {
      status: "error",
      message: "Depart date must be after the arrive date (at least one night).",
    };
  }

  const guestCount = readInt(formData, "guest_count") ?? 1;
  if (guestCount < 1) {
    return { status: "error", message: "Guest count must be at least 1." };
  }
  const notes = readText(formData, "notes");

  // Fetch property to read max_guests and peak_period_ranges.
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("slug, max_guests, peak_period_ranges")
    .eq("id", propertyId)
    .single();
  if (propErr || !property) {
    return { status: "error", message: "Property not found." };
  }

  if (
    typeof property.max_guests === "number" &&
    guestCount > property.max_guests
  ) {
    return {
      status: "error",
      message: `This property sleeps at most ${property.max_guests}.`,
    };
  }

  // Approved overlaps block; pending overlaps cause the new request to land
  // as pending (regardless of peak status).
  const approved = await findOverlappingBookings({
    propertyId,
    startDate: startIso,
    endDate: endIso,
    statuses: ["approved"],
  });
  if (approved.length > 0) {
    return {
      status: "error",
      message:
        "These dates conflict with an approved booking. Pick a different range.",
    };
  }
  const pending = await findOverlappingBookings({
    propertyId,
    startDate: startIso,
    endDate: endIso,
    statuses: ["pending"],
  });

  const initialStatus = determineInitialStatus({
    peakRanges: (property.peak_period_ranges ?? []) as PeakPeriodRange[],
    startDate: start,
    endDate: end,
    pendingOverlapCount: pending.length,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      property_id: propertyId,
      requested_by: user.id,
      start_date: startIso,
      end_date: endIso,
      guest_count: guestCount,
      notes,
      status: initialStatus,
      // Auto-approved requests record themselves as the approver, so the
      // audit trail is consistent ("who said yes to this").
      approved_by: initialStatus === "approved" ? user.id : null,
      approved_at: initialStatus === "approved" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      status: "error",
      message: insertErr?.message ?? "Could not save the booking.",
    };
  }

  await recordRevision({
    entityType: "booking",
    entityId: inserted.id,
    changedBy: user.id,
    before: {},
    after: {
      start_date: startIso,
      end_date: endIso,
      guest_count: guestCount,
      notes,
      status: initialStatus,
    },
  });

  // Best-effort notifications (never block the booking): a pending request
  // alerts the property's admins; an auto-approved one confirms the requester.
  const notifyInput = {
    bookingId: inserted.id,
    propertyId,
    requestedBy: user.id,
    startDate: startIso,
    endDate: endIso,
    guestCount,
    notes,
  };
  if (initialStatus === "approved") {
    await notifyBookingApproved(supabase, notifyInput, { autoApproved: true });
  } else {
    await notifyBookingRequested(supabase, notifyInput);
  }

  revalidatePath(`/properties/${property.slug}/calendar`);
  revalidatePath("/calendar");
  revalidatePath("/admin");
  return { status: "saved", bookingStatus: initialStatus };
}

export async function cancelBooking(
  bookingId: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      "id, property_id, requested_by, start_date, end_date, status, guest_count, notes",
    )
    .eq("id", bookingId)
    .single();
  if (fetchErr || !booking) {
    return { status: "error", message: "Booking not found." };
  }

  const isOwner = booking.requested_by === user.id;
  const { ok: canAdmin } = await canManageProperty(booking.property_id);
  if (!isOwner && !canAdmin) {
    return { status: "error", message: "Not authorized." };
  }

  if (booking.status === "cancelled") {
    return { status: "error", message: "Already cancelled." };
  }
  if (booking.status === "declined") {
    return {
      status: "error",
      message: "A declined booking can't be cancelled.",
    };
  }

  const cancellationNotes = readText(formData, "cancellation_notes");
  // If an admin is cancelling someone else's booking, require a reason so
  // the requester sees context.
  if (!isOwner && canAdmin && !cancellationNotes) {
    return {
      status: "error",
      message:
        "Please add a short note explaining why so the requester has context.",
    };
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancellation_notes: cancellationNotes,
    })
    .eq("id", bookingId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "booking",
    entityId: bookingId,
    changedBy: user.id,
    before: { status: booking.status, cancellation_notes: null },
    after: { status: "cancelled", cancellation_notes: cancellationNotes },
  });

  // Only notify when an admin cancelled someone else's booking — a member
  // cancelling their own already knows. Best-effort.
  if (!isOwner && canAdmin) {
    await notifyBookingCancelled(
      supabase,
      {
        bookingId: booking.id,
        propertyId: booking.property_id,
        requestedBy: booking.requested_by,
        startDate: booking.start_date,
        endDate: booking.end_date,
        guestCount: booking.guest_count,
        notes: booking.notes,
      },
      cancellationNotes,
    );
  }

  const { data: property } = await supabase
    .from("properties")
    .select("slug")
    .eq("id", booking.property_id)
    .single();
  if (property?.slug) {
    revalidatePath(`/properties/${property.slug}/calendar`);
  }
  revalidatePath("/calendar");
  revalidatePath("/admin");
  return { status: "saved" };
}

async function setBookingDecision(
  bookingId: string,
  decision: "approved" | "declined",
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      "id, property_id, requested_by, start_date, end_date, status, guest_count, notes",
    )
    .eq("id", bookingId)
    .single();
  if (fetchErr || !booking) {
    return { status: "error", message: "Booking not found." };
  }
  if (booking.status !== "pending") {
    return {
      status: "error",
      message: `Already ${booking.status}.`,
    };
  }

  const { ok: canAdmin } = await canManageProperty(booking.property_id);
  if (!canAdmin) {
    return { status: "error", message: "Not authorized." };
  }

  // Race-safety: re-check approved overlaps before approving, in case a
  // sibling admin approved a conflicting booking since the queue loaded.
  if (decision === "approved") {
    const conflict = await findOverlappingBookings({
      propertyId: booking.property_id,
      startDate: booking.start_date,
      endDate: booking.end_date,
      statuses: ["approved"],
      excludeBookingId: booking.id,
    });
    if (conflict.length > 0) {
      return {
        status: "error",
        message:
          "Another approved booking now conflicts with these dates — refresh the queue.",
      };
    }
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: decision,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "booking",
    entityId: bookingId,
    changedBy: user.id,
    before: { status: "pending" },
    after: { status: decision },
  });

  // Best-effort: let the requester know the outcome.
  const decisionInput = {
    bookingId: booking.id,
    propertyId: booking.property_id,
    requestedBy: booking.requested_by,
    startDate: booking.start_date,
    endDate: booking.end_date,
    guestCount: booking.guest_count,
    notes: booking.notes,
  };
  if (decision === "approved") {
    await notifyBookingApproved(supabase, decisionInput, {
      autoApproved: false,
    });
  } else {
    await notifyBookingDeclined(supabase, decisionInput);
  }

  const { data: property } = await supabase
    .from("properties")
    .select("slug")
    .eq("id", booking.property_id)
    .single();
  if (property?.slug) {
    revalidatePath(`/properties/${property.slug}/calendar`);
  }
  revalidatePath("/calendar");
  revalidatePath("/admin");
  return { status: "saved" };
}

export async function approveBooking(
  bookingId: string,
  prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  void prev;
  void formData;
  return setBookingDecision(bookingId, "approved");
}

export async function declineBooking(
  bookingId: string,
  prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  void prev;
  void formData;
  return setBookingDecision(bookingId, "declined");
}
