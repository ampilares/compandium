import { CreateOrgForm } from "@/components/create-org-form";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const orgs = await auth.api.listOrganizations({ headers: requestHeaders });

  if (orgs.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center py-16">
        <CreateOrgForm />
      </main>
    );
  }

  const org = orgs[0]!;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-zinc-500">workspace: {org.slug}</p>
      </div>
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-1 font-medium">Company brain</h2>
        <p className="text-sm text-zinc-500">
          Not provisioned yet — instance provisioning arrives with Phase 1.
          This card will show brain status, department sync state, and your
          MCP endpoint.
        </p>
      </section>
    </main>
  );
}
