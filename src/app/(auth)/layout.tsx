import { SectionRule } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Auth pages sit in Advisory mode — calm, sober, document-like. A quiet
  // serif wordmark anchors the top; the form is composed inside a single
  // briefing panel.
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-8">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg tracking-[-0.01em] text-foreground">
            Mathieson
          </span>
          <span className="text-[0.625rem] uppercase tracking-[0.22em] text-foreground-subtle">
            Family
          </span>
        </div>
        <ThemeToggle />
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-20">
        {children}
      </div>
      <footer className="mx-auto w-full max-w-2xl px-6 py-8">
        <SectionRule />
        <p className="mt-6 text-center text-xs text-foreground-subtle">
          A private family portal. By invitation only.
        </p>
      </footer>
    </main>
  );
}
