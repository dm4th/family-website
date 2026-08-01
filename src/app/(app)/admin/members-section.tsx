"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { FormStatus } from "@/components/form-status";
import { generationShort } from "@/lib/generations";
import {
  changeMemberRole,
  setMemberActivation,
  type MemberActionState,
} from "./actions";

const initial: MemberActionState = { status: "idle" };

export type MemberRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "member" | "guest";
  family_branch: string | null;
  generation: number | null;
  deactivated_at: string | null;
  /** Null when they've never been through (or past) the welcome flow. */
  onboarded_at?: string | null;
  /** True when a `people` row is linked to them (PRD 39). */
  in_tree?: boolean;
};

/**
 * What's still unfinished about a member's own setup (PRD 39). Surfaced on the
 * roster because the failure mode is invisible otherwise: the member we lost
 * looked like an ordinary row with a blank name for weeks. Guests are exempt —
 * they have no tree to be in.
 */
function onboardingGap(row: MemberRow): string | null {
  if (row.role === "guest") return null;
  if (!row.full_name?.trim() || !row.family_branch) return "No name yet";
  if (row.generation == null) return "No generation";
  if (row.in_tree === false) return "Not in the tree";
  return null;
}

export function MembersSection({
  members,
  currentUserId,
}: {
  members: MemberRow[];
  currentUserId: string;
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No members yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border-y border-border">
      {members.map((m) => (
        <li key={m.id} className="py-4">
          <MemberRowEditor row={m} isSelf={m.id === currentUserId} />
        </li>
      ))}
    </ul>
  );
}

function MemberRowEditor({
  row,
  isSelf,
}: {
  row: MemberRow;
  isSelf: boolean;
}) {
  const router = useRouter();
  const roleAction = changeMemberRole.bind(null, row.id);
  const [state, formAction, isPending] = useActionState(roleAction, initial);
  const name = row.full_name ?? row.email;
  const gap = onboardingGap(row);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-foreground">
            {row.full_name ?? "Unnamed"}
          </span>
          <span className="text-xs text-foreground-subtle">{row.email}</span>
          {row.deactivated_at && (
            <Badge variant="outline">Deactivated</Badge>
          )}
          {!row.deactivated_at && gap && (
            <Badge variant="outline" title="This member hasn't finished setting up">
              {gap}
            </Badge>
          )}
        </div>
        <div className="mt-1 text-xs text-foreground-subtle">
          {[
            row.family_branch,
            row.generation ? generationShort(row.generation) : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </div>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={row.role}
          disabled={isPending || isSelf}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="guest">guest</option>
        </select>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending || isSelf}
        >
          {isPending ? "…" : "Save"}
        </Button>
      </form>

      <ConfirmButton
        triggerVariant={row.deactivated_at ? "outline" : "ghost"}
        triggerSize="sm"
        triggerClassName={
          row.deactivated_at ? undefined : "text-destructive hover:text-destructive"
        }
        disabled={isSelf}
        title={row.deactivated_at ? "Reactivate this member?" : "Deactivate this member?"}
        description={
          row.deactivated_at
            ? `${name} will appear in the directory again and regain access to the site.`
            : `${name} won't appear in the directory and will lose access to the site until reactivated.`
        }
        confirmLabel={row.deactivated_at ? "Reactivate" : "Deactivate"}
        pendingLabel={row.deactivated_at ? "Reactivating…" : "Deactivating…"}
        destructive={!row.deactivated_at}
        successMessage={
          row.deactivated_at ? "Member reactivated." : "Member deactivated."
        }
        errorTitle="Couldn't update this member"
        onConfirm={async () => {
          await setMemberActivation(row.id, !row.deactivated_at);
          router.refresh();
        }}
      >
        {row.deactivated_at ? "Reactivate" : "Deactivate"}
      </ConfirmButton>

      <FormStatus tone="error" className="basis-full text-xs">
        {state.status === "error" ? state.message : null}
      </FormStatus>
    </div>
  );
}
