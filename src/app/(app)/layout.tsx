import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/user-menu";

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
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-semibold tracking-tight text-base hover:opacity-80"
            >
              Family Portal
            </Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/family" className="hover:text-foreground">
                Family
              </Link>
              <Link href="/properties" className="hover:text-foreground">
                Properties
              </Link>
            </nav>
          </div>
          <UserMenu
            userId={user.id}
            email={user.email}
            avatarUrl={avatarUrl}
            displayName={displayName}
            isAdmin={isAdmin}
          />
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
