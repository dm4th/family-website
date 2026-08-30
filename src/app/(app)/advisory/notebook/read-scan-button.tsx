"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extractTrustScan } from "./actions";

/**
 * Run the OCR + mapping pass for one notebook page. Reading writes only the
 * transcription and PENDING points — a manager's existing verdicts survive a
 * re-read, so this button is always safe to press again.
 */
export function ReadScanButton({
  documentId,
  again,
}: {
  documentId: string;
  again: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={again ? "ghost" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await extractTrustScan(documentId);
          if (!result.ok) {
            toast.error("Couldn't read the page", { description: result.message });
            return;
          }
          toast.success(
            result.keyPoints === 0
              ? "Page read. No trust points were found on it."
              : `Page read. ${result.keyPoints} point${result.keyPoints === 1 ? "" : "s"} waiting for review${
                  result.mapped > 0 ? `, ${result.mapped} with a proposed document link` : ""
                }.`,
            result.mappingMessage ? { description: result.mappingMessage } : undefined,
          );
          router.refresh();
        })
      }
    >
      {pending ? "Reading…" : again ? "Read Again" : "Read This Page"}
    </Button>
  );
}
