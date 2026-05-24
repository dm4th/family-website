"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-6">
      <form
        action={formAction}
        key={state.status === "created" ? "reset" : "stable"}
        className="rounded-lg border border-dashed border-border p-4 space-y-3"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a property
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="prop-name" className="text-xs">
              Name
            </Label>
            <Input
              id="prop-name"
              name="name"
              required
              placeholder="Mumford's Cabin"
            />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="prop-slug" className="text-xs">
              Slug (URL)
            </Label>
            <Input
              id="prop-slug"
              name="slug"
              placeholder="auto from name"
              pattern="[a-z0-9\-]+"
              title="lowercase letters, numbers, and hyphens only"
            />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="prop-location" className="text-xs">
              Location
            </Label>
            <Input
              id="prop-location"
              name="location"
              placeholder="Big Sky, Montana"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create property"}
          </Button>
        </div>
        {state.status === "created" && (
          <p className="text-sm text-emerald-600">
            Created.{" "}
            <Link
              href={`/properties/${state.slug}/edit`}
              className="underline"
            >
              Edit it
            </Link>
            .
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          All properties
        </h3>
        {properties.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No properties yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {properties.map((p) => (
              <li key={p.id} className="px-3 py-2.5">
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
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/properties/${property.slug}`}
            className="font-medium hover:underline underline-offset-4"
          >
            {property.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            /{property.slug}
          </span>
        </div>
        {property.location && (
          <div className="text-xs text-muted-foreground mt-0.5">
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
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
      >
        <option value="active">active</option>
        <option value="maintenance">maintenance</option>
        <option value="inactive">inactive</option>
      </select>
      <Link
        href={`/properties/${property.slug}/edit`}
        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        Edit
      </Link>
    </div>
  );
}
