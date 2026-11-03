<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack

* Language: TypeScript.
* Framework: Next.js 16 App Router with React 19.
* Runtime: Node.js 24, as pinned by `.nvmrc` and `package.json`.
* Package manager: npm.
* Database: Neon Postgres with Drizzle ORM and drizzle-kit.
* Authentication: Better Auth with the organization plugin.
* File storage: Cloudflare R2. Email: Resend.
* API: Next.js Route Handlers and Server Actions.
* Hosting: Vercel. Background jobs: BullMQ with Redis on Railway.
* Rate limiting: Upstash Ratelimit. Payments: Paystack Subaccounts and Split Payments.
* Observability: Sentry and PostHog.
* Styling: Tailwind CSS v4 and CSS custom properties.
* Tests: Vitest and Playwright.
* Import alias: `@/*` maps to the repository root.
* The chosen service stack is not fully installed or connected yet. See [the stack spec](./docs/specs/0001-stack-architecture/index.md).

## Build approach

Tracer Bullet: each slice works end to end through every layer so the whole pipe is proven early, real from slice one, just narrow in breadth.

## Rules

* Server actions and route handlers return the shared result type in `lib/domain`.
* Validate request data at boundaries with Zod.
* Use the structured logger in `lib/log` for server logging.
* Keep `/storefront` as an in memory demo. Its accounts and payments are simulated, not connected to production services. See [the storefront prototype spec](./docs/specs/0002-customer-storefront-prototype.md).
* Use CSS Modules for scoped component styling alongside Tailwind CSS.

## Commands

* `npm run dev`
* `npm run lint`
* `npm run typecheck`
* `npm test`
* `npm run test:ui`
* `npm run build`
