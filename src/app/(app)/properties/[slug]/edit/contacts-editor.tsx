"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addPropertyContact,
  deletePropertyContact,
  updatePropertyContact,
  type ContactFormState,
} from "../contacts/actions";

const initial: ContactFormState = { status: "idle" };

export type ContactRow = {
  id: string;
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export function ContactsEditor({
  propertyId,
  propertySlug,
  contacts,
}: {
  propertyId: string;
  propertySlug: string;
  contacts: ContactRow[];
}) {
  return (
    <div className="space-y-6">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No contacts yet. Add one below.
        </p>
      ) : (
        <ul className="space-y-4">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <ContactRowForm contact={c} propertySlug={propertySlug} />
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a contact
        </p>
        <AddContactForm
          propertyId={propertyId}
          propertySlug={propertySlug}
        />
      </div>
    </div>
  );
}

function AddContactForm({
  propertyId,
  propertySlug,
}: {
  propertyId: string;
  propertySlug: string;
}) {
  const action = addPropertyContact.bind(null, propertyId, propertySlug);
  const [state, formAction, isPending] = useActionState(action, initial);

  return (
    <form
      action={formAction}
      key={state.status === "saved" ? "reset" : "stable"}
      className="space-y-3"
    >
      <ContactFieldsGrid disabled={isPending} />
      <div className="flex items-center justify-end gap-3">
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}

function ContactRowForm({
  contact,
  propertySlug,
}: {
  contact: ContactRow;
  propertySlug: string;
}) {
  const updateAction = updatePropertyContact.bind(
    null,
    contact.id,
    propertySlug,
  );
  const [state, formAction, isPending] = useActionState(updateAction, initial);
  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();

  function onDelete() {
    if (!confirm(`Delete contact "${contact.label}"?`)) return;
    startDelete(async () => {
      try {
        await deletePropertyContact(contact.id, propertySlug);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  return (
    <form action={formAction} className="space-y-3">
      <ContactFieldsGrid
        defaultValues={contact}
        disabled={isPending || isDeleting}
        idPrefix={contact.id}
      />
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isPending || isDeleting}
          className="text-destructive hover:text-destructive"
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </Button>
        <div className="flex items-center gap-3">
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          {state.status === "saved" && (
            <p className="text-sm text-emerald-600">Saved.</p>
          )}
          <Button type="submit" size="sm" disabled={isPending || isDeleting}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ContactFieldsGrid({
  defaultValues,
  disabled,
  idPrefix,
}: {
  defaultValues?: Partial<ContactRow>;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const k = (s: string) => (idPrefix ? `${idPrefix}-${s}` : s);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldInline label="Label" htmlFor={k("label")}>
        <Input
          id={k("label")}
          name="label"
          required
          disabled={disabled}
          defaultValue={defaultValues?.label ?? ""}
          placeholder="Caretaker / Plumber / Emergency…"
        />
      </FieldInline>
      <FieldInline label="Name" htmlFor={k("name")}>
        <Input
          id={k("name")}
          name="name"
          disabled={disabled}
          defaultValue={defaultValues?.name ?? ""}
        />
      </FieldInline>
      <FieldInline label="Phone" htmlFor={k("phone")}>
        <Input
          id={k("phone")}
          name="phone"
          type="tel"
          disabled={disabled}
          defaultValue={defaultValues?.phone ?? ""}
        />
      </FieldInline>
      <FieldInline label="Email" htmlFor={k("email")}>
        <Input
          id={k("email")}
          name="email"
          type="email"
          disabled={disabled}
          defaultValue={defaultValues?.email ?? ""}
        />
      </FieldInline>
      <FieldInline label="Notes" htmlFor={k("notes")} className="sm:col-span-2">
        <Input
          id={k("notes")}
          name="notes"
          disabled={disabled}
          defaultValue={defaultValues?.notes ?? ""}
        />
      </FieldInline>
    </div>
  );
}

function FieldInline({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
