"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendMagicLink,
  signInWithGoogle,
  type LoginState,
} from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState(
    sendMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="space-y-3">
        <p className="eyebrow text-accent-bronze">Sent</p>
        <h2 className="font-display text-xl leading-tight text-foreground">
          Check your inbox.
        </h2>
        <p className="text-sm leading-relaxed text-foreground-muted">
          We sent a sign-in link to{" "}
          <span className="text-foreground">{state.email}</span>. Open it on any
          device to come inside.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" size="lg" className="w-full">
          Continue with Google
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="eyebrow bg-surface-raised px-3 text-foreground-subtle">
            or by email
          </span>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-foreground-muted">
            Email address
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Sending…" : "Send sign-in link"}
        </Button>
        {(state.status === "error" || initialError) && (
          <p className="text-sm text-destructive">
            {state.status === "error" ? state.message : initialError}
          </p>
        )}
      </form>
    </div>
  );
}
