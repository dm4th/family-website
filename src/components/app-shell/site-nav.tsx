"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, MenuIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  isGroupActive,
  isPathActive,
  modeAccentRail,
  modeAccentSoft,
  modeAccentText,
  navGroupsForViewer,
  navItemsForViewer,
  type NavGroupDef,
} from "./nav-config";

type SiteNavProps = {
  isAdmin?: boolean;
};

// ── Desktop ────────────────────────────────────────────────────────────────
// Home stays a flat link; each mode collapses its pages behind a dropdown
// trigger tinted with that mode's accent. `viewport={false}` positions each
// dropdown directly under its own trigger, so a two-item Operations menu and a
// five-item Family menu each size to their own content.

export function SiteNavDesktop({ isAdmin = false }: SiteNavProps) {
  const pathname = usePathname();
  const groups = navGroupsForViewer(isAdmin);
  const homeActive = isPathActive(pathname, "/");

  return (
    <NavigationMenu viewport={false} className="hidden lg:flex" aria-label="Primary">
      <NavigationMenuList className="gap-1">
        <NavigationMenuItem>
          <NavigationMenuLink asChild active={homeActive}>
            <Link
              href="/"
              aria-current={homeActive ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                homeActive
                  ? "text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              Home
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        {groups.map((group) => {
          const active = isGroupActive(pathname, group, isAdmin);
          return (
            <NavigationMenuItem key={group.label}>
              <NavigationMenuTrigger
                className={cn(
                  "relative hover:bg-surface-sunken data-[state=open]:bg-surface-sunken",
                  active
                    ? "text-foreground"
                    : "text-foreground-muted hover:text-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-px w-3.5", modeAccentRail[group.mode])}
                />
                <span>{group.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2.5 -bottom-px h-0.5 rounded-full",
                      modeAccentRail[group.mode]
                    )}
                  />
                )}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div
                  aria-hidden
                  className={cn("h-0.5 w-full", modeAccentRail[group.mode])}
                />
                <ul className="w-64 p-2">
                  {navItemsForViewer(group, isAdmin).map((item) => {
                    const leafActive = isPathActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <NavigationMenuLink asChild active={leafActive}>
                          <Link
                            href={item.href}
                            aria-current={leafActive ? "page" : undefined}
                            className={cn(
                              "transition-colors hover:bg-surface-sunken",
                              leafActive && modeAccentSoft[group.mode]
                            )}
                          >
                            <span
                              className={cn(
                                "text-sm",
                                leafActive
                                  ? modeAccentText[group.mode]
                                  : "text-foreground"
                              )}
                            >
                              {item.label}
                            </span>
                            <span className="text-xs text-foreground-subtle">
                              {item.description}
                            </span>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────
// The same groups as an accordion inside the sheet. The group containing the
// current page starts expanded, so "where am I" survives the collapse. Every
// target is a full-width, comfortably tall tap area for iPad use.

export function SiteNavMobile({ isAdmin = false }: SiteNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const groups = navGroupsForViewer(isAdmin);
  const homeActive = isPathActive(pathname, "/");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle className="text-base">Mathieson Family</SheetTitle>
        </SheetHeader>
        <nav aria-label="Primary" className="flex flex-col gap-2 px-4 pb-6">
          <SheetClose asChild>
            <Link
              href="/"
              aria-current={homeActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-3 text-base transition-colors",
                homeActive
                  ? "bg-surface-sunken text-foreground"
                  : "text-foreground-muted hover:bg-surface-sunken hover:text-foreground"
              )}
            >
              Home
            </Link>
          </SheetClose>
          {groups.map((group) => (
            <MobileNavGroup
              key={group.label}
              group={group}
              isAdmin={isAdmin}
              pathname={pathname}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavGroup({
  group,
  isAdmin,
  pathname,
}: {
  group: NavGroupDef;
  isAdmin: boolean;
  pathname: string;
}) {
  const active = isGroupActive(pathname, group, isAdmin);
  const [expanded, setExpanded] = React.useState(active);
  const items = navItemsForViewer(group, isAdmin);
  const panelId = `mobile-nav-${group.mode}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left transition-colors hover:bg-surface-sunken"
      >
        <span
          aria-hidden
          className={cn("h-px w-4", modeAccentRail[group.mode])}
        />
        <span
          className={cn(
            "eyebrow",
            active ? modeAccentText[group.mode] : "text-foreground-subtle"
          )}
        >
          {group.label}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-4 text-foreground-subtle transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <ul id={panelId} className="flex flex-col gap-0.5 pb-1 pl-6">
          {items.map((item) => {
            const leafActive = isPathActive(pathname, item.href);
            return (
              <li key={item.href}>
                <SheetClose asChild>
                  <Link
                    href={item.href}
                    aria-current={leafActive ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2.5 transition-colors",
                      leafActive
                        ? cn(modeAccentSoft[group.mode], modeAccentText[group.mode])
                        : "hover:bg-surface-sunken"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-base",
                        leafActive ? modeAccentText[group.mode] : "text-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground-subtle">
                      {item.description}
                    </span>
                  </Link>
                </SheetClose>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
