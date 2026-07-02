"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/shell";
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

export type InvitePropertyOption = { id: string; name: string };

export function InvitationsSection({
  invitations,
  properties,
  isAdmin = false,
  listTitle = "All invitations",
}: {
  invitations: InvitationRow[];
  properties: InvitePropertyOption[];
  /** Admins may also invite a new admin, and (on /admin) see everyone's invites. */
  isAdmin?: boolean;
  /** Heading over the list. "All invitations" on /admin; "Invitations you've sent" on /invite. */
  listTitle?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createInvitation,
    initial,
  );
  const [role, setRole] = useState("member");

  return (
    <div className="flex flex-col gap-6">
      <form
        action={formAction}
        key={state.status === "created" ? "reset" : "stable"}
        className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5"
      >
        <Eyebrow>Invite a family member</Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-email"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
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
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-role"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Role
            </Label>
            <select
              id="invite-role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="member">member</option>
              {isAdmin && <option value="admin">admin</option>}
              <option value="guest">guest</option>
            </select>
          </div>
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Invitation"}
            </Button>
          </div>
        </div>
        {/* Guests are scoped to a single property — pick which one. */}
        {role === "guest" && (
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="invite-grant-property"
              className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
            >
              Guest of which property?
            </Label>
            {properties.length === 0 ? (
              <p className="text-sm text-destructive">
                No properties exist yet. Create one before inviting a guest.
              </p>
            ) : (
              <select
                id="invite-grant-property"
                name="grant_property_id"
                defaultValue=""
                required
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:max-w-xs"
              >
                <option value="" disabled>
                  Pick a property…
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {state.status === "created" && (
          <p className="text-sm text-accent-operations">
            Invitation created for {state.email}. When they sign in (Google or
            magic link) with that email, they&apos;ll automatically get the
            assigned role.
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <Eyebrow>{listTitle}</Eyebrow>
        {invitations.length === 0 ? (
          <p className="text-sm italic text-foreground-subtle">
            No invitations yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="py-3">
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-foreground">{invitation.email}</span>
          <span className="text-xs text-foreground-subtle">
            role: {invitation.role}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-foreground-subtle">
          <StatusBadge status={invitation.status} />
          {expires && invitation.status === "pending" && (
            <span>· expires {expires.toLocaleDateString()}</span>
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
            {sendPending ? "Sending…" : "Email Magic Link"}
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

function StatusBadge({ status }: { status: InvitationRow["status"] }) {
  if (status === "accepted") {
    return <Badge variant="operations">accepted</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="advisory">pending</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}
