import { BrainCard } from "@/components/brain-card";
import { CreateOrgForm } from "@/components/create-org-form";
import { getInstance, getOrgContext, isAdmin } from "@/lib/org";

export default async function DashboardPage() {
  const ctx = await getOrgContext();

  if (!ctx) {
    return (
      <main className="flex flex-1 items-center justify-center py-16">
        <CreateOrgForm />
      </main>
    );
  }

  const instance = await getInstance(ctx.orgId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{ctx.orgName}</h1>
        <p className="text-sm text-zinc-500">workspace: {ctx.orgSlug}</p>
      </div>
      <BrainCard
        canProvision={isAdmin(ctx)}
        initialInstance={
          instance
            ? {
                id: instance.id,
                status: instance.status,
                publicUrl: instance.publicUrl,
                provider: instance.provider,
                region: instance.region,
                lastHealthyAt: instance.lastHealthyAt?.toISOString() ?? null,
                lastError: instance.lastError,
              }
            : null
        }
      />
    </main>
  );
}
