export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
