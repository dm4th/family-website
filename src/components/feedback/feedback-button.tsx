"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  submitFeedback,
  type FeedbackFormState,
} from "@/app/(app)/feedback/actions";

const initial: FeedbackFormState = { status: "idle" };

const CATEGORIES: { value: string; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "problem", label: "Problem" },
  { value: "other", label: "Other" },
];

/**
 * The always-reachable "Send Feedback" entry (PRD 20). Rendered in both the
 * header (a visible button) and the footer (a quiet link), so it's one obvious
 * click from every page — including the stripped guest shell, since guests may
 * submit too. Opens a small sheet with a category + message form; the page they
 * were on is auto-captured for triage context. Pass `children` to override the
 * trigger's contents (e.g. an icon + label for the header).
 */
export function FeedbackButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Capture the page they were on at submit time (client-side, fresh from
  // window), injecting it into the FormData before the server action runs. This
  // keeps page-url capture out of an effect entirely.
  const [state, formAction, isPending] = useActionState(
    async (prev: FeedbackFormState, formData: FormData) => {
      if (typeof window !== "undefined") {
        formData.set(
          "page_url",
          window.location.pathname + window.location.search,
        );
      }
      return submitFeedback(prev, formData);
    },
    initial,
  );

  const sent = state.status === "sent";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={
            className ??
            "text-foreground-subtle underline-offset-4 transition-colors hover:text-foreground-muted hover:underline"
          }
        >
          {children ?? "Send Feedback"}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Send Feedback</SheetTitle>
          <SheetDescription>
            Suggest something you&apos;d love to see, or tell us about a rough
            edge. A sentence or two is plenty.
          </SheetDescription>
        </SheetHeader>

        {sent ? (
          <div className="flex flex-1 flex-col gap-4 px-6">
            <p className="text-sm text-foreground">
              Thanks, we got it. Your note is with the family stewards.
            </p>
            <div>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            action={formAction}
            className="flex flex-1 flex-col gap-5 px-6"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm text-foreground-muted">
                What kind of note is this?
              </legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c, i) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm text-foreground-muted transition-colors has-[:checked]:border-accent-advisory has-[:checked]:bg-accent-advisory-soft has-[:checked]:text-accent-advisory"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={c.value}
                      defaultChecked={i === 0}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feedback-message" className="text-foreground-muted">
                Your message
              </Label>
              <Textarea
                id="feedback-message"
                name="message"
                required
                maxLength={2000}
                rows={5}
                placeholder="Could we add…? / This felt confusing when…"
                autoFocus
              />
            </div>

            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}

            <SheetFooter className="mt-auto flex-row gap-2 px-0">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Sending…" : "Send Feedback"}
              </Button>
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
