import { createShopAction } from "@/app/printer/actions";
import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { isPrinterExperienceEnabled } from "@/lib/printer-gate";
import { NIGERIAN_STATES } from "@/lib/services/printer-service";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

const SHOP_ERRORS: Record<string, string> = {
  "shop.invalid_input": "Enter a shop name, a unique shop address, and a city.",
  "shop.invalid_state": "Choose a state in Nigeria or the FCT.",
  "shop.one_per_user": "Your account already belongs to a printer shop.",
  "shop.slug_taken": "That shop address is already in use. Choose another.",
  "shop.create_failed": "We could not create your shop. Please try again.",
  "auth.not_authenticated": "Sign in before creating your shop.",
  "printer.disabled": "Printer shop setup is temporarily unavailable.",
};

export default async function PrinterOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (!isPrinterExperienceEnabled()) {
    notFound();
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    redirect("/sign-in?next=/printer/onboarding");
  }

  const roleContext = await resolveRoleContext(user.id);
  if (roleContext.activeShopId) {
    redirect("/printer");
  }

  const params = await searchParams;
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorCode ? SHOP_ERRORS[errorCode] : undefined;

  async function submitShop(formData: FormData): Promise<void> {
    "use server";
    const result = await createShopAction(formData);
    if (!result.ok) {
      redirect(`/printer/onboarding?error=${encodeURIComponent(result.code)}`);
    }
    redirect("/printer");
  }

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <section className="rounded-2xl bg-brand p-8 text-surface sm:p-10">
          <Link href="/" className="text-sm font-semibold tracking-widest uppercase text-surface/80">
            Presswise
          </Link>
          <p className="mt-12 text-sm font-medium tracking-widest uppercase text-lime">
            Printer setup
          </p>
          <h1 className="mt-3 max-w-lg text-4xl font-semibold tracking-tight sm:text-5xl">
            Start with your shop details.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-surface/80">
            We will create a private shop and open your dashboard. Add products and real photos
            before publishing it to customers.
          </p>
          <div className="mt-10 rounded-xl border border-surface/20 bg-surface/10 p-5">
            <p className="text-sm font-semibold">Your shop stays private for now</p>
            <p className="mt-2 text-sm leading-6 text-surface/75">
              Creating a shop does not publish it. You can review your catalog and details before
              making it visible in the printer directory.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl rounded-2xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8">
          <header className="mb-8">
            <p className="text-sm font-medium tracking-widest uppercase text-brand">
              Shop details
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Create your printer shop</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Signed in as {user.email}. You can change these details later.
            </p>
          </header>

          {errorMessage && (
            <p className="mb-5 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-ink" role="alert">
              {errorMessage}
            </p>
          )}

          <form action={submitShop} className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-ink">Shop name</span>
              <input
                name="name"
                type="text"
                autoComplete="organization"
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Shop web address</span>
              <input
                name="slug"
                type="text"
                autoComplete="url"
                required
                pattern="[A-Za-z0-9]+(?:[- ][A-Za-z0-9]+)*"
                title="Use letters and numbers, with single spaces or hyphens between words."
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <span className="mt-1 block text-xs text-ink/50">
                Use letters and numbers. Spaces are converted to hyphens.
              </span>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">State</span>
                <select
                  name="state"
                  required
                  defaultValue=""
                  className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                >
                  <option value="" disabled>Select a state</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">City</span>
                <input
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  required
                  className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink">Area <span className="font-normal text-ink/50">(optional)</span></span>
              <input
                name="area"
                type="text"
                autoComplete="address-level3"
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Create private shop
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
