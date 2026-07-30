"use client";

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
 * The carry fields above solve half the whole-form problem: a partial submit
 * sends the fields it isn't editing. `useNotifyOnSave` solves the other half —
 * telling the parent to re-read the property so the *next* form carries what's
 * actually stored. It moved to `@/lib/use-notify-on-save` when slice 3's
 * reminder forms needed the same one-shot signal; re-exported here so intake's
 * review forms keep importing the pair from one place.
 */
export { useNotifyOnSave } from "@/lib/use-notify-on-save";

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
