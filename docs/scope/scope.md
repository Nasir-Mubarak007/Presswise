# Scope: Presswise

A print on demand platform for print shops and their customers. Customers upload a photo, customize it on a real product, preview it in 3D, order it, and track it. Printers see a clear order queue with the design and specs attached, and get paid directly through a commission split on each order.

**Build approach:** Tracer Bullet (each slice works end to end through every layer so the whole pipe is proven early; real from slice one, just narrow in breadth).
**Workflow:** GA (verify, then test, then a fresh model review, then document after each build). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, skippable when you already know the build. Any feature can carry its own tag to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | planned |
| 4 | Design system & UI foundation | Foundation | planned |
| 5 | Customer & printer accounts | Slice 1 | planned |
| 6 | Photo upload & product customization | Slice 1 | planned |
| 7 | Checkout, payment & printer payout | Slice 1 | planned |
| 8 | Printer order queue with design & specs | Slice 1 | planned |
| 9 | Order tracking | Slice 1 | planned |
| 10 | 3D product preview | Slice 2 | planned |
| 11 | Richer customization & product catalog | Slice 3 | planned |
| 12 | Order status & email notifications | Slice 4 | planned |
| 13 | Platform admin panel | Slice 5 | planned |
| 14 | SEO, internationalization & analytics | Slice 6 | planned |
| 15 | Printer directory and dashboard | Slice 1 follow on | in-progress |
| 16 | Storefront branding settings | Slice 1 follow on | planned |

## Foundations

### 1. Stack & architecture · in-progress

Decide the stack and scaffold a runnable project so every later slice builds on real structure.

**Done when:** the stack is recorded in a spec and the empty scaffold boots locally and passes build.

- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [ ] Smoke-check it runs: `/test`
Spec [0001](../specs/0001-stack-architecture/index.md) · code in `app/`, `lib/`, `components/`

### 2. Coding standards & tooling · planned

Capture conventions from the real scaffolded project, then install lint, format, and pre-commit enforcement.

**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and pre-commit run clean.

- [ ] Capture conventions and tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

### 3. Data model · needs a decision · planned

Core entities every feature builds on: users, printer shops, products, designs, orders, order items, payments, and payouts.

**Done when:** entities and relationships support later slices (3D preview, tracking, admin) without a breaking migration.

- [ ] Design it (spec): `/architect data model`

### 4. Design system & UI foundation · needs a decision · planned

Visual language, layout primitives, and base components so the flows feel cohesive and accessible.

**Done when:** `design.md` covers type, color, spacing, and components, and base components handle focus and keyboard.

- [ ] Design it (spec): `/architect design system & UI foundation`

## Slice 1: Core order loop (walking skeleton)

### 5. Customer & printer accounts · in-progress

Sign up and sign in for both sides. Each printer is its own tenant with a shop profile.

**Done when:** a customer and a printer can each sign in and see their own role's home.

- [x] Design it (spec): [0003](../specs/0003-customer-printer-accounts.md)
- [ ] Build it: /develop customer & printer accounts
- [ ] Verify it: /check verify customer & printer accounts
- [ ] Test it: /test customer & printer accounts

### 6. Photo upload & product customization · needs a decision · planned

A customer uploads a photo and places it on one product type, saving the design file.

**Done when:** a customer can upload a photo, position it on a product, and save a design.

- [ ] Design it (spec): `/architect photo upload & product customization`

### 7. Checkout, payment & printer payout · needs a decision · GA · planned

A customer places an order and pays. Funds split with a commission to the platform and the rest to the printer.

**Done when:** an order can be created and paid, with a payout record to the printer.

- [ ] Design it (spec): `/architect checkout, payment & printer payout`

### 8. Printer order queue with design & specs · needs a decision · planned

A printer sees a clear queue of orders with the design file and the order specs attached.

**Done when:** a printer opens the queue and sees each order with its design and specs.

- [ ] Design it (spec): `/architect printer order queue with design & specs`

### 9. Order tracking · planned

A customer and a printer can see an order's current status.

**Done when:** an order moves through statuses and both sides see the current status.

- [ ] Build it: `/develop order tracking`

## Slice 2: 3D preview

### 10. 3D product preview · needs a decision · planned

A customer previews the customized product in 3D before ordering.

**Done when:** a customer can rotate and zoom a 3D view of their customized product before placing an order.

- [ ] Design it (spec): `/architect 3D product preview`

## Slice 3: Richer customization & product catalog

### 11. Richer customization & product catalog · needs a decision · planned

Add text, change colors, and choose from multiple product types beyond the first one.

**Done when:** a customer can add text, change colors, and pick from several product types.

- [ ] Design it (spec): `/architect richer customization & product catalog`

## Slice 4: Order status & email notifications

### 12. Order status & email notifications · needs a decision · planned

Status transitions plus email updates to both sides (order confirmed, in production, shipped).

**Done when:** a status change sends an email and updates the tracking view for both sides.

- [ ] Design it (spec): `/architect order status & email notifications`

