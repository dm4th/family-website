"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInvitation,
  revokeInvitation,
  sendInviteMagicLink,
  type InvitationActionState,
} from "./actions";

const initial: InvitationActionState = { status: "idle" };

export type InvitationRow = {
  id: string;
  email: string;
  role: "admin" | "member" | "guest";
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string | null;
  created_at: string;
};

export function InvitationsSection({
  invitations,
}: {
  invitations: InvitationRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    createInvitation,
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
          Invite a family member
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="invite-email" className="text-xs">
              Email
            </Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="cousin@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role" className="text-xs">
              Role
            </Label>
            <select
              id="invite-role"
              name="role"
              defaultValue="member"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="guest">guest</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create invitation"}
            </Button>
          </div>
        </div>
        {state.status === "created" && (
          <p className="text-sm text-emerald-600">
            Invitation created for {state.email}. When they sign in (Google or
            magic link) with that email, they&apos;ll automatically get the
            assigned role.
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          All invitations
        </h3>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No invitations yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="px-3 py-2.5">
                <InvitationRowItem invitation={inv} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InvitationRowItem({ invitation }: { invitation: InvitationRow }) {
  const router = useRouter();
  const [revokePending, startRevoke] = useTransition();
  const [sendPending, startSend] = useTransition();

  const expires = invitation.expires_at
    ? new Date(invitation.expires_at)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{invitation.email}</span>
          <span className="text-xs text-muted-foreground">
            role: {invitation.role}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          status: <StatusPill status={invitation.status} />
          {expires && invitation.status === "pending" && (
            <> · expires {expires.toLocaleDateString()}</>
          )}
        </div>
      </div>

      {invitation.status === "pending" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sendPending}
            onClick={() => {
              startSend(async () => {
                try {
                  await sendInviteMagicLink(invitation.id);
                  router.refresh();
                  alert(`Magic link sent to ${invitation.email}.`);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed");
                }
              });
            }}
          >
            {sendPending ? "Sending…" : "Email magic link"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={revokePending}
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (!confirm(`Revoke invitation for ${invitation.email}?`))
                return;
              startRevoke(async () => {
                try {
                  await revokeInvitation(invitation.id);
                  router.refresh();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed");
                }
              });
            }}
          >
            {revokePending ? "Revoking…" : "Revoke"}
          </Button>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: InvitationRow["status"] }) {
  const color =
    status === "accepted"
      ? "text-emerald-600"
      : status === "pending"
        ? "text-foreground"
        : "text-muted-foreground";
  return <span className={color}>{status}</span>;
}
