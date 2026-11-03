import { signUpAction } from "@/app/auth/actions";
import { getAuthRedirectPath } from "@/lib/auth/redirects";
import Link from "next/link";
import { redirect } from "next/navigation";

const SIGN_UP_ERRORS: Record<string, string> = {
  "auth.invalid_input": "Enter your name, a valid email address, and a password.",
  "auth.weak_password": "Choose a password with at least 8 characters.",
  "auth.sign_up_failed": "We could not create your account. Try another email or sign in.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const destination = getAuthRedirectPath(params.next);
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorCode ? SIGN_UP_ERRORS[errorCode] : undefined;
  const isPrinterSetup = destination === "/printer" || destination === "/printer/onboarding";

  async function submitSignUp(formData: FormData): Promise<void> {
    "use server";
    const result = await signUpAction(formData);
    if ("code" in result) {
      redirect(`/sign-up?next=${encodeURIComponent(destination)}&error=${encodeURIComponent(result.code)}`);
    }
    redirect(destination);
  }

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-2 lg:gap-16">
        <section className="rounded-2xl bg-brand p-8 text-surface sm:p-10">
          <Link href="/" className="text-sm font-semibold tracking-widest uppercase text-surface/80">
            Presswise
          </Link>
          <p className="mt-12 text-sm font-medium tracking-widest uppercase text-lime">
            {isPrinterSetup ? "For print shops" : "One account, both sides"}
          </p>
          <h1 className="mt-3 max-w-lg text-4xl font-semibold tracking-tight sm:text-5xl">
            {isPrinterSetup ? "Bring your print shop online." : "Make and manage orders in one place."}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-surface/80">
            {isPrinterSetup
              ? "Create your account, set up a private shop, and enter the printer dashboard. You can add products and publish when your shop is ready."
              : "Create one Presswise account to browse shops, manage your orders, or set up a printer shop."}
          </p>
          <ul className="mt-10 space-y-4 text-sm text-surface/90">
            <li className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 text-lime">✓</span>
              Your shop starts as a private draft.
            </li>
            <li className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 text-lime">✓</span>
              You can publish after adding real products and photos.
            </li>
            <li className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 text-lime">✓</span>
              The same account can also place customer orders.
            </li>
          </ul>
        </section>

        <section className="mx-auto w-full max-w-xl rounded-2xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8">
          <header className="mb-8">
            <p className="text-sm font-medium tracking-widest uppercase text-brand">
              Create account
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Get started with Presswise</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              {isPrinterSetup
                ? "Your account will take you to shop setup next."
                : "Use your account to browse shops and manage your orders."}
            </p>
          </header>

          {errorMessage && (
            <p className="mb-5 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-ink" role="alert">
              {errorMessage}
            </p>
          )}

          <form action={submitSignUp} className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-ink">Full name</span>
              <input
                name="name"
                type="text"
                autoComplete="name"
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <span className="mt-1 block text-xs text-ink/50">Use at least 8 characters.</span>
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink/60">
            Already have an account?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(destination)}`}
              className="font-medium text-brand underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
