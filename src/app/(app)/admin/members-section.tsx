"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
};

export function MembersSection({
  members,
  currentUserId,
}: {
  members: MemberRow[];
  currentUserId: string;
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No members yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {members.map((m) => (
        <li key={m.id} className="px-3 py-3">
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
  const [activatePending, startActivate] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">
            {row.full_name ?? "Unnamed"}
          </span>
          <span className="text-xs text-muted-foreground">{row.email}</span>
          {row.deactivated_at && (
            <span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              Deactivated
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {[row.family_branch, row.generation ? `Gen ${row.generation}` : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </div>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={row.role}
          disabled={isPending || isSelf}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="guest">guest</option>
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={isPending || isSelf}>
          {isPending ? "…" : "Save"}
        </Button>
      </form>

      <Button
        type="button"
        size="sm"
        variant={row.deactivated_at ? "outline" : "ghost"}
        disabled={isSelf || activatePending}
        className={
          row.deactivated_at
            ? ""
            : "text-destructive hover:text-destructive"
        }
        onClick={() => {
          if (
            !confirm(
              row.deactivated_at
                ? `Reactivate ${row.full_name ?? row.email}?`
                : `Deactivate ${row.full_name ?? row.email}? They won't appear in the directory until reactivated.`,
            )
          ) {
            return;
          }
          startActivate(async () => {
            try {
              await setMemberActivation(row.id, !row.deactivated_at);
              router.refresh();
            } catch (err) {
              console.error(err);
              alert(
                err instanceof Error ? err.message : "Could not update.",
              );
            }
          });
        }}
      >
        {activatePending
          ? "…"
          : row.deactivated_at
            ? "Reactivate"
            : "Deactivate"}
      </Button>

      {state.status === "error" && (
        <p className="basis-full text-xs text-destructive">{state.message}</p>
      )}
    </div>
  );
}
