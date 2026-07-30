"use client";

import { useEffect, useRef } from "react";

/**
 * Hidden inputs that carry a property's untouched fields through a partial edit.
 *
 * `updateProperty` is a whole-form action: it reads every editable column out of
 * the submitted FormData and writes all of them. That's right for the full edit
 * page, where every field is on screen, but intake submits *slivers* — an
 * address from a bill, guidelines from a handwritten note — and a field that
 * isn't in the payload would be written as null. Saving an address would quietly
 * blank the description.
 *
 * Rather than let each intake form hand-roll that list (slice 1 did, and slice 2
 * would have made it three copies that drift apart), the carry set lives here
 * once. **If `updateProperty` gains an editable field, add it here too** — this
 * component is the single place that has to keep up with it.
 *
 * The privileged columns are handled the way the action does:
 * - `peak_period_ranges` is genuinely optional; the action preserves it when the
 *   key is absent, so it is deliberately never sent.
 * - `status` and `max_guests` are preserved only for members who *can't* change
 *   them, so they're sent only when `canManage` is true. Sending them for a
 *   member who can't manage the property would be ignored anyway; not sending
 *   them for one who can would reset them.
 *
 * Nothing here can introduce a value the member didn't already have: every input
 * echoes the property's current stored value.
 */

/**
 * Fire `onSaved` exactly once, the first time a form reports a successful save.
 *
 * The carry fields above solve half the whole-form problem: a partial submit
 * sends the fields it isn't editing. This solves the other half. A review
 * session can hold more than one form pointed at `updateProperty` — a note that
 * fills both guidelines and how-to renders two — and each carries the values it
 * had when the page rendered. Without a refresh between saves, the second save
 * carries page-load values and reverts the first, with a "Saved" confirmation on
 * screen for both.
 *
 * Fires once via a ref rather than depending on the callback's identity, so a
 * caller passing an inline function can't turn this into a refetch loop.
 */
function useNotifyOnSave(saved: boolean, onSaved: () => void) {
  const notified = useRef(false);
  useEffect(() => {
    if (!saved || notified.current) return;
    notified.current = true;
    onSaved();
  }, [saved, onSaved]);
}

export { useNotifyOnSave };

export type IntakeProperty = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  address: string | null;
  description: string | null;
  how_to: string | null;
  guidelines: string | null;
  amenities: string[];
  status: string;
  max_guests: number | null;
};

/** Fields this component knows how to carry. Omit the one being edited. */
export type CarryableField =
  | "name"
  | "location"
  | "address"
  | "description"
  | "how_to"
  | "guidelines"
  | "amenities";

export function PropertyCarryFields({
  property,
  canManage,
  omit,
}: {
  property: IntakeProperty;
  canManage: boolean;
  /** The field(s) the visible form is editing, which must not be duplicated. */
  omit: CarryableField[];
}) {
  const skip = new Set(omit);
  const carry: [CarryableField, string][] = [
    ["name", property.name],
    ["location", property.location ?? ""],
    ["address", property.address ?? ""],
    ["description", property.description ?? ""],
    ["how_to", property.how_to ?? ""],
    ["guidelines", property.guidelines ?? ""],
    ["amenities", property.amenities.join("\n")],
  ];

  return (
    <>
      {carry
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      {canManage ? (
        <>
          <input type="hidden" name="status" value={property.status} />
          <input
            type="hidden"
            name="max_guests"
            value={property.max_guests ?? ""}
          />
        </>
      ) : null}
    </>
  );
}
