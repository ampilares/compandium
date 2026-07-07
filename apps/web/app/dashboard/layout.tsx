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
            <Link
              href="/dashboard/departments"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Departments
            </Link>
            <Link href="/dashboard/members" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Members
            </Link>
            <Link href="/dashboard/ask" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Ask
            </Link>
            <Link href="/dashboard/access" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Agent access
            </Link>
            <Link
              href="/dashboard/connectors"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Connectors
            </Link>
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
