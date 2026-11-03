# Presswise — Product Roadmap (v2)

*A platform that lets printers' customers upload a photo, customize it on a real product, preview it in 3D, order it and track it — while printers get a clear order queue with the design and specs attached, and get paid directly.*

**Version 2 · 25 October 2026.** This replaces v1. Everything decided since v1 is in here, together with the decisions that were already in force, so this one document is the current plan.

> **What changed since v1 (the short version)**
> - **Authentication: Clerk → Better Auth** (your decision, 20 Oct). Self-hosted, user data lives in our own database. Better Auth's *organization* plugin provides the "Company" with an admin and employees.
> - **Database: Supabase → Neon Postgres**, with **Drizzle** for queries and migrations (your choice of my default).
> - **File storage: Supabase Storage → Cloudflare R2.** **Email: Resend** (now required — Better Auth sends no email itself).
> - **Framework version: Next.js 16** (`proxy.ts` replaces `middleware.ts`).
> - **One Next.js project** now holds the customer storefront *and* the printer dashboard (v1 described this; it now exists).
> - **Honest status added** (section 2): what is built and tested, what is written but unverified, and what is not built yet.
> - **Open decisions are listed in one place** (section 15), including one you need to confirm: the editor is **not** built on Fabric.js.

---

## 0. Project constraints (unchanged)

- **Builder:** solo — developer, UI/UX, QA and DevOps in one person.
- **Timeline:** 1–2 months to an MVP in front of real printers. *(See section 13: the remaining scope is large; some of it may need to move to after the beta.)*
- **Canvas/graphics experience:** new territory.
- **Priority:** build the editor and core components yourself, for learning and to make the product your own — not a paid SDK.
- **Budget:** free or low-cost tools preferred for the MVP.
- **Reach:** storefronts should be publicly searchable.
- **Platform:** web first (PWA, partially offline). Native mobile app is later.
- **Market:** Nigeria. Currency NGN, stored in **kobo** (integer). VAT 7.5% (Nigeria Tax Act 2025, in force 1 Jan 2026) as a per-printer setting.

---

## 1. Decisions at a glance

### Product and business

| Decision | Choice | Status |
|---|---|---|
| Who takes the payment | Presswise collects; Paystack **Subaccounts + Split Payments** settle the printer's share to their bank | Decided · payment code written, unverified |
| Revenue | One **flat transaction-fee %** on every order. No subscription tiers; every feature open to every printer | Decided · **the % is not set** |
| Gateway | Paystack only for MVP (Flutterwave is the documented fallback) | Decided |
| Printers | Each printer is a **Company**: an admin (the boss) plus optional employees | Decided · built on Better Auth organizations |
| Employee access | Orders and catalog only. No settings, no team, no billing | Decided · built and tested |
| Order review | A printer can **decline before production, and must give a reason** (shown to the customer; refund started) | Decided · built and tested |
| Pricing features | **MOQ** and **bulk/tiered pricing**, both optional per variant, frozen into the order when placed | Decided · built and tested |
| Delivery and tax | Shipping and VAT broken out in the total. Delivery fees are set **per printer** | Decided · built and tested |
| Storefront look | Theme picker (3 themes) + brand colour (logo and banner image still to come). Free-form page builder deferred to early post-MVP | Decided · colour and themes built |
| Suspending printers | In-app ability for the founder to suspend a printer that breaks the rules | Decided · supported in data and storefront; **admin screen not built** |
| Mockups | Printer-supplied long-term; built-in artwork used for development | Decided |
| Design approach | Code-first (Figma skipped); green SaaS design system, glass navbar, light and dark themes | Decided |

### Technology

