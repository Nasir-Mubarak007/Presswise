import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureCustomerProfile, getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { listShopsForUser } from "@/lib/services/shop-service";

export default async function MePage() {
  const user = await getAuthenticatedUser(await headers());

  if (!user) {
    redirect("/sign-in");
  }

  await ensureCustomerProfile(user.id);
  const [context, shops] = await Promise.all([
    resolveRoleContext(user.id),
    listShopsForUser(user.id),
  ]);

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">Your account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-ink/70">
            Signed in as <span className="text-ink">{user.email}</span>.
          </p>
        </header>

        <section aria-labelledby="roles-heading">
          <h2 id="roles-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
            Your roles
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {context.roles.map((role) => (
              <li key={role} className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
                {role}
              </li>
            ))}
            {context.roles.length === 0 ? (
              <li className="text-ink/60">No roles yet.</li>
            ) : null}
          </ul>
        </section>

        {context.isPrinter ? (
          <section aria-labelledby="shops-heading">
            <h2 id="shops-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
              Your printer shops
            </h2>
            <ul className="mt-4 space-y-3">
              {shops.map((shop) => (
                <li key={shop.shopId} className="rounded-lg border border-ink/10 px-4 py-3">
                  <p className="font-medium">{shop.name}</p>
                  <p className="text-sm text-ink/60">/{shop.slug} · {shop.membershipRole}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <a href="/shop/new" className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface hover:bg-brand/90">
            Set up a printer shop
          </a>
        </section>
      </div>
    </main>
  );
}