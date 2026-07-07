import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <AuthForm mode="signup" />
    </main>
  );
}
