"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

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

type NavLink = {
  label: string;
  href: string;
  description?: string;
};

type NavGroup = {
  label: string;
  /** Mode tint used as a thin colored rule under the group label. */
  mode: "family" | "operations" | "advisory";
  links: NavLink[];
};

// Single source of truth for the family-office nav. Each group corresponds to
// a page mode — adding routes later (booking, documents, finances, timeline,
// messaging) means appending links to an existing group rather than spawning
// new top-level tabs.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Family",
    mode: "family",
    links: [
      { label: "Directory", href: "/family", description: "Profiles & generations" },
    ],
  },
  {
    label: "Operations",
    mode: "operations",
    links: [
      { label: "Properties", href: "/properties", description: "Homes & stewardship" },
      { label: "Calendar", href: "/calendar", description: "Bookings across properties" },
    ],
  },
];

const railTint: Record<NavGroup["mode"], string> = {
  family: "bg-accent-family",
  operations: "bg-accent-operations",
  advisory: "bg-accent-advisory",
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavDesktop() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="hidden items-center gap-10 lg:flex"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex items-center gap-5">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("h-px w-4", railTint[group.mode])}
            />
            <span className="eyebrow text-foreground-subtle">{group.label}</span>
          </span>
          {group.links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-foreground-muted hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function SiteNavMobile() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

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
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-base">Mathieson Family</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-8 px-6 pb-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn("h-px w-4", railTint[group.mode])}
                />
                <span className="eyebrow text-foreground-subtle">
                  {group.label}
                </span>
              </div>
              <ul className="flex flex-col gap-2 pl-6">
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <SheetClose asChild>
                        <Link
                          href={link.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block text-base transition-colors",
                            active
                              ? "text-foreground"
                              : "text-foreground-muted hover:text-foreground"
                          )}
                        >
                          {link.label}
                          {link.description && (
                            <span className="mt-0.5 block text-xs text-foreground-subtle">
                              {link.description}
                            </span>
                          )}
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
