"use client";

import { useRouter } from "next/navigation";

import { ConfirmButton } from "@/components/confirm-button";
import { cancelBooking } from "../actions";

export function OwnBookingCancel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-end">
      <ConfirmButton
        triggerVariant="ghost"
        triggerSize="sm"
        title="Cancel this stay?"
        description="This releases the dates so others can request them. You can book them again later if plans change."
        confirmLabel="Cancel Stay"
        cancelLabel="Keep Stay"
        pendingLabel="Cancelling…"
        destructive
        successMessage="Your stay was cancelled."
        errorTitle="Couldn't cancel this stay"
        onConfirm={async () => {
          const result = await cancelBooking(
            bookingId,
            { status: "idle" },
            new FormData(),
          );
          if (result.status === "error") throw new Error(result.message);
          router.refresh();
        }}
      >
        Cancel
      </ConfirmButton>
    </div>
  );
}
