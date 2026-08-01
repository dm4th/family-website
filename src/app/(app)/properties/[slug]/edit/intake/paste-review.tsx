"use client";

/**
 * The review surface for a pasted document (PRD 37).
 *
 * A pasted house manual differs from a note or a dictation in two ways that
 * change the screen rather than just its wording:
 *
 *   1. It proposes *many* contacts — the family's real document names about
 *      twenty — so they are a checklist with one Save, not twenty separate
 *      forms. That is still twenty individually gated saves through the
 *      unchanged `addPropertyContact`; what changes is how many times a member
 *      has to press a button, not what the writes are.
 *   2. It tends to contain account logins. Those are named in an advisory and
 *      excluded from every save path (enforced in `parsePasteExtraction`, not
 *      here) — with the Wi-Fi password as the single deliberate exception,
 *      because that one is meant to be shared and has a field of its own.
 *
 * Everything else is the established idiom: nothing auto-routes, nothing saves
 * until a Save button is pressed, and each destination is its own gated action
 * with its own revision.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";
import { ReviewField, ReviewSection } from "@/components/intake/review-shell";
import { NarrativeForm } from "@/components/intake/narrative-form";
import {
  PropertyCarryFields,
  useNotifyOnSave,
  type IntakeProperty,
} from "@/components/intake/property-carry-fields";
import type {
  FlaggedCredential,
  PasteExtraction,
  SuggestedContactWithKind,
  SuggestedWifi,
} from "@/lib/intake/schema";
import type { PropertyContactKind } from "@/lib/db/schema";
import { addPropertyContact } from "../../contacts/actions";
import { updateProperty, type PropertyFormState } from "../../actions";

const propertyInitial: PropertyFormState = { status: "idle" };

/** Same wording as the property edit page's contact form, for one vocabulary. */
const KIND_OPTIONS: { value: PropertyContactKind; label: string }[] = [
  { value: "emergency", label: "Emergencies" },
  { value: "on_the_ground", label: "On the ground" },
  { value: "service", label: "Service directory" },
];

export function PasteReview({
  property,
  extraction,
  canManage,
  onStartOver,
  onPropertySaved,
  onItemSaved,
  propertyBusy,
}: {
  property: IntakeProperty;
  extraction: PasteExtraction;
  canManage: boolean;
  onStartOver: () => void;
  onPropertySaved: () => void;
  onItemSaved?: (count?: number) => void;
  propertyBusy: boolean;
}) {
  const {
    transcription,
    suggestedGuidelines,
    suggestedHowTo,
    suggestedContacts,
    wifi,
    flaggedCredentials,
  } = extraction;

  const nothingFound =
    !suggestedGuidelines.value &&
    !suggestedHowTo.value &&
    suggestedContacts.length === 0 &&
    !wifi &&
    extraction.suggestedReminders.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* First, before any Save button: what we refused to carry. */}
      {flaggedCredentials.length > 0 && (
        <CredentialAdvisory credentials={flaggedCredentials} />
      )}

      {nothingFound ? (
        <ReviewSection label="Nothing to sort out">
          <p className="text-base text-foreground">
            We couldn&rsquo;t find anything in there that belongs in one of the
            property&rsquo;s fields. The text is still saved as a document you
            can open or remove below.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={onStartOver}>
              Paste Something Else
            </Button>
          </div>
        </ReviewSection>
      ) : (
        <p className="text-base text-foreground-muted">
          Here&rsquo;s where the document could go. Each part saves on its own,
          so you can take what you want and leave the rest.
        </p>
      )}

      {wifi && (
        <WifiForm
          property={property}
          canManage={canManage}
          wifi={wifi}
          onSaved={() => {
            onPropertySaved();
            onItemSaved?.();
          }}
          busy={propertyBusy}
        />
      )}

      {suggestedContacts.length > 0 && (
        <ContactChecklist
          property={property}
          contacts={suggestedContacts}
          onSaved={(count) => onItemSaved?.(count)}
        />
      )}

      <NarrativeForm
        property={property}
        canManage={canManage}
        field="how_to"
        sectionLabel="How things work"
        fieldLabel="How to"
        proposed={suggestedHowTo}
        blurb="Practical instructions: water, heat, the dock, rubbish, opening up and closing down."
        rows={16}
        onSaved={() => {
          onPropertySaved();
          onItemSaved?.();
        }}
        busy={propertyBusy}
      />

      <NarrativeForm
        property={property}
        canManage={canManage}
        field="guidelines"
        sectionLabel="House guidelines"
        fieldLabel="Guidelines"
        proposed={suggestedGuidelines}
        blurb="Rules and expectations for people staying."
        rows={12}
        onSaved={() => {
          onPropertySaved();
          onItemSaved?.();
        }}
        busy={propertyBusy}
      />

      {transcription.value ? (
        <TidiedDocument text={transcription.value} />
      ) : null}

      <div>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          Paste Something Else
        </Button>
      </div>
    </div>
  );
}

