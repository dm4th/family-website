import Link from "next/link";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/sign-out/actions";

function initials(input: string | null | undefined): string {
  if (!input) return "?";
  const parts = input.split(/[@\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function UserMenu({
  userId,
  email,
  avatarUrl,
  displayName,
  isAdmin,
  isGuest,
}: {
  userId: string;
  email: string | null | undefined;
  avatarUrl?: string | null;
  displayName?: string | null;
  isAdmin?: boolean;
  isGuest?: boolean;
}) {
  const label = displayName ?? email ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full ring-1 ring-border hover:ring-border-strong"
        >
          <Avatar className="size-8">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={label} /> : null}
            <AvatarFallback className="bg-surface-sunken font-display text-[0.7rem] font-semibold tracking-wide text-foreground-muted">
              {initials(label)}
            </AvatarFallback>
          </Avatar>
          <span className="sr-only">Open user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5 py-1">
            <span className="text-sm text-foreground">
              {displayName ?? "Signed in"}
            </span>
            {email ? (
              <span className="truncate text-xs text-foreground-subtle">
                {email}
              </span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* A guest can't reach /family/[id] (the directory is family-only);
            their self-service surface is the profile editor. */}
        {!isGuest && (
          <DropdownMenuItem asChild>
            <Link href={`/family/${userId}`}>View My Profile</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/profile/edit">Edit Profile</Link>
        </DropdownMenuItem>
        {!isGuest && (
          <DropdownMenuItem asChild>
            <Link href="/invite">Invite Someone</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/help">How This Works</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-foreground-subtle">
              Administration
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/admin">Admin</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/feedback">Feedback</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full text-left">
              Sign Out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
