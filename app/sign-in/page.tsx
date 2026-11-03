import { signInAction } from "@/app/auth/actions";
import { getAuthRedirectPath } from "@/lib/auth/redirects";
import Link from "next/link";
import { redirect } from "next/navigation";

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth.invalid_input": "Enter your email and password.",
  "auth.sign_in_failed": "Those sign in details did not work. Check them and try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const destination = getAuthRedirectPath(params.next);
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorCode ? SIGN_IN_ERRORS[errorCode] : undefined;

  async function submitSignIn(formData: FormData): Promise<void> {
    "use server";
    const result = await signInAction(formData);
    if ("code" in result) {
      redirect(`/sign-in?next=${encodeURIComponent(destination)}&error=${encodeURIComponent(result.code)}`);
    }
    redirect(destination);
  }

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">Presswise</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-ink/70">Access your storefront orders and your printer shop dashboard.</p>
        </header>

        <section aria-labelledby="sign-in-form">
          <h2 id="sign-in-form" className="sr-only">Sign in form</h2>
          {errorMessage && (
            <p className="mb-4 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-ink" role="alert">
              {errorMessage}
            </p>
          )}
          <form action={submitSignIn} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input
                name="email"
                type="email"
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Password</span>
              <input
                name="password"
                type="password"
                required
                className="mt-1 block w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface hover:bg-brand/90"
            >
              Sign in
            </button>
          </form>
          <p className="mt-4 text-sm text-ink/60">
            No account yet?{" "}
            <Link
              href={`/sign-up?next=${encodeURIComponent(destination)}`}
              className="text-brand underline"
            >
              Sign up
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}