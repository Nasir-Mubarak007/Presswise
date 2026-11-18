# 0001. Stack and architecture

**Date**: 2026-10-26
**Status**: In Progress

## Summary

Presswise is a print on demand platform for print shops and their customers. Customers upload a photo, customize it on a real product, preview it in 3D, order it, and track it. Printers see an order queue with designs and specs attached, and get paid through commission splits. This spec records the foundational tech stack decision so every later slice builds on real structure. The stack is a single Next.js web app backed by Neon Postgres, with Better Auth for accounts, Backblaze B2 for files, Resend for email, and Paystack for payments.

## Decision

**Chosen option**: Option 1: The chosen stack (Next.js, Neon, Drizzle, Better Auth, Backblaze B2, Resend, Vercel, Railway, Paystack).

The stack is Next.js 16 (App Router, TypeScript, React 19) as a single web app for storefront and dashboard, Neon Postgres with Drizzle ORM for data, Better Auth with its organization plugin for accounts, Backblaze B2 S3 compatible object storage for files, Resend for email, Paystack for payments, Vercel for hosting, Railway for Redis and BullMQ background jobs, Upstash for rate limiting, Sentry for errors, and PostHog for funnels. Use one private B2 bucket. Serve customer images through application routes that check publication state, and serve printer previews only after shop membership checks. (basis: your confirmed Backblaze B2 account and one private bucket decision, the AWS SDK S3 client already in the project, and the Backblaze S3 compatible API)

