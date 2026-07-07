import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-semibold">
            Compandium
          </Link>
          <nav className="flex gap-5 text-sm text-zinc-500">
            <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Overview
            </Link>
            <span title="Coming soon" className="cursor-default opacity-40">
              Departments
            </span>
            <span title="Coming soon" className="cursor-default opacity-40">
              Members
            </span>
            <span title="Coming soon" className="cursor-default opacity-40">
              Connectors
            </span>
            <span title="Coming soon" className="cursor-default opacity-40">
              Ask
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-500">{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
