const stack = [
  "Next.js 16, App Router, React 19",
  "Neon Postgres with Drizzle ORM",
  "Better Auth with the organization plugin",
  "Cloudflare R2, Resend, Paystack",
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-20">
        <header>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">Foundation</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Presswise</h1>
          <p className="mt-4 text-lg text-ink/70">
            Print on demand for Nigerian print shops and their customers.
          </p>
        </header>

        <section aria-labelledby="stack-heading">
          <h2 id="stack-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
            Scaffold stack
          </h2>
          <ul className="mt-4 space-y-2">
            {stack.map((item) => (
              <li key={item} className="rounded-lg border border-ink/10 px-4 py-3 text-ink/80">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-ink/60">
          Empty scaffold. The data model and accounts land here next, then the order loop.
        </p>
      </div>
    </main>
  );
}
