import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { SiteNavDesktop, SiteNavMobile } from "./site-nav";

type SiteHeaderProps = {
  userId: string;
  email: string | null | undefined;
  avatarUrl?: string | null;
  displayName?: string | null;
  isAdmin?: boolean;
};

export function SiteHeader(props: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex items-center gap-3 lg:gap-12">
          <SiteNavMobile />
          <Link
            href="/"
            aria-label="Home"
            className="group flex cursor-pointer items-baseline gap-2 transition-opacity hover:opacity-80"
          >
            <span className="font-display text-lg leading-none tracking-[-0.01em] text-foreground sm:text-xl">
              Mathieson
            </span>
            <span className="hidden text-[0.625rem] uppercase tracking-[0.22em] text-foreground-subtle transition-colors group-hover:text-foreground-muted sm:inline">
              Family
            </span>
          </Link>
          <SiteNavDesktop />
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <UserMenu {...props} />
        </div>
      </div>
    </header>
  );
}