| Layer | Choice | Status |
|---|---|---|
| Framework | **Next.js 16** (App Router, TypeScript, React 19), one app for storefront and dashboard | Decided · built |
| Authentication | **Better Auth** + organization plugin; email/password with verified email; Google optional | Decided 20 Oct · service written, unverified; screens still to build |
| Database | **Neon Postgres** (pooled connection for the app, unpooled for migrations) | Decided 20 Oct · schema and adapter written, unverified |
| Query layer | **Drizzle ORM** + `drizzle-kit` migrations, over the `pg` driver | Decided (my default, accepted) |
| File storage | **Cloudflare R2** via short-lived signed upload URLs | Decided (my default, accepted) · written, unverified |
| Email | **Resend** (verification, password reset, invitations; order emails in v1.1) | Decided (my default, accepted) · written, unverified |
| API | Next.js Route Handlers and Server Actions; Hono deferred | Decided |
| Hosting | **Vercel** (app) · **Railway** (Redis + BullMQ worker only) · Neon · R2 | Decided · region for Neon **to be chosen** |
| Background jobs | BullMQ + Redis on Railway | Decided · **not built** |
| Rate limiting | Upstash Ratelimit (planned); an in-memory limiter is in place now | Decided · swap not done |
| Editor | Built in-house. v1 said **Fabric.js**; the current editor is custom pointer code | **Needs your confirmation** (section 15) |
| 3D preview | Dependency-free WebGL renderer written for this project | Built and tested |
| Monitoring | Sentry (errors), PostHog (funnel) | Planned |

---

## 2. Where the project stands

### What exists

A working **Next.js project (`presswise/`)**: about 4,500 lines of application code, a domain core with no framework dependency, and a full test suite. It runs in a **demo mode** with no accounts or keys (seeded data, a "pick a person" login), which is how it is tested here.

An earlier HTML prototype (`presswise-customer/`) remains as a design reference only.

### Status by area

**Built and tested** means exercised by automated tests in this environment. **Built, unverified** means written to the library's documentation but not run, because Next.js, Better Auth, Neon, R2, Resend and Paystack could not be installed or reached from where it was written.