**Implementation skills**: Next.js (`vercel-labs/agent-skills`, `.agents/skills/`) · Drizzle ORM (`oakoss/agent-skills`, `.agents/skills/`) · Better Auth (`better-auth/skills`, `.agents/skills/`) · AWS SDK (`agents-inc/skills`, `.agents/skills/infra-platform-aws-sdk/`) · Resend (`resend/resend-skills`, `.agents/skills/`) · Vercel (`vercel-labs/agent-skills`, `.agents/skills/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety across frontend and backend, large ecosystem |
| Framework | Next.js 16, App Router, React 19 | Single app for storefront and dashboard, full stack server routes |
| Runtime | Node.js current LTS (pinned) | Same version on Vercel and the Railway worker |
| Package manager | npm | Matches the roadmap commands and lockfile |
| Primary DB | Neon Postgres | Relational data with ACID guarantees, database branching for tests and preview branches |
| Query layer | Drizzle ORM + drizzle-kit | Type safe queries over the pg driver, migrations generated from schema |
| Auth | Better Auth + organization plugin | Email password with verified email, printer companies with admin and employees |
| File storage | Backblaze B2 | One private S3 compatible bucket for photos and print files, signed upload URLs; use the free tier for now |
| Email | Resend | Verification, password reset, invitations |
| API | Next.js Route Handlers and Server Actions | Server side logic and form actions, Hono deferred |
| Hosting | Vercel (app) | Managed hosting for the Next.js app |
| Background jobs | BullMQ + Redis on Railway | Print file generation, cleanup, payment reconciliation |
| Rate limiting | Upstash Ratelimit | Shared rate limiter across servers, replaces in memory limiter before launch |
| Payments | Paystack Subaccounts + Split Payments | NGN payments in kobo, automatic commission split to printer bank accounts |
| Observability | Sentry (errors), PostHog (funnel) | Error tracking and funnel analytics, planned for launch |
| Styling | Tailwind CSS v4 + CSS custom properties | Themes and per tenant brand colour, matches the branch code |
| Testing | Vitest (domain, service, data contract) and Playwright (browser, end to end, visual) | Fast unit tests and real page checks |
| Source control and CI | GitHub with Vercel Git integration; GitHub Actions for lint, test, build, and audit | One workflow gates every change; a Neon to Vercel integration gives a branch per pull request |

**Scaffold conventions** (locked in at scaffold time):
- Every server action and route handler returns one discriminated union result type defined in `lib/domain`.
- Request payloads are validated with zod at the boundary.
- Logging uses a structured console wrapper with level, event, and requestId.
- Client data fetching uses server components, server actions, and `router.refresh` polling; no client store.

## Consequences

**Positive**:
- One person can build, deploy, and operate the entire stack without a platform engineering function.
- Every service has a free or low cost tier suitable for the MVP budget.
- Neon branching gives a safe throw away database for tests and pull request previews.
- Interfaces with in memory twins let most code be tested without accounts or keys.
- Paystack split payments handle commission settlement automatically.

**Negative / tradeoffs**:
- Eight managed services to track credentials, regions, and billing for (Neon, B2, Resend, Paystack, Railway, Upstash, Sentry, PostHog).
- Vercel functions have cold starts and short execution limits (about 60 seconds on Hobby, 15 minutes on Pro); print file generation must go to the Railway worker.
- Better Auth is younger than some alternatives, so security upkeep and email deliverability (SPF, DKIM) are the team's responsibility.
- Neon scale to zero means the first request after a quiet spell takes about half a second.

**Neutral**:
- Money is stored as kobo (integer) because large bulk orders pass 2 billion kobo; all monetary math must use integers, not floating point.
- VAT is 7.5 percent as a per printer setting under Nigeria Tax Act 2025.
- The Neon region and the Vercel function region must be resolved together and colocated before the Neon project is created; eu-central-1 (Frankfurt) is suggested for Nigerian users but must be verified against Neon's current region list and against which Vercel region the plan allows. Nigeria to Europe is about 150 ms round trip either way, so keep multi round trip pages static.
- Background jobs sit behind a `JobQueue` interface with an in memory twin; reconciliation and cleanup can run as idempotent Vercel Cron routes, and the Railway worker deploys only in Phase D. The print file output contract (PDF or PNG, DPI) is owned by the print file feature spec.
- Browser uploads to B2 need a CORS allowlist for the app origin. A public bucket and public object URLs are not used.
- The editor is custom pointer code (drag, zoom, text, clamping), not Fabric.js; Fabric.js can be adopted later for rotation, multi layer, or cropping handles.
- Storefront pages will be static for SEO by making the navbar's account part client side.
- HEIC photos from iPhones are not converted yet; uploads accept PNG, JPEG, and WebP only.
- Rate limiting starts in memory and moves to Upstash before launch.

## Follow-up

- [ ] Choose and confirm both the Neon region and the Vercel function region before creating the project, and colocate them.
- [ ] Set up email deliverability (verify sending domain, SPF, DKIM) for Resend.
- [ ] Move rate limiting from in memory to Upstash before launch.
- [ ] Add Content Security Policy and security headers before launch.
- [ ] Add row level security as a second layer for tenant isolation.
- [ ] Install the chosen Agent Skills (Next.js, Drizzle, Better Auth, AWS SDK, Resend, Vercel) and connect the chosen MCP servers (Neon, Better Auth, Resend, Vercel, Paystack).
- [ ] Capture stack conventions in root AGENTS.md (framework, ORM, database) and area AGENTS.md files for payments, auth, storage, and email.
- [ ] Decide the platform fee percentage and who bears Paystack's processing fee.
- [ ] Start the CAC registration and Paystack KYC clock now; a subaccount needs a verified business and bank account, which blocks Phase C settlement.
- [ ] Define the `JobQueue` interface with an in memory twin and idempotent Vercel Cron routes for reconciliation and cleanup.
- [ ] Add a free keep alive ping (Vercel Cron) to reduce Neon cold starts.
- [ ] Revisit Resend's free tier (about 100 emails per day) before order emails.
- [ ] Park the print file output contract (PDF or PNG, DPI) for the print file feature spec.
- [ ] Configure the private B2 bucket, an application key restricted to that bucket, and a CORS allowlist for the app origin.
- [ ] Add the GitHub Actions workflow (lint, test, build, audit) and the Neon to Vercel branch integration for pull requests.
- [ ] Pin the Node LTS in `engines` and `.nvmrc`, the same on Vercel and the Railway worker.
