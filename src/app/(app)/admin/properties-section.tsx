"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/shell";
import {
  createProperty,
  setPropertyStatus,
  type PropertyAdminState,
} from "./actions";

const initial: PropertyAdminState = { status: "idle" };

export type AdminPropertyRow = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  status: "active" | "maintenance" | "inactive";
};

export function PropertiesSection({
  properties,
}: {
  properties: AdminPropertyRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    createProperty,
    initial,
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        action={formAction}
        key={state.status === "created" ? "reset" : "stable"}
        className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5"
      >
        <Eyebrow>Add a property</Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldCol>
            <Label
              htmlFor="prop-name"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Name
            </Label>
            <Input
              id="prop-name"
              name="name"
              required
              placeholder="e.g., Lake House"
            />
          </FieldCol>
          <FieldCol>
            <Label
              htmlFor="prop-slug"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Slug
            </Label>
            <Input
              id="prop-slug"
              name="slug"
              placeholder="auto from name"
              pattern="[a-z0-9\-]+"
              title="lowercase letters, numbers, and hyphens only"
            />
          </FieldCol>
          <FieldCol>
            <Label
              htmlFor="prop-location"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Location
            </Label>
            <Input
              id="prop-location"
              name="location"
              placeholder="Big Sky, Montana"
            />
          </FieldCol>
        </div>
        <div className="flex items-center justify-end gap-3">
          {state.status === "created" && (
            <p className="text-sm text-accent-operations">
              Created.{" "}
              <Link
                href={`/properties/${state.slug}/edit`}
                className="underline-offset-4 hover:underline"
              >
                Edit it
              </Link>
              .
            </p>
          )}
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create property"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <Eyebrow>All properties</Eyebrow>
        {properties.length === 0 ? (
          <p className="text-sm italic text-foreground-subtle">
            No properties yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {properties.map((p) => (
              <li key={p.id} className="py-3">
                <PropertyRowItem property={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PropertyRowItem({ property }: { property: AdminPropertyRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeStatus(newStatus: AdminPropertyRow["status"]) {
    startTransition(async () => {
      try {
        await setPropertyStatus(property.id, newStatus);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            href={`/properties/${property.slug}`}
            className="text-sm text-foreground underline-offset-4 hover:underline"
          >
            {property.name}
          </Link>
          <span className="text-xs text-foreground-subtle">
            /{property.slug}
          </span>
        </div>
        {property.location && (
          <div className="mt-1 text-xs text-foreground-subtle">
            {property.location}
          </div>
        )}
      </div>
      <select
        value={property.status}
        disabled={isPending}
        onChange={(e) =>
          changeStatus(e.target.value as AdminPropertyRow["status"])
        }
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <option value="active">active</option>
        <option value="maintenance">maintenance</option>
        <option value="inactive">inactive</option>
      </select>
      <Link
        href={`/properties/${property.slug}/edit`}
        className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        Edit
      </Link>
    </div>
  );
}

function FieldCol({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}
