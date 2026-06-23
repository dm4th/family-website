"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { cancelBooking, type BookingActionState } from "../actions";

const initial: BookingActionState = { status: "idle" };

export function OwnBookingCancel({ bookingId }: { bookingId: string }) {
  const action = cancelBooking.bind(null, bookingId);
  const [state, formAction, isPending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" size="sm" variant="ghost" disabled={isPending}>
        {isPending ? "…" : "Cancel"}
      </Button>
      {state.status === "error" && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
