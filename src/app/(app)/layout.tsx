import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { SiteHeader } from "@/components/app-shell/site-header";
import { SiteFooter } from "@/components/app-shell/site-footer";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already redirects unauthenticated requests, but belt-and-braces.
  if (!user) {
    redirect("/login");
  }

  const viewer = await resolveViewer();
  const isAdmin = viewer?.isAdmin ?? false;
  const isGuest = viewer?.isGuest ?? false;

  // First-run gate (PRD 13): members who haven't been through the guided flow
  // (onboarded_at is null) are routed to /welcome before they see the app.
  // GUESTS are exempt — they don't create a family profile, and /welcome isn't
  // in their allowed routes, so sending a not-yet-onboarded guest there bounces
  // off the guest route gate (middleware) and loops (ERR_TOO_MANY_REDIRECTS).
  // Existing named members were backfilled as onboarded by the migration.
  if (!isGuest) {
    const { data: onboarding } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    if (onboarding && !onboarding.onboarded_at) {
      redirect("/welcome");
    }
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader
        userId={user.id}
        email={user.email}
        avatarUrl={avatarUrl}
        displayName={displayName}
        isAdmin={isAdmin}
        isGuest={isGuest}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
      <SiteFooter />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
