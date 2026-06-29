import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/resend";
import {
  bookingApprovedEmail,
  bookingCancelledEmail,
  bookingDeclinedEmail,
  bookingRequestedEmail,
  type BookingEmailContext,
} from "@/lib/email/booking-emails";
import { getSiteOrigin } from "@/lib/ics";

/**
 * Transactional booking-notification orchestration.
 *
 * Every function here is BEST-EFFORT: it runs after the booking write has
 * already committed, resolves recipients, and emails them. Failures are logged
 * and swallowed — a notification problem must never roll back or surface an
 * error on the booking action itself.
 *
 * Recipient lookups run under the *acting user's* session (the supabase client
 * passed in), which is sufficient because `profiles` and `property_admins` are
 * both "authenticated read all" — so no service-role key is required, matching
 * this project's no-secret-key constraint.
 */

// Minimal client shape — we only ever call `.from(...).select(...)`.
type Client = SupabaseClient;

/** The booking facts a notification needs; gathered by the calling action. */
export type BookingNotificationInput = {
  bookingId: string;
  propertyId: string;
  requestedBy: string;
  startDate: string; // ISO
  endDate: string; // ISO (exclusive)
  guestCount: number;
  notes: string | null;
};

/** A property's display name + slug, for headings and calendar links. */
async function loadProperty(
  supabase: Client,
  propertyId: string,
): Promise<{ name: string; slug: string } | null> {
  const { data } = await supabase
    .from("properties")
    .select("name, slug")
    .eq("id", propertyId)
    .single();
  return data ? { name: data.name, slug: data.slug } : null;
}

/** One profile's display name + email. */
async function loadProfile(
  supabase: Client,
  profileId: string,
): Promise<{ name: string; email: string | null } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", profileId)
    .single();
  if (!data) return null;
  return { name: data.full_name ?? "A family member", email: data.email };
}

/**
 * Email addresses of everyone who can approve bookings for this property:
 * site admins (`profiles.role = 'admin'`) ∪ the property's own admins
 * (`property_admins`). Deduped, non-empty, with `excludeProfileId` removed so a
 * requester who happens to be an admin doesn't email themselves.
 */
async function loadPropertyAdminEmails(
  supabase: Client,
  propertyId: string,
  excludeProfileId: string,
): Promise<string[]> {
  const [siteAdmins, propAdmins] = await Promise.all([
    supabase.from("profiles").select("id, email").eq("role", "admin"),
    supabase
      .from("property_admins")
      .select("profile_id, profiles(email)")
      .eq("property_id", propertyId),
  ]);

  const byEmail = new Map<string, string>(); // lower-cased email → original

  for (const row of siteAdmins.data ?? []) {
    if (row.id === excludeProfileId) continue;
    const email = (row.email as string | null)?.trim();
    if (email) byEmail.set(email.toLowerCase(), email);
  }

  for (const row of propAdmins.data ?? []) {
    if (row.profile_id === excludeProfileId) continue;
    // The embedded relation may come back as an object or a single-element
    // array depending on PostgREST's inference; handle both.
    const joined = row.profiles as
      | { email: string | null }
      | { email: string | null }[]
      | null;
    const email = (
      Array.isArray(joined) ? joined[0]?.email : joined?.email
    )?.trim();
    if (email) byEmail.set(email.toLowerCase(), email);
  }

  return [...byEmail.values()];
}

/** Build the per-property calendar URL used as the email CTA. */
async function calendarUrl(slug: string): Promise<string> {
  const origin = await getSiteOrigin();
  return `${origin}/properties/${encodeURIComponent(slug)}/calendar`;
}

/** Assemble the shared email context from loaded property + requester data. */
function buildContext(
  property: { name: string; slug: string },
  requesterName: string,
  url: string,
  input: BookingNotificationInput,
): BookingEmailContext {
  return {
    propertyName: property.name,
    requesterName,
    startDate: input.startDate,
    endDate: input.endDate,
    guestCount: input.guestCount,
    notes: input.notes,
    calendarUrl: url,
  };
}

/**
 * New request landed `pending` → alert the property's admins so they can act.
 * (Auto-approved requests skip this and get a confirmation instead — see
 * `notifyBookingApproved`.)
 */
export async function notifyBookingRequested(
  supabase: Client,
  input: BookingNotificationInput,
): Promise<void> {
  try {
    const [property, requester] = await Promise.all([
      loadProperty(supabase, input.propertyId),
      loadProfile(supabase, input.requestedBy),
    ]);
    if (!property) return;
    const admins = await loadPropertyAdminEmails(
      supabase,
      input.propertyId,
      input.requestedBy,
    );
    if (admins.length === 0) return;

    const ctx = buildContext(
      property,
      requester?.name ?? "A family member",
      await calendarUrl(property.slug),
      input,
    );
    const email = bookingRequestedEmail(ctx);
    await sendEmail({
      to: admins,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: requester?.email ?? undefined,
    });
  } catch (err) {
    console.error("[notify] booking-requested failed:", err);
  }
}

/** Request confirmed (admin-approved or auto-approved) → tell the requester. */
export async function notifyBookingApproved(
  supabase: Client,
  input: BookingNotificationInput,
  opts: { autoApproved: boolean },
): Promise<void> {
  try {
    const [property, requester] = await Promise.all([
      loadProperty(supabase, input.propertyId),
      loadProfile(supabase, input.requestedBy),
    ]);
    if (!property || !requester?.email) return;

    const ctx = buildContext(
      property,
      requester.name,
      await calendarUrl(property.slug),
      input,
    );
    const email = bookingApprovedEmail(ctx, opts);
    await sendEmail({
      to: [requester.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    console.error("[notify] booking-approved failed:", err);
  }
}

/** Request declined by an admin → tell the requester. */
export async function notifyBookingDeclined(
  supabase: Client,
  input: BookingNotificationInput,
): Promise<void> {
  try {
    const [property, requester] = await Promise.all([
      loadProperty(supabase, input.propertyId),
      loadProfile(supabase, input.requestedBy),
    ]);
    if (!property || !requester?.email) return;

    const ctx = buildContext(
      property,
      requester.name,
      await calendarUrl(property.slug),
      input,
    );
    const email = bookingDeclinedEmail(ctx);
    await sendEmail({
      to: [requester.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    console.error("[notify] booking-declined failed:", err);
  }
}

/**
 * An admin cancelled someone else's booking → tell the requester, with the
 * admin's reason. (Members cancelling their own booking get no email — they
 * took the action themselves.)
 */
export async function notifyBookingCancelled(
  supabase: Client,
  input: BookingNotificationInput,
  cancellationNote: string | null,
): Promise<void> {
  try {
    const [property, requester] = await Promise.all([
      loadProperty(supabase, input.propertyId),
      loadProfile(supabase, input.requestedBy),
    ]);
    if (!property || !requester?.email) return;

    const ctx = buildContext(
      property,
      requester.name,
      await calendarUrl(property.slug),
      input,
    );
    const email = bookingCancelledEmail(ctx, cancellationNote);
    await sendEmail({
      to: [requester.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    console.error("[notify] booking-cancelled failed:", err);
  }
}
