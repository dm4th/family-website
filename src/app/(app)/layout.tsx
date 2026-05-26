import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/app-shell/site-header";
import { SiteFooter } from "@/components/app-shell/site-footer";

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
    </div>
  );
}
