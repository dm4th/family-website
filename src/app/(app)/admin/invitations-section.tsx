"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { FormStatus } from "@/components/form-status";
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
        {/* Kinship (PRD 39): the inviter answers once, and the invitee's tree
            step uses it to put likely parents/spouses at the top of the
            pickers. Optional, and never shown for guests. */}
        {role !== "guest" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="invite-relation"
                className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
              >
                Who are they to you?
              </Label>
              <select
                id="invite-relation"
                name="relation_to_inviter"
                defaultValue=""
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">Rather not say</option>
                <option value="child">My child</option>
                <option value="parent">My parent</option>
                <option value="sibling">My sibling</option>
                <option value="spouse">My spouse</option>
                <option value="other">Someone else</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="invite-relation-note"
                className="text-[0.65rem] uppercase tracking-[0.16em] text-foreground-subtle"
              >
                Anything to add? (optional)
              </Label>
              <Input
                id="invite-relation-note"
                name="relation_note"
                autoComplete="off"
                placeholder="e.g., my stepdaughter"
              />
            </div>
            <p className="text-sm text-foreground-subtle sm:col-span-2">
              Optional. It helps us suggest the right people when they add
              themselves to the family tree.
            </p>
          </div>
        )}

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
        <FormStatus
          tone={
            state.status === "error"
              ? "error"
              : state.status === "created" && !state.emailed
                ? // Saved, but the family member hasn't actually been told yet.
                  "info"
                : "success"
          }
        >
          {state.status === "created"
            ? state.emailed
              ? `Invitation sent to ${state.email}. They'll get an email explaining how to join, and they need to sign in with that same address.`
              : `Invitation created for ${state.email}, but the email couldn't be sent. Use "Email Magic Link" below, or send them the site address yourself and tell them to sign in with that exact email.`
            : state.status === "error"
              ? state.message
              : null}
        </FormStatus>
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
                  toast.success(`Magic link sent to ${invitation.email}.`);
                } catch (err) {
                  toast.error("Couldn't send the magic link", {
                    description:
                      err instanceof Error ? err.message : undefined,
                  });
                }
              });
            }}
          >
            {sendPending ? "Sending…" : "Email Magic Link"}
          </Button>
          <ConfirmButton
            triggerVariant="ghost"
            triggerSize="sm"
            triggerClassName="text-destructive hover:text-destructive"
            title="Revoke this invitation?"
            description={`${invitation.email} will no longer be able to use it to join.`}
            confirmLabel="Revoke Invitation"
            pendingLabel="Revoking…"
            destructive
            successMessage="Invitation revoked."
            errorTitle="Couldn't revoke the invitation"
            onConfirm={async () => {
              await revokeInvitation(invitation.id);
              router.refresh();
            }}
          >
            Revoke
          </ConfirmButton>
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
