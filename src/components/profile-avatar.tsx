import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

type AvatarSize = "sm" | "md" | "lg" | "xl" | "hero";
type AvatarVariant = "ring" | "portrait" | "bare";

const sizeClass: Record<AvatarSize, string> = {
  sm: "size-8",
  md: "size-12",
  lg: "size-16",
  xl: "size-28",
  hero: "size-36 sm:size-44",
};

const fallbackTextClass: Record<AvatarSize, string> = {
  sm: "text-[0.65rem]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
  hero: "text-lg",
};

const variantClass: Record<AvatarVariant, string> = {
  // Default: thin hairline ring. Used in rosters and lists.
  ring: "ring-1 ring-border",
  // Portrait: heavier bronze frame for hero moments.
  portrait:
    "ring-1 ring-accent-bronze/30 shadow-portrait outline outline-1 outline-offset-2 outline-accent-bronze/40 rounded-full",
  // Bare: no decoration. Used inside dropdown menus.
  bare: "",
};

export function ProfileAvatar({
  name,
  src,
  size = "md",
  variant = "ring",
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: AvatarSize;
  variant?: AvatarVariant;
  className?: string;
}) {
  return (
    <Avatar className={cn(sizeClass[size], variantClass[variant], className)}>
      {src ? <AvatarImage src={src} alt={name ?? "Family member"} /> : null}
      <AvatarFallback
        className={cn(
          "bg-surface-sunken font-display font-medium tracking-wide text-foreground-muted",
          fallbackTextClass[size]
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
