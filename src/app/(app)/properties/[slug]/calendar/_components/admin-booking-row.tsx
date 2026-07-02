"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { FormStatus } from "@/components/form-status";

import {
  approveBooking,
  declineBooking,
  cancelBooking,
  type BookingActionState,
} from "../actions";

const initial: BookingActionState = { status: "idle" };

type Props = {
  bookingId: string;
  /**
   * Whether to render the cancel action (used in admin tools when a booking
   * is already approved but needs to be revoked).
   */
  mode: "pending" | "approved";
};

export function AdminBookingRow({ bookingId, mode }: Props) {
  if (mode === "pending") {
    return <PendingActions bookingId={bookingId} />;
  }
  return <CancelAction bookingId={bookingId} />;
}

function PendingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const approve = approveBooking.bind(null, bookingId);
  const [approveState, approveAction, approvePending] = useActionState(
    approve,
    initial,
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <ConfirmButton
          triggerVariant="outline"
          triggerSize="sm"
          disabled={approvePending}
          title="Decline this request?"
          description="The family member who asked will be notified that these dates weren't approved."
          confirmLabel="Decline Request"
          cancelLabel="Keep It"
          pendingLabel="Declining…"
          destructive
          successMessage="Request declined."
          errorTitle="Couldn't decline this request"
          onConfirm={async () => {
            const result = await declineBooking(
              bookingId,
              { status: "idle" },
              new FormData(),
            );
            if (result.status === "error") throw new Error(result.message);
            router.refresh();
          }}
        >
          Decline
        </ConfirmButton>
        <form action={approveAction}>
          <Button type="submit" size="sm" disabled={approvePending}>
            {approvePending ? "…" : "Approve"}
          </Button>
        </form>
      </div>
      <FormStatus tone="error">
        {approveState.status === "error" ? approveState.message : null}
      </FormStatus>
    </div>
  );
}

function CancelAction({ bookingId }: { bookingId: string }) {
  const cancel = cancelBooking.bind(null, bookingId);
  const [state, formAction, isPending] = useActionState(cancel, initial);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.6rem] uppercase tracking-[0.16em] text-foreground-subtle">
            Reason (required)
          </span>
          <input
            name="cancellation_notes"
            type="text"
            required
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "…" : "Cancel Booking"}
        </Button>
      </div>
      <FormStatus tone="error">
        {state.status === "error" ? state.message : null}
      </FormStatus>
    </form>
  );
}
