"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Header-visible theme toggle. An icon button that shows the *resolved*
 * theme (sun in light mode, moon in dark mode) and opens a small dropdown
 * with three explicit choices: Light, Dark, System.
 *
 * Variants:
 *   - icon   (default) compact 32px button for the header
 *   - text   ghost text button for the auth-page footer
 */
type ThemeOption = "light" | "dark" | "system";

const OPTIONS: { value: ThemeOption; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export function ThemeToggle({
  variant = "icon",
  align = "end",
}: {
  variant?: "icon" | "text";
  align?: "start" | "end" | "center";
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Detect client mount without a setState-in-effect (avoids the
  // react-hooks/set-state-in-effect rule). Returns false during SSR and the
  // initial hydration render, true thereafter — same flash-guard behavior.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Before mount, render a neutral icon to avoid a flash of the wrong glyph.
  // (`resolvedTheme` is undefined on the server.)
  const isDark = mounted && resolvedTheme === "dark";
  const ActiveIcon = isDark ? MoonIcon : SunIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Change theme"
            className="rounded-full text-foreground-muted hover:text-foreground"
          >
            <ActiveIcon className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Change theme"
            className="gap-1.5 text-foreground-subtle hover:text-foreground"
          >
            <ActiveIcon className="size-3.5" />
            <span className="text-xs">Theme</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40">
        {OPTIONS.map(({ value, label, Icon }) => {
          const isActive = mounted && theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={(e) => {
                // Keep menu open so the user can preview both modes.
                e.preventDefault();
                setTheme(value);
              }}
              className={cn(
                "justify-between gap-3",
                isActive && "text-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3.5 text-foreground-subtle" />
                {label}
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-[0.65rem] text-accent-bronze transition-opacity",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              >
                ●
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
