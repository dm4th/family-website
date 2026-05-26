"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps next-themes with our defaults. Uses the `class` attribute strategy so
 * Tailwind v4's `.dark` block in globals.css kicks in. Defaults to `system`
 * so a new visitor sees whichever mode their OS is in.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
