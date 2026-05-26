import { BriefingPanel, Eyebrow } from "@/components/shell";
import { LoginForm } from "./login-form";

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <BriefingPanel className="bg-surface-raised">
      <header className="mb-8 flex flex-col gap-2">
        <Eyebrow>Members entrance</Eyebrow>
        <h1 className="font-display text-[1.875rem] leading-[1.05] text-foreground">
          Welcome back.
        </h1>
        <p className="text-sm leading-relaxed text-foreground-muted">
          Sign in with the email address that received your invitation.
        </p>
      </header>
      <LoginForm initialError={error} />
    </BriefingPanel>
  );
}