## Slice 5: Platform admin panel

### 13. Platform admin panel · needs a decision · planned

Platform level oversight over printers, orders, and payouts.

**Done when:** an admin can view all printers, all orders, and all payouts in one place.

- [ ] Design it (spec): `/architect platform admin panel`

## Slice 6: SEO, internationalization & analytics

### 14. SEO, internationalization & analytics · needs a decision · planned

Public marketing pages with metadata, multiple languages, and product analytics with error monitoring.

**Done when:** public pages render with metadata and social cards, the UI supports more than one language, and key order events are tracked.

- [ ] Design it (spec): `/architect SEO, internationalization & analytics`

## Slice 1 follow on: Printer directory and dashboard

### 15. Printer directory and dashboard · in-progress

Build the real printer directory, public shop pages, and private printer operations dashboard alongside the in memory demo.

**Done when:** an owner can publish a shop with real product photos, customers can discover and browse it, and shop members can manage orders within their roles without changing `/storefront`.

- [x] Design it (spec): [0005 printer interface](../specs/0005-printer-interface-and-data-model/index.md) · [catalog and public shop pages](../specs/0005-printer-interface-and-data-model/0005-catalog-and-public-shop-pages.md)
- [~] Build it: /develop printer interface · code in `app/sign-in`, `app/sign-up`, `app/auth/actions.ts`, `app/printer*`, `app/printers`, `app/shops/[slug]`, `components/printer-dashboard-shell.tsx`, `lib/auth/redirects.ts`, `lib/printer-dashboard.ts`, `lib/services/printer-service.ts`, `lib/printer-gate.ts`, `lib/db/schema.ts`
  - [x] Build directory search and cards, dashboard navigation and overview, order actions, customer tracking, and payout views (AC-4, AC-8, AC-9, AC-10, AC-13).
  - [x] Build owner account sign up and private shop onboarding with safe dashboard redirects (AC-3, AC-17).
  - [ ] Build catalog schema, editing, pricing, photo uploads, processing, and safe product actions (AC-1, AC-2, AC-6, AC-7, AC-17, AC-18; AC-CAT-1 through AC-CAT-15; AC-CAT-20 through AC-CAT-22).
  - [ ] Complete public product pages, shop publication, delivery settings, production routing, team invitations, and role management (AC-5, AC-11, AC-12, AC-13, AC-16, AC-17, AC-19; AC-CAT-13, AC-CAT-16 through AC-CAT-19, AC-CAT-23).
  - [ ] Verify migrations, Paystack refund confirmation, audit retention, deployment configuration, and end to end behavior before enabling the feature in production (AC-1 through AC-19; AC-CAT-22, AC-CAT-23).
- [ ] Verify it: /check verify printer interface
- [ ] Test it: /test printer interface
- [ ] Review it (fresh model): /check review printer interface
- [ ] Document it: /document printer interface
Spec [0005](../specs/0005-printer-interface-and-data-model/index.md) · code in `app/sign-in`, `app/sign-up`, `app/printer*`, `app/shops/[slug]`, `lib/auth/redirects.ts`, `lib/printer-dashboard.ts`, `lib/services/printer-service.ts`, `lib/printer-gate.ts`, `lib/db/schema.ts`

### 16. Storefront branding settings · planned · from spec 0005

Let shop owners and managers edit the public shop description, logo, and banner.

**Done when:** an authorized shop member can update branding, and the published shop shows the current description and images with accessible text.

- [ ] Build it: /develop printer storefront branding settings
Spec [0005 catalog pages](../specs/0005-printer-interface-and-data-model/0005-catalog-and-public-shop-pages.md)

## Deferred

Out of scope for the current build pass, kept so the plan stays honest.

- **Saved designs & reorder**: a customer can save a design and reorder it · needs a decision
- **Bulk orders**: order many customized units at once · needs a decision
- **Advanced payout scheduling**: scheduled payouts to printers instead of per order · needs a decision · GA

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` plus 2 to 5 milestones; the tier's closing boxes (`Verify it` Alpha plus, `Test it` Beta plus, `Review it` plus `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` plus milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.

## References

### Project sources

- `skills-lock.json` — the locked skill set for this project (scope, architect, develop, check, test, document, sync)
- `.agents/skills/scope/` — the scope skill rules, templates, and approach personas used to write this plan

### Practices & standards

- foundations before structures (working skeleton before features)
- data model is the costliest thing to redo
- vertical slices ship real value early

### Links (web verified)

- Web Content Accessibility Guidelines (WCAG), W3C Web Accessibility Initiative — https://www.w3.org/WAI/standards-guidelines/wcag/
- General Data Protection Regulation (GDPR), Regulation (EU) 2016/679, EUR-Lex — https://eur-lex.europa.eu/legal-content/EN/TXT?uri=celex%3A32016R0679
- PCI Data Security Standard (PCI DSS), PCI Security Standards Council — https://www.pcisecuritystandards.org/standards/pci-dss
