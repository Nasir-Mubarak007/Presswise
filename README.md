# Presswise

Print on demand for Nigerian print shops and their customers. A customer uploads a photo, customizes it on a real product, previews it, orders it, and tracks it. A printer sees an order queue with the design and specs attached, and is paid through a commission split.

This repository is at the first step: an empty scaffold that boots and builds. Every later slice builds on this structure.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Framework | Next.js 16, App Router, React 19 |
| Runtime | Node.js 24 LTS, pinned in `engines` and `.nvmrc` |
| Package manager | npm |
| Database | Neon Postgres |
| Query layer | Drizzle ORM and drizzle-kit |
| Auth | Better Auth with the organization plugin |
| File storage | Cloudflare R2 |
| Email | Resend |
| Hosting | Vercel |
| Background jobs | BullMQ and Redis on Railway |
| Payments | Paystack subaccounts and split payments |
| Styling | Tailwind CSS v4 and CSS custom properties |
| Testing | Vitest and Playwright |

The decision record is `docs/specs/0001-stack-architecture.md`.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other commands:

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # unit, component and logger tests (Vitest)
npm run test:ui    # browser tests for the real pages (Playwright)
npm run test:all   # both suites
```

No database or account is needed to boot the scaffold. `PRESSWISE_DEMO=1` will turn on seeded in memory data once those features land.

## Environment

Copy `.env.example` to `.env.local` and fill in only what the feature you are working on needs. The names match the roadmap. Demo flags are ignored in production.

## Project layout

```
app/             pages and server actions (storefront, dashboard, auth, onboarding)
components/      customer/, printer/, ui/
lib/domain/      pricing, orders, validation, design geometry, brand colours, team rules
lib/services/    orders, fulfilment, catalog, shop, team, account
lib/data/        Repo interface, Postgres, in memory, seed
lib/db/          Drizzle schemas and the Neon pool
lib/auth/        AuthService interface, Better Auth, in memory, viewer, guest order tokens
lib/payments/    Paystack and simulated
lib/email/       Resend, templates, dev outbox
lib/storage/     R2 and inline
lib/log/         structured console logger
lib/preview3d/   the WebGL renderer
tests/           domain, services, data (contract), ui
docs/            scope, specs, and notes
```

## Conventions locked at scaffold time

- Every server action and route handler returns the `Result` type from `lib/domain/result.ts`.
- Request payloads are validated with zod at the boundary.
- Logging goes through `lib/log/logger.ts`, with a level, an event name, and a request id.
- Client data fetching uses server components, server actions, and `router.refresh` polling. No client store.

## Docs

- `docs/scope/scope.md` is the living plan.
- `docs/specs/` holds decisions, one per feature.
- `presswise-roadmap.md` is the product roadmap.
