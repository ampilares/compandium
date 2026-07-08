import { AuthForm } from "@/components/auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <AuthForm mode="signup" initialEmail={email} />
    </main>
  );
}
