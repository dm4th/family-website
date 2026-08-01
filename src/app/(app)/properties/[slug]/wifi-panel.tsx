"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/form-status";
import { Eyebrow, LedgerPanel } from "@/components/shell";

/**
 * The Wi-Fi square on a property page (PRD 36).
 *
 * Client-side only for the copy button; the QR itself is a server-rendered
 * SVG string handed down as a prop, so no QR library reaches the browser.
 * Visible to guests by design: the person who most needs the network password
 * is the one standing in the kitchen for the first time.
 */
export function WifiPanel({
  network,
  password,
  qrSvg,
}: {
  network: string;
  password: string | null;
  qrSvg: string | null;
}) {
  const [status, setStatus] = React.useState<string | null>(null);

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setStatus("Password copied.");
    } catch {
      // Clipboard access can be blocked; the password is selectable on screen.
      setStatus("Couldn't copy. You can select the password above instead.");
    }
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <Eyebrow>Wi-Fi</Eyebrow>
        <h3 className="font-display text-lg leading-tight text-foreground">
          Getting Online
        </h3>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1">
          <Eyebrow className="text-foreground-subtle">Network</Eyebrow>
          <p className="font-mono text-sm text-foreground">{network}</p>
        </div>

        {password && (
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-foreground-subtle">Password</Eyebrow>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="select-all font-mono text-sm text-foreground">
                {password}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPassword}
              >
                Copy Password
              </Button>
            </div>
          </div>
        )}

        <FormStatus tone={status?.startsWith("Couldn") ? "error" : "success"}>
          {status}
        </FormStatus>

        {qrSvg && (
          <div className="flex flex-col items-center gap-2 border-t border-border pt-4">
            <div
              className="w-32 rounded-sm bg-white p-2 ring-1 ring-border [&>svg]:h-auto [&>svg]:w-full"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-xs text-foreground-subtle">
              Point a phone camera here to join.
            </p>
          </div>
        )}
      </div>
    </LedgerPanel>
  );
}