/**
 * What the document had that we will not publish.
 *
 * Placed above every Save button, deliberately. A member about to press Save on
 * a page that property guests can read should be told before they press it, not
 * in a footnote afterwards — and the point of this block is that the answer is
 * already "we left it out", so it reads as information rather than a warning to
 * act on.
 *
 * There is nothing to click. The credentials aren't here to be recovered: they
 * never left the parser, and the only place they still exist is the verbatim
 * document in the private bucket.
 */
function CredentialAdvisory({
  credentials,
}: {
  credentials: FlaggedCredential[];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-accent-bronze/50 bg-accent-bronze/5 p-5">
      <h3 className="font-display text-lg leading-tight text-foreground">
        Logins we left out
      </h3>
      <p className="text-base text-foreground-muted">
        This document has account logins in it. We don&rsquo;t put those on the
        property page, because everyone signed in can read it, including guests.
        They&rsquo;re not in anything below, and saving won&rsquo;t publish them.
        Keep them in a password manager for now.
      </p>
      <ul className="flex flex-col gap-1">
        {credentials.map((c, i) => (
          <li key={i} className="text-base text-foreground">
            <span className="font-medium">{c.service}</span>
            <span className="text-foreground-subtle"> · {c.hint}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-foreground-subtle">
        The document itself is stored privately and still has them in it. You can
        open or delete it from &ldquo;Documents We&rsquo;ve Read&rdquo; on the
        previous page.
      </p>
    </section>
  );
}

/**
 * The Wi-Fi card: one glance, one save, and the property page's Wi-Fi panel and
 * QR code (PRD 36) light up.
 *
 * Editable rather than a confirm button, because a passphrase is exactly the
 * kind of value a document records slightly wrong — an old key, a capital
 * letter that drifted — and it is cheaper to fix here than to discover from a
 * phone that won't join.
 */
function WifiForm({
  property,
  canManage,
  wifi,
  onSaved,
  busy,
}: {
  property: IntakeProperty;
  canManage: boolean;
  wifi: SuggestedWifi;
  onSaved: () => void;
  busy: boolean;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, propertyInitial);
  const [dismissed, setDismissed] = useState(false);
  useNotifyOnSave(state.status === "saved", onSaved);

  if (dismissed) return null;

  if (state.status === "saved") {
    return (
      <ReviewSection label="Wi-Fi">
        <p className="text-base text-foreground">
          Saved. {property.name}&rsquo;s page now shows the network, the
          password, and a code a phone camera can join from.
        </p>
      </ReviewSection>
    );
  }

  const replacing = Boolean(property.wifi_network);

  return (
    <ReviewSection label="Wi-Fi">
      <p className="text-base text-foreground-muted">
        The document gives a wireless network. This one is meant to be shared, so
        it goes on the property page where anyone staying can find it.
      </p>
      {replacing ? (
        <p className="text-sm text-foreground-subtle">
          There&rsquo;s already a network saved ({property.wifi_network}). Saving
          this replaces it.
        </p>
      ) : null}
      <form action={formAction} className="flex flex-col gap-4">
        <PropertyCarryFields
          property={property}
          canManage={canManage}
          omit={["wifi_network", "wifi_password"]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReviewField
            label="Network"
            htmlFor="intake-wifi-network"
            confidence={wifi.confidence}
          >
            <Input
              id="intake-wifi-network"
              name="wifi_network"
              disabled={isPending}
              defaultValue={wifi.network}
              autoComplete="off"
            />
          </ReviewField>
          <ReviewField
            label="Password"
            htmlFor="intake-wifi-password"
            confidence={wifi.confidence}
            hint="Worth checking character by character before saving."
          >
            <Input
              id="intake-wifi-password"
              name="wifi_password"
              disabled={isPending}
              defaultValue={wifi.password ?? ""}
              autoComplete="off"
              spellCheck={false}
            />
          </ReviewField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
            Not This One
          </Button>
          <div className="flex items-center gap-3">
            <FormStatus tone="error">
              {state.status === "error" ? state.message : null}
            </FormStatus>
            <Button type="submit" disabled={isPending || busy}>
              {isPending ? "Saving…" : "Save Wi-Fi"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}

type RowState = {
  contact: SuggestedContactWithKind;
  checked: boolean;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

/**
 * Every contact the document names, as a checklist with one Save.
 *
 * This is the piece that decides whether the feature is worth using: the family
 * document lists about twenty trades and neighbours, and twenty one-at-a-time
 * review forms is the transcription chore PRD 37 exists to kill. So the *saving*
 * is batched while the *writes* are not — pressing Save calls the unchanged
 * `addPropertyContact` once per checked row, each with its own authorization,
 * its own revision, and its own success or failure reported on its own line.
 *
 * Sequential rather than concurrent on purpose: the action orders new contacts
 * by reading the current maximum `sort_order`, so twenty parallel inserts would
 * race to the same position and land the document's careful ordering as noise.
 */
function ContactChecklist({
  property,
  contacts,
  onSaved,
}: {
  property: IntakeProperty;
  contacts: SuggestedContactWithKind[];
  onSaved: (count: number) => void;
}) {
  const [rows, setRows] = useState<RowState[]>(() =>
    contacts.map((contact) => ({
      contact,
      checked: true,
      status: "idle" as const,
      message: null,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const pending = rows.filter((r) => r.checked && r.status !== "saved");
  const savedCount = rows.filter((r) => r.status === "saved").length;
  const failedCount = rows.filter((r) => r.status === "error").length;

  function update(index: number, patch: Partial<RowState>) {
    setRows((current) =>
      current.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function updateContact(
    index: number,
    patch: Partial<SuggestedContactWithKind>,
  ) {
    setRows((current) =>
      current.map((r, i) =>
        i === index ? { ...r, contact: { ...r.contact, ...patch } } : r,
      ),
    );
  }

  async function saveSelected() {
    setSaving(true);
    setSummary(null);
    let saved = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.checked || row.status === "saved") continue;

      const label = (row.contact.label ?? row.contact.name ?? "").trim();
      if (!label) {
        update(i, {
          status: "error",
          message: "Give this one a label before saving it.",
        });
        failed += 1;
        continue;
      }

      update(i, { status: "saving", message: null });

      const formData = new FormData();
      formData.set("label", label);
      formData.set("kind", row.contact.kind);
      formData.set("name", row.contact.name ?? "");
      formData.set("phone", row.contact.phone ?? "");
      formData.set("email", row.contact.email ?? "");
      formData.set("notes", row.contact.notes ?? "");

      try {
        const result = await addPropertyContact(
          property.id,
          property.slug,
          { status: "idle" },
          formData,
        );
        if (result.status === "saved") {
          update(i, { status: "saved", message: null });
          saved += 1;
        } else {
          update(i, {
            status: "error",
            message:
              result.status === "error" ? result.message : "Couldn't save this one.",
          });
          failed += 1;
        }
      } catch {
        update(i, {
          status: "error",
          message: "Couldn't save this one. Try it again.",
        });
        failed += 1;
      }
    }

    setSaving(false);
    onSaved(saved);
    setSummary(
      failed === 0
        ? `Saved ${saved} ${saved === 1 ? "contact" : "contacts"} to ${property.name}.`
        : `Saved ${saved} of ${saved + failed}. The ones marked below need another look.`,
    );
  }

  return (
    <ReviewSection label="Contacts in the document">
      <p className="text-base text-foreground-muted">
        We found {contacts.length}{" "}
        {contacts.length === 1 ? "person or company" : "people and companies"}{" "}
        with a way to reach them. Untick anything you don&rsquo;t want, change
        where each one belongs, then save them together.
      </p>

      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {rows.map((row, index) => (
          <ContactRow
            key={index}
            row={row}
            index={index}
            disabled={saving}
            onToggle={(checked) => update(index, { checked })}
            onChange={(patch) => updateContact(index, patch)}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-subtle">
          {savedCount > 0
            ? `${savedCount} saved${failedCount > 0 ? `, ${failedCount} to look at` : ""}.`
            : `${pending.length} ticked.`}
        </p>
        <div className="flex items-center gap-3">
          <FormStatus tone={failedCount > 0 ? "error" : "success"}>
            {summary}
          </FormStatus>
          <Button
            type="button"
            disabled={saving || pending.length === 0}
            onClick={() => void saveSelected()}
          >
            {saving
              ? "Saving…"
              : `Save Selected ${pending.length === 1 ? "Contact" : "Contacts"}`}
          </Button>
        </div>
      </div>
    </ReviewSection>
  );
}

function ContactRow({
  row,
  index,
  disabled,
  onToggle,
  onChange,
}: {
  row: RowState;
  index: number;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onChange: (patch: Partial<SuggestedContactWithKind>) => void;
}) {
  const { contact, status } = row;
  const id = (field: string) => `paste-contact-${index}-${field}`;

  if (status === "saved") {
    return (
      <li className="flex flex-wrap items-baseline gap-2 py-3 text-base">
        <span className="text-foreground">
          {contact.name ?? contact.label ?? "Contact"}
        </span>
        <span className="text-foreground-subtle">saved.</span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id={id("checked")}
          checked={row.checked}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-5 rounded border-input accent-accent-operations"
        />
        <label
          htmlFor={id("checked")}
          className="text-base font-medium text-foreground"
        >
          {contact.name ?? contact.label ?? `Contact ${index + 1}`}
        </label>
        {contact.confidence !== "high" && (
          <span className="text-sm text-accent-bronze">Worth a check</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 pl-8 sm:grid-cols-2">
        <Field label="Label" htmlFor={id("label")}>
          <Input
            id={id("label")}
            disabled={disabled || !row.checked}
            value={contact.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Plumber / Caretaker / Hospital…"
          />
        </Field>
        <Field label="Shows up in" htmlFor={id("kind")}>
          <select
            id={id("kind")}
            disabled={disabled || !row.checked}
            value={contact.kind}
            onChange={(e) =>
              onChange({ kind: e.target.value as PropertyContactKind })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" htmlFor={id("name")}>
          <Input
            id={id("name")}
            disabled={disabled || !row.checked}
            value={contact.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
        <Field label="Phone" htmlFor={id("phone")}>
          <Input
            id={id("phone")}
            type="tel"
            disabled={disabled || !row.checked}
            value={contact.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </Field>
        <Field label="Email" htmlFor={id("email")}>
          <Input
            id={id("email")}
            type="email"
            disabled={disabled || !row.checked}
            value={contact.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Field>
        <Field label="Notes" htmlFor={id("notes")}>
          <Input
            id={id("notes")}
            disabled={disabled || !row.checked}
            value={contact.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </Field>
      </div>

      {row.message ? (
        <p className="pl-8 text-sm text-destructive" role="alert">
          {row.message}
        </p>
      ) : null}
    </li>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm text-foreground-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The tidied document, shown last and read-only.
 *
 * Not a form: everything worth saving out of it is offered above, and a second
 * editable copy of the whole manual next to those would give the member two
 * texts to reconcile. This is here so they can see what we made of the thing
 * they pasted.
 */
function TidiedDocument({ text }: { text: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface/60 p-5">
      <h3 className="font-display text-lg leading-tight text-foreground">
        The whole thing, tidied up
      </h3>
      <p className="text-sm text-foreground-subtle">
        For reference. The parts worth keeping are offered above; this is just
        what we made of the document.
      </p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-4 text-base leading-relaxed text-foreground">
        {text}
      </pre>
    </section>
  );
}