| Area | Status |
|---|---|
| Pricing, MOQ, bulk tiers, totals, VAT, delivery estimates | Built and tested |
| Order state machine (8 statuses, who can do what, decline-needs-reason, idempotent payment confirmation) | Built and tested |
| Tenant isolation (a printer can never read or change another printer's data) | Built and tested |
| Customer: storefront, customizer (drag, zoom, text, colours, sizes, finishes, front/back), 3D preview with flat fallback, checkout, payment page, order tracking, guest look-up, account page | Built and tested |
| Printer: overview, order queue, order detail with fulfilment actions, catalog editor, settings with live brand preview, team page (read-only in demo), first-run set-up | Built and tested (demo mode) |
| Accessibility: colour contrast in both themes, keyboard use, labels | Built and tested |
| Security basics: server-side price calculation, design and image verification, XSS-safe rendering, open-redirect guard, signed guest-order access, rate-limited look-ups | Built and tested |
| Postgres adapter, Drizzle schema, Better Auth config and service, Resend, R2, Paystack payment provider | Built, unverified |
| Sign-in, sign-up, forgot/reset password, account menu, team manager, accept-invitation screens | Not built yet (the service layer and server actions behind them are done and tested) |
| Paystack return page and webhook | Not built |
| Printer onboarding to Paystack (subaccount creation with bank details) | Not built |
| Order emails, print-file generation, SEO (ISR, sitemap, structured data), PWA and design autosave, platform-admin suspend screen, legal pages | Not built |

### Test numbers (25 Oct)

- **107** unit, service and data-contract tests — all passing.
- **187** browser checks driving the real pages in Chromium — all passing.
- The **data-contract suite** (14 tests) currently runs against the in-memory database. The **same suite** will run against a real Neon branch when you set `TEST_DATABASE_URL`; that is how the Postgres adapter gets verified.

### The migration in progress (Clerk → Better Auth, Supabase → Neon)

Done: runtime modes, Drizzle schema (app and Better Auth tables), Postgres adapter, contract tests, email and storage layers, the `AuthService` interface with a real and an in-memory implementation, team rules, server actions for sign-in/up/reset, team and onboarding.

Still to do: build the sign-in/up/reset/account/team/invitation screens, remove the remaining Clerk imports from the UI (navbar, dashboard layout, team and onboarding pages, sign-in/up pages), add `proxy.ts`, and a browser scenario for the new screens.

---

## 3. MVP scope

**Customer**
- Public storefront per printer, with category filter and search
- Customizer: upload a photo, position and resize it on the real product, optional text, colour and size, material and finish with live price, front and back for apparel
- 3D preview (rotate by mouse, touch or keyboard); flat fallback if 3D isn't available
- Checkout: contact, delivery or pickup, address, Paystack payment; totals show delivery and VAT
- Order page with status, progress bar, tracking number, history, estimate and, if declined, the printer's reason and the refund
- Guest checkout with look-up by order number and email; optional account that keeps all orders and claims earlier guest orders

**Printer**
- Sign up, create a Company and shop (optionally with starter products)
- Order queue with a "needs review" count; order detail showing the design to print, the customer and address
- Actions: start production, decline with reason, ship with carrier and tracking number, mark delivered or collected, mark refund complete
- Catalog: products, material/finish options, add-on prices, minimum quantities, bulk prices, show or hide
- Settings: name, web address, tagline, brand colour, theme, delivery options and fees, VAT on or off
- Team: invite employees or admins, change roles, remove (admins only)

**Deliberately not in the MVP:** shopping cart (one product per order), page builder, customer order emails, native app, multi-location.

---

## 4. Architecture

### One app, three kinds of visitor

| URL | Who | What |
|---|---|---|
| `/[printer]` and below | Anyone | Storefront, customizer, preview, checkout, payment, order pages, order look-up |
| `/account` | Signed-in customer | Their orders across all printers |
| `/dashboard/...` | Printer staff | Overview, orders, catalog, settings (admin), team (admin) |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/check-email`, `/accept-invitation/[id]` | Anyone | Account screens |
| `/onboarding` | Signed-in person with no shop | Create the company and shop |
| `/api/auth/...`, `/api/webhooks/...` | Machines | Better Auth endpoints; Paystack webhook |

A shop's address (`/mikes-print-shop`) is its **slug**. Reserved words (dashboard, sign-in, api and so on) can never be used as a slug. Subdomains and custom domains are v2.

### Layers (and why the migration was cheap)

```
UI (React components, pages)             ← knows nothing about Better Auth or Postgres
Server actions (thin)                    ← re-check who is calling, every time
Services (business rules)                ← pure TypeScript, fully tested
Domain (pricing, order rules, validation, design geometry, brand colours)
Interfaces:  Repo · AuthService · PaymentProvider · Storage · Emailer
Implementations: Postgres (Neon) | in-memory · Better Auth | in-memory · Paystack | simulated · R2 | inline · Resend | outbox
```

Every outside service is behind an interface with an in-memory twin. That is why switching from Clerk and Supabase touched a handful of files, and why most of the project can be tested without any account.

### Three ways to run

| Mode | Data | Sign-in | Used for |
|---|---|---|---|
| Production | Neon | Better Auth | Real use |
| Demo (`PRESSWISE_DEMO=1`) | Seeded in memory | "Pick a person", no passwords | Development, demos |
| Memory-auth (`PRESSWISE_MEMORY_AUTH=1`) | In memory | The real screens against a fake auth service | Testing the sign-in and team screens |

Both development modes are **impossible in production**. There is no silent fallback to memory.

---

## 5. Data model

The source of truth is `lib/db/schema.ts` (the app's tables) and `lib/db/auth-schema.ts` (Better Auth's tables). Migrations are generated with `drizzle-kit`. Summary:

- **tenants** — a shop: slug (unique), name, `org_id` (its Better Auth company), status (active/suspended) and suspension reason, branding (colour, theme, tagline), VAT on/off, delivery options and fees, Paystack subaccount, `order_seq` (the order-number counter).
- **products** — per tenant: slug, name, category, artwork type, base price, sizes, colours, active, optional mockup URL. Unique on (tenant, slug).
- **product_variants** — a material + finish combination: price add-on, minimum quantity, and bulk tiers (kept with the variant). Primary key (product, id).
- **customers** — one row per (printer, person): the same person can be a customer of many printers.
- **orders** — tenant, order number (unique per tenant), customer *or* guest email (a database check requires one of them), contact, address, totals (subtotal, shipping, VAT, total — all kobo, `bigint`), payment reference (unique), payment channel, status, fulfilment, carrier, tracking number, decline reason.
- **order_items** — a frozen snapshot: product, variant, colour, size, quantity, **unit price at the time**, and the design as JSON. Deliberately not a foreign key, so an order survives later catalogue edits.
- **order_status_history** — every step with time, note and who did it.
- **Better Auth:** user, session, account, verification, organization, member, invitation.

**What changed from v1:** order numbers come from a counter incremented inside the order-creating transaction (so two buyers never get the same number); customers are unique per (tenant, user) instead of globally; orders and designs can belong to a **guest**; bulk tiers live with the variant instead of in a separate table; money is `bigint` because large bulk orders pass 2 billion kobo; statuses are now `pending_payment, paid, in_production, shipped, delivered, rejected, refunded, cancelled`.

### Keeping one printer's data away from another's

- **Primary guard (built, tested):** every query takes a tenant, and the tenant always comes from the signed-in staff member's session — never from the request. Tests prove another printer's orders and products are "not found".
- **Second layer (planned):** Postgres row-level security using a per-request setting (`SET LOCAL app.tenant_id`). In v1 this was RLS keyed to Clerk's token; with Neon and Better Auth it needs to be added deliberately.
- **Migrations:** run with Neon's *unpooled* connection string. The app uses the *pooled* one.

---

## 6. Accounts, roles and permissions

| | Guest | Customer | Employee | Admin / owner | Founder (platform) |
|---|---|---|---|---|---|
| Browse, customize, order | Yes | Yes | Yes | Yes | |
| See an order | With number **and** email | Their own | Their shop's | Their shop's | |
| Handle orders (start, ship, decline) | | | Yes | Yes | |
| Edit catalog | | | Yes | Yes | |
| Settings, team | | | **No** | Yes | |
| Suspend a printer | | | | | Yes (screen not built) |

**Rules that are built and tested**
- A verified email is required before a session exists. This is also what makes "attach my earlier guest orders to my account" safe.
- Wrong password and unknown email give the **same** message. Password reset never reveals whether an account exists.
- Passwords: at least 8 characters, no common passwords, not containing the email name.
- Sign-in, sign-up, reset and look-up attempts are rate-limited.
- Redirects after sign-in accept only paths on this site (blocks look-alike-site tricks).
- The company membership is **read from the database on every request**, so removing someone takes effect immediately. (Better Auth's session also stores an "active company", which can go stale; we never rely on it.)
- Team rules: only an admin invites; only the owner adds another admin or changes an admin; nobody changes themselves or the owner; a company always keeps an owner.
- In the MVP one person belongs to **one** company.

**What you now own because Clerk is gone:** email deliverability (verify your sending domain, SPF/DKIM), Google sign-in credentials, session and rate-limit settings, and keeping Better Auth up to date. It is a younger project than Clerk, so security upkeep is on you.

---

## 7. Orders, payments and money

### The life of an order

```
pending_payment → paid → in_production → shipped → delivered
                    ↘ rejected (before production only; needs a reason) → refunded
pending_payment → cancelled
```

- The price is **always recalculated on the server** from the catalogue; the browser only says what it wants.
- Unit price and totals are **frozen** into the order. Later catalogue changes never reprice it.
- Payment confirmation is **idempotent** (a repeated webhook changes nothing).
- Shipping requires a tracking number (not for pickup). Declining requires a reason of at least a short sentence and starts a refund.
- Customers see simpler words than printers ("Received" vs "Needs review").

### Paystack

- **Flow:** order created unpaid → customer pays → server confirms → order becomes `paid`.
- **Split:** each printer gets a Paystack subaccount; checkout names it plus Presswise's fee, so settlement is automatic.
- **Safety:** the return page must verify the transaction with Paystack and **compare the amount to the order total**; the webhook must verify Paystack's signature. *(Both not built yet.)*
- **Test mode:** a simulated payment page exists, switched on in demo mode only. In production without a Paystack key the app refuses to start a payment.
- **Not decided:** the platform fee percentage, and who bears Paystack's own processing fee. The payment code refuses to take money until both are configured, rather than guess.

---

## 8. Files, email and background work

- **Design photos:** the browser re-draws every upload (this strips location data from photos), checks type, size and minimum resolution, and uploads **straight to R2** with a short-lived signed URL. At order time the server looks at the file's real bytes. Accepted: PNG, JPEG, WebP, up to 2.5 MB, at least 200 px (a warning below 600 px). *(HEIC from iPhones is not converted yet.)*
- **Email (Resend):** verification, password reset, team invitations. Order notifications are v1.1.
- **Background jobs (BullMQ on Railway) — not built:** print-ready file generation, cleanup of abandoned drafts, payment reconciliation.
- **Live order updates:** Supabase Realtime is gone. The MVP refreshes on a timer; Pusher/Ably or server-sent events are options later.

---

## 9. Hosting and environments

- **Vercel** runs the app; **Neon** holds the data; **R2** holds photos and print files; **Resend** sends email; **Railway** runs Redis and the worker; **Upstash** will back the rate limiter.
- **Environments:** local (demo mode, no accounts needed) · preview (a Neon *branch* per pull request) · production.
- **Neon notes:** scale-to-zero means the first request after a quiet spell takes about half a second; branching gives a safe throw-away database for tests. **Pick the region before creating the project** — I could not confirm which regions are offered or whether any is near Nigeria, and checkout speed depends on it. Keep Vercel's function region and the database in the same place.
- **Environment variables (names):** `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (optional), `RESEND_API_KEY`, `EMAIL_FROM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `PAYSTACK_SECRET_KEY`, `PLATFORM_FEE_PERCENT`, `PAYSTACK_FEE_BEARER`, `ORDER_ACCESS_SECRET`. Demo flags (`PRESSWISE_DEMO`, `PRESSWISE_MEMORY_AUTH`) are ignored in production.

---

## 10. Security, privacy and compliance

- **Personal data:** customers' names, phones, addresses and photos are personal data under Nigeria's NDPA 2023. Still needed before launch: real Terms and Privacy Policy (the pages exist only as placeholders), a data-retention rule, and a process for deletion requests. Customer records reference the user with a "restrict" rule, so deleting an account needs an **anonymise-the-orders** step designed first.
- **Cards:** never touch our servers (Paystack).
- **Uploads:** location data stripped; real bytes checked on the server; only our own bucket's URLs accepted.
- **Rendering:** everything a person types is shown as text, never as markup (tested with hostile names and addresses); emails escape names too.
- **Secrets:** server-side only. Never commit them; the demo identities are off in production.
- **Not yet done:** Content-Security-Policy and security headers, a dependency-audit step in CI, the RLS second layer.

---

## 11. Testing and quality

- **Domain tests** for money and rules (a quiet bug here costs real money).
- **Service tests** for orders, tenants, auth, team, email and storage.
- **Data-contract tests** — one suite any database implementation must pass; run against memory now and Neon later.
- **Browser tests** drive the real pages: purchase, printer fulfilment (including the customer seeing the printer's actions), catalog and settings, onboarding, 3D preview, contrast.
- **Cannot be tested here:** Next.js itself (routing, server actions), Better Auth, Neon, R2, Resend, Paystack. Those are the "built, unverified" items; section 13 lists the first-run checks that verify them.
- **Planned:** Playwright end-to-end against a real dev server, visual regression on the preview, Sentry and PostHog.

---

## 12. Revenue model (unchanged)

Subscription tiers are dropped. Revenue is a single flat transaction fee on every order, taken automatically by Paystack Split Payments. Printers pay nothing to sign up; Presswise earns when a printer earns. Each printer gets a Paystack subaccount at set-up. **The fee % is still to be decided** (benchmark against comparable platforms and printer margins). If a compelling paid offer appears later, that is a v2+ conversation; nothing in the schema blocks it. *(The homepage draft's Bench/Press/Plant pricing section needs updating separately.)*

---

## 13. Delivery plan

No dates — the order matters more, and the remaining scope is bigger than one month.

**Phase A — finish the migration (in progress)**
Sign-in, sign-up, forgot/reset, check-email, account menu, team manager and accept-invitation screens; remove the remaining Clerk code; `proxy.ts`; a browser scenario for the new screens; Paystack return page and webhook with amount check; update the README.

**Phase B — first real run (needs your machine and accounts)**
`npm install`; create the Neon project (region first); `npm run auth:schema` then `db:generate` and `db:migrate`; run the data-contract suite against a Neon branch; smoke-test sign-up through email verification; Paystack test-mode payment; an R2 upload; a Resend email. Fix what the unverified code gets wrong.

**Phase C — payments and onboarding**
Decide fee % and fee bearer; printer onboarding that creates the Paystack subaccount from bank details; refunds end to end.

**Phase D — completeness for a beta**
Order emails; print-file worker; SEO (static regeneration, sitemap, structured data — requires making the navbar client-side so pages aren't dynamic); PWA with design autosave to IndexedDB; founder's suspend screen; real legal pages; Sentry and PostHog; HEIC handling.

**Phase E — beta and launch**
Interview 5–8 printers first (many run on WhatsApp and email — that is the wedge); beta with 2–3 real printers; launch checklist (domain, legal, backups, monitoring).

---

## 14. After the MVP

- **v1.1** — customer order emails, free-form page builder, reorder, multi-photo and multi-product orders (cart)
- **v1.2** — bulk/batch ordering, shipping-rate integration (EasyPost/Shippo), richer editor (rotation, layers, templates)
- **v2** — white-label domains, API access for printers, multi-location routing, native app
- **v2+** — AI image clean-up and upscaling, analytics dashboard for printers

---

## 15. Open decisions that need you

1. **The editor and Fabric.js.** You chose Fabric.js. What I built is custom: drag, zoom, text and clamping written directly, with no Fabric. It works and is tested, and I could not install or test Fabric here. *Confirm:* keep the custom editor for the MVP and adopt Fabric if you need rotation, multi-layer or cropping handles later — or switch now.
2. **Platform fee percentage.**
3. **Who bears Paystack's processing fee** — Presswise or the printer.
4. **Neon region** — check the list before creating the project.
5. **One company per person** in the MVP — acceptable?
6. **Storefront rendering vs. SEO.** SEO needs static pages; today the layout reads who is signed in, which makes pages dynamic. Fix: make the navbar's account part client-side. *Confirm* this is the plan.
7. **One product per order** (no cart) for the MVP — confirm.
8. **Mug/drinkware** was a "coming soon" tile in the prototype and has no artwork — dropped for now.
9. **Legal documents** and **domain/name availability** for "Presswise".
10. **Delivery fees** (₦2,500 standard, ₦5,000 express) and estimates are placeholders each printer overrides.
11. **HEIC photos** from iPhones: convert in the browser, or accept only PNG/JPEG/WebP for now?
12. **Rate limiter:** move to Upstash before launch (the in-memory one resets on restart and isn't shared between servers).

---

## Appendix A — Project layout

```
presswise/
  app/             pages and server actions (storefront, dashboard, auth, onboarding)
  components/      customer/, printer/, ui/
  lib/domain/      pricing, orders, validation, design geometry, brand colours, team rules (no framework)
  lib/services/    orders, fulfilment, catalog, shop, team, account
  lib/data/        Repo interface · Postgres (Neon) · in-memory · seed
  lib/db/          Drizzle schemas and the Neon pool
  lib/auth/        AuthService interface · Better Auth · in-memory · viewer · guest-order tokens
  lib/payments/    Paystack · simulated
  lib/email/       Resend · templates · dev outbox
  lib/storage/     R2 · inline
  lib/preview3d/   the WebGL renderer
  tests/           domain, services, data (contract), ui (real pages in Chromium)
  docs/            notes and next steps
```

## Appendix B — Everyday commands

```
npm run dev          demo mode, no accounts or keys needed
npm test             unit, service and data-contract tests
npm run test:ui      the browser suite
npm run test:db      the contract suite against Neon (set TEST_DATABASE_URL to a throw-away branch)
npm run auth:schema  regenerate Better Auth's tables
npm run db:generate  create a migration from the schema
npm run db:migrate   apply migrations (uses the unpooled URL)
```
