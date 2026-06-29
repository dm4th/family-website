import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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

  // First-run gate (PRD 13): members who haven't been through the guided flow
  // (onboarded_at is null) are routed to /welcome before they see the app. That
  // route lives outside this (app) layout, so this can't loop. Existing named
  // members were backfilled as onboarded by the migration, so they skip it.
  const { data: onboarding } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (onboarding && !onboarding.onboarded_at) {
    redirect("/welcome");
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ?? null;

  const { data: adminCheck } = await supabase.rpc("is_admin");
  const isAdmin = adminCheck === true;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader
        userId={user.id}
        email={user.email}
        avatarUrl={avatarUrl}
        displayName={displayName}
        isAdmin={isAdmin}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
      <SiteFooter />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
