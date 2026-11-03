# 0004. Shared data model

**Date**: 2026-10-29
**Status**: Superseded by [0005](0005-printer-interface-and-data-model/index.md)

## Summary

This decision finishes the Presswise database model so every later slice (photo upload, checkout, payouts, tracking, admin) builds on one complete set of tables. It merges the parts of roadmap v2 and spec 0003 that were in conflict: customers are recorded per shop, artwork lives in a designs table plus a frozen copy on each order item, checkout stays signed in only, and money is stored in kobo (Nigerian kobo, one hundredth of a Naira) as big integers. One migration lands now, together with role resolver updates and data contract tests.

## Context

Data model ownership partly exists today in `lib/db/schema.ts`: Better Auth tables (user, session, account, verification, rate limit), the organization plugin tables, and the first application tables (printer_shops, shop_memberships, customer_profiles, audit_events). Scope feature 3 planned the rest of the model, and two written sources describe it differently:

- Roadmap v2 section 5 records a built model: tenants with settings and a per shop order counter, per shop customer rows, catalog products and variants with bulk tiers, orders with guest checkout and payment references, order items holding a frozen design snapshot with deliberately no foreign key to the catalog.
- Spec 0003 (accepted later, and what the current code targets) sketches a shared identity model where one user holds many roles through a user_roles table, has one global customer profile, saves designs as separate rows, and can only check out signed in.

The gap blocks slice 1 work: photo upload needs designs, checkout needs orders, items, and payments, payouts need their record shape, and admin oversight needs roles. Rebuilding the model later is the costliest kind of rework (basis: scope reference, "data model is the costliest thing to redo"), so the model must be finished now in one coherent shape.

Compliance scope touched: this model holds personal data (names, phones, addresses, uploads) under Nigeria's NDPA 2023 and money records under Paystack settlement. It changes no UI.

## Requirements

**User stories**:
- As a developer, I want one agreed data model in code so every feature slice builds on it without a breaking migration later.
- As a printer, I want order details and prices frozen at purchase time so catalog and settings edits never change what a paid order says.
- As a platform operator, I want platform admin recorded explicitly so the grant is auditable and revocable.
- As a data caretaker, I want account deletion to fail loudly while orders exist so history is never silently destroyed before an anonymization path is designed.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: `lib/db/schema.ts` defines every confirmed entity below with the stated keys, foreign keys, unique constraints, and indexes; shops carry their settings fields (organization link, suspension reason, brand color, theme, tagline, VAT on or off, delivery fee config, Paystack subaccount, per shop order counter).
- **AC-2**: `drizzle-kit generate` produces one migration that applies cleanly to a fresh Neon database using the unpooled connection string, with no manual SQL fixes.
- **AC-3**: All money columns are bigint kobo; order items store the frozen snapshot (product name, variant material and finish, color, size, quantity, unit price, line total, design JSON) so a later catalog edit never changes a placed order's display or charge.
- **AC-4**: Two concurrent order creations for one shop can never receive the same order number; the counter is read and incremented inside the order creating transaction under a shop row lock.
- **AC-5**: A signed in user can save a design (draft, saved, submitted, archived states exist in data) belonging only to them, and an order item can reference a design while still carrying its own frozen copy.
- **AC-6**: The role resolver resolves customer, printer owner, printer staff, and platform admin from shop memberships, the customer profile, and the explicit `user_roles` table; a platform admin grant or revoke writes an audit event with actor, target, and request id.
- **AC-7**: Data contract tests prove the constraints: uniqueness (shop plus user customer row, user plus role, shop plus product slug, shop plus order number, payment reference), bigint money columns, and that deleting a user with orders is rejected by the database.

## Options considered

### Option 1: Adopt roadmap v2 as written

Per shop customer rows, bulk tiers on variants, guest checkout with order number plus email lookup, design frozen only into order items with no catalog foreign key, tenants carrying org linkage, branding, VAT, delivery fees, Paystack subaccount, and the order counter.

**Pros**:
- Matches a model that was actually built and tested in the prior codebase; field inventory is proven.
- Guest checkout and no FK to the catalog are already thought through for these exact rules.

**Cons**:
- Contradicts spec 0003 (the accepted decision governing the running code) on identity, checkout gating, and design storage.
- Guest checkout expands slice 1 scope; spec 0003 deliberately deferred it.
- No designs table forces the designer work into JSON on orders only, weakening draft and saved design support (notes: saved designs and reorder are deferred, but photo upload slice 1 needs the design row).

### Option 2: Adopt spec 0003 as written

Global customer profile, separate designs and designs referenced by order items, user_roles table, signed in only checkout, and its own fuller status vocabulary.

**Pros**:
- Matches the shipped schema and the role resolver as they run today; least code churn.
- Designs table supports the editor flow from day one.

**Cons**:
- Loses order number generation, per shop customer records, shop settings (VAT, delivery fees, Paystack subaccount, branding), payment records, payouts, and status history that later slices require, so breaking migrations would follow (basis: scope feature 3, done when "without a breaking migration").
- Its status and API surface wording (awaiting auth, submitted, completed) conflicts with the tracking UI vocabulary that the demo and tracking screens already show.

### Option 3: Merge deliberately (chosen)

Keep the dual source tension resolved per question: per shop customer rows join the global profile; designs table plus frozen snapshots on order items; signed in only checkout with no guest fields; shop settings, order counter, payments records, payouts records, and status history all land now; statuses follow spec 0003's vocabulary.

**Cons** (the cost the merge consciously accepts):
- Slightly more tables than either source alone (shop_customers, user_roles, addresses).
- Two roles sources (derived from memberships, explicit in user_roles) need a stated sync rule.

## Decision

**Chosen option**: Option 3: Merge deliberately.

The finished model keeps the shipped identity tables (spec 0003) and adopts the commerce inventory roadmap v2 proven, with the three conflicts resolved as decided: customers per shop on top of the global profile, designs table plus frozen item snapshots, signed in checkout only with no guest columns.

**Implementation skills**: `drizzle-orm-patterns` (`oakoss/agent-skills`, `.agents/skills/drizzle-orm-patterns/`) · `organization-best-practices` (`better-auth/skills`, `.agents/skills/organization-best-practices/`, advisory only, the plugin tables already exist)

## Rationale

The code already embodies spec 0003's identity model, and spec 0003 is newer, so identity stays as built. Roadmap v2's commerce inventory (shop settings, tiers, frozen snapshots, per shop customers, payment and history records) is field level knowledge from a working build, which is the stronger provenance for column shapes. The merge closes both gaps without reopening either decision. Statuses keep spec 0003's names because the web reader of those statuses is spec 0003's API surface; display wording is the tracking feature's choice, not the schema's. Bulk tiers sit on the variant as a quantity range table (jsonb keyed list), and the unit price for a line comes from the tier whose quantity range covers that line, with a computed per unit fallback when no tier matches; that rule is the pricing slice's contract regardless. Guest checkout appears nowhere: accepting the no hedge answer means later guest support is a real migration, which the engineer chose to own (basis: your answer, signed in only, no hedge; simplest model first, nullable columns only when they carry meaning).

## Feature design

**Data model sketch** (all tables Postgres, timestamps with time zone; enums stored as text columns with TypeScript union types, matching the existing schema style):

- Existing, unchanged: `user`, `session`, `account`, `verification`, `rate_limit`, `organization`, `member`, `invitation`, `audit_events`.
- `user_roles` (new): `id` uuid PK; `user_id` uuid FK to `user.id`, required; `role` text in (`customer`, `printer_owner`, `printer_staff`, `platform_admin`), required; `created_at`, `updated_at`. Unique (`user_id`, `role`). The sync rule: `shop-service` writes the printer_owner and printer_staff rows in the same transaction as membership create and remove, so the explicit record and the derived flags never disagree; `platform_admin` rows are authoritative for admins only and change only through the credential change flow, always audited. The role resolver keeps deriving flags from memberships and profiles, and treats this table as the explicit record.
- `printer_shops` (extend): add `organization_id` uuid FK to `organization.id`, nullable, unique; add `suspension_reason` text nullable; `brand_color` text; `theme` text nullable; `tagline` text nullable; `vat_enabled` boolean not null default false; `delivery_config` jsonb (pickup, standard, express: fee kobo and estimate strings); `paystack_subaccount_code` text nullable; `order_seq` integer not null default 0. Existing `owner_user_id` (FK to `user.id`, restricted so a shop with financial history is never hard deleted until the anonymization path ships), `name`, `slug`, `status` stay (status stays draft|active|suspended).
- `shop_memberships`: unchanged.
- `shop_customers` (new): `id` uuid PK; `shop_id` uuid FK to `printer_shops.id`, required; `user_id` uuid FK to `user.id`, required; `created_at`, `updated_at`. Unique (`shop_id`, `user_id`). Deleting the user is restricted while orders reference the row.
- `customer_profiles`: keeps `full_name`, `phone`, `preferred_currency` default NGN, and `default_address_id`; `default_address_id` becomes FK to `addresses.id` set null on delete.
- `addresses` (new): `id` uuid PK; `user_id` uuid FK to `user.id`, required; `label` text nullable; `line1` text, `line2` text nullable, `city` text, `state` text, `phone` text; `created_at`, `updated_at`. Cascade on user delete.
- `products` (new): `id` uuid PK; `shop_id` uuid FK to `printer_shops.id`, required, cascade on shop delete; `slug` text required; `name`, `category` (caps, apparel, bags), `artwork_kind` text, `base_price_kobo` bigint; `sizes` text array, `colors` text array; `active` boolean default true; `mockup_url` text nullable; `created_at`, `updated_at`. Unique (`shop_id`, `slug`). Index on (`shop_id`) filtered to `active` for storefront browse.
- `product_variants` (new): `id` uuid PK; `product_id` uuid FK to `products.id`, required, cascade on product delete; `material` text not null (a missing material is stored as the explicit value `standard`, never NULL, so the unique constraint holds); `finish` text not null, `price_addon_kobo` bigint not null default 0; `minimum_quantity` integer not null default 1; `bulk_tiers` jsonb (list of `{ minQty, unitPriceKobo }` ranges); `created_at`, `updated_at`. Unique (`product_id`, `material`, `finish`).
- `designs` (new): `id` uuid PK; `user_id` uuid FK to `user.id`, restricted; `product_id` uuid FK to `products.id`, restricted; `status` text in (`draft`, `saved`, `submitted`, `archived`) default draft; `front_artwork_json` jsonb, `back_artwork_json` jsonb (both nullable while drafting); `created_at`, `updated_at`. Index (`user_id`, `updated_at`).
- `orders` (new): `id` uuid PK; `shop_id` uuid FK to `printer_shops.id`, restricted; `customer_id` uuid FK to `shop_customers.id`, restricted; `customer_user_id` uuid FK to `user.id`, restricted, required (no guest columns by decision); `order_number` integer required; `status` text in (`awaiting_auth`, `submitted`, `paid`, `in_production`, `shipped`, `completed`, `cancelled`, `refunded`) default `awaiting_auth`; `payment_status` text in (`pending`, `paid`, `failed`, `refunded`) default `pending`; `delivery_method` text in (`pickup`, `standard`, `express`), required at creation; `subtotal_kobo`, `delivery_kobo`, `vat_kobo`, `total_kobo` all bigint; `currency` text not null default `NGN`; `contact_name`, `contact_phone`, `contact_email`, `address_line1`, `address_line2` (nullable), `city`, `state`; `carrier` text nullable, `tracking_number` text nullable, `decline_reason` text nullable; `created_at`, `updated_at`. Unique (`shop_id`, `order_number`). Indexes (`shop_id`, `status`), (`customer_user_id`, `created_at` descending). Contact and address columns are verbatim copies of the checkout form; `customer_profiles` and `addresses` only prefill, never feed a placed order.
- `order_items` (new): `id` uuid PK; `order_id` uuid FK to `orders.id`, cascade; `design_id` uuid FK to `designs.id`, nullable, set null; snapshot fields: `product_id` uuid FK to `products.id`, restricted; `variant_id` uuid FK to `product_variants.id`, restricted; `product_name` text, `variant_label` text (material and finish), `color` text, `size` text, `quantity` integer, `unit_price_kobo` bigint, `line_total_kobo` bigint, `design_snapshot` jsonb; `created_at`. Foreign keys remain (integrity), cascades never touch the order from catalog edits (products cannot be hard deleted while restricted FKs exist; deactivate instead).
- `order_status_history` (new): `id` uuid PK; `order_id` uuid FK to `orders.id`, cascade; `status` text, `note` text nullable; `actor_user_id` uuid FK to `user.id`, nullable (system transitions); `created_at`. Index (`order_id`, `created_at`).
- `payments` (new): `id` uuid PK; `order_id` uuid FK to `orders.id`, restricted; `reference` text unique (Paystack reference); `provider` text default `paystack`; `channel` text nullable; `amount_kobo` bigint (always equal to `orders.total_kobo`, the charge the order demands; who bears the Paystack processing fee and split metadata are records elsewhere, never a reason to charge a different amount); `provider_status` text in (`attempted`, `active`, `succeeded`, `failed`), mirroring Paystack's vocabulary; `verified` boolean default false; `idempotency_key` text nullable, unique; `created_at`, `updated_at`. Index (`order_id`).
- `payouts` (new): `id` uuid PK; `order_id` uuid FK to `orders.id`, restricted, unique (one settlement per order, valid for v1 because refunds are full refunds only pending the checkout slice decision); `shop_id` uuid FK to `printer_shops.id`, restricted; `gross_kobo`, `platform_fee_kobo`, `net_kobo` bigint; `status` text in (`pending`, `settled`, `failed`) default `pending`; `paystack_settlement_reference` text nullable; `paid_at` timestamp nullable; `created_at`, `updated_at`. Only the record shape is finished now; settlement logic and the fee percentage decision belong to the checkout slice.

**State transitions**:
- `designs`: draft → saved → submitted → archived
- `orders`: awaiting_auth → submitted → paid → in_production → shipped → completed; cancelled or refunded move from any active state with `decline_reason` where the printer declines (spec 0003's transitions, unchanged)
- `payments`: attempted → succeeded | failed, with `active` covering the Paystack in between state (reference created, awaiting payment); verified flips to true only after the server compares the Paystack amount to the order total
- `payouts`: pending → settled | failed (full refunds only in v1; a refund writes `orders.status` refunded and `orders.payment_status`, plus `payments.provider_status`, atomically in the verified server path)
- `user_roles`: granted once (platform admin) or maintained by the membership transaction (printer roles); revoke writes an audit event

**API surface** (this feature ships services and the resolver, not routes; routes belong to their feature specs):

| Surface | Kind | Key inputs | Key outputs | Comes from |
|---|---|---|---|---|
| Schema tables and migration | data | none | migration files | this spec |
| Role resolution | service | userId, headers | RoleContext | this spec |
| Shop create and membership | service | name, slug, owner | shopId | spec 0003, extended with organization link and settings |
| Catalog CRUD | service | shop scoped product and variant data | row ids | catalog slice spec |
| Design save | service | userId, product, artwork JSON | designId | photo upload slice spec |
| Checkout submit, payment confirm, webhook | route handlers | cart design, contact, address, Paystack events | orderId, payment reference | checkout slice spec |
| Order tracking reads | service | order id, permissions | status, history | tracking slice spec |

**Value sourcing** (every produced value names its source):

| Action | Value produced | Source |
|---|---|---|
| Order creation | order number | `printer_shops.order_seq` incremented under a shop row lock inside the creating transaction |
| Order creation | unit price | `product_variants.bulk_tiers` range covering the line quantity, else base price plus addon, computed server side; tiers are service validated as sorted, disjoint ranges of integer kobo before any price is derived |
| Order creation | subtotal, delivery, VAT, total | server arithmetic over order item lines plus `printer_shops.delivery_config` and `vat_enabled`; VAT is charged on the item subtotal only at 7.5 percent, half up to the whole kobo (basis: AGENTS.md money rules) |
| Order creation | contact and address columns | verbatim from the checkout form input (profiles and addresses are prefill, never the source of truth on a placed order) |
| Order creation | `shop_customers` row | created on the customer's first order of that shop, inside the same order transaction |
| Order item snapshot | product name, variant label, color, size, design JSON | copied from the input design and catalog rows into `order_items` columns at creation |
| Checkout | payment reference, channel, provider status | Paystack initialization response stored on `payments` |
| Payment confirmation | paid state | server verification comparing `payments.amount_kobo` with `orders.total_kobo`, then `orders.payment_status` and status update, idempotent |
| Webhook transitions | history and audit actor, request id | actor null (system), `audit_events.details_json` tagged `source: webhook`, request id is the Paystack event id |
| Payout record | gross, platform fee, net | Paystack split of total once `PLATFORM_FEE_PERCENT` decision lands (checkout spec) |
| Role flags | customer, printer owner and staff, platform admin | `shop_memberships`, `customer_profiles`, `user_roles` |
| Audit trail | actor, action, target, request id | session user, mutation path, mutated row, structured logger request id |

**Key invariants**:
- Money is bigint kobo columns everywhere (Drizzle `bigint` in number mode, safe below the 2^53 kobo float limit, so common JS arithmetic stays exact); no floats (basis: AGENTS.md, roadmap v2 section 1).
- Totals are always recomputed server side from catalog and settings, then frozen on the order; a previously displayed total is never trusted.
- Catalog edits never change placed orders; the snapshot columns are the display and charge source of truth.
- Every order related, payment, payout, role, and shop status mutation writes an `audit_events` row (spec 0003 AC-6).
- A user deletion is blocked at the database while order or shop financial history references their rows (orders, shop_customers, designs, payouts all restrict through the chain); an anonymization path is designed before account deletion ships. Nothing with money history is ever hard deleted by a cascade accident.
- A payment's `amount_kobo` always equals its order's `total_kobo`; the Paystack processing fee and its bearer are records on the payment and payout rows, never a different charge.
- Refunds are full refunds only until the checkout slice decides otherwise; one settled payout per order holds.
- Orders left in `awaiting_auth` are not cleaned up before launch; retention for abandoned unpaid orders is decided at launch time.
- Role branch: the resolver's derived flags stay the request time authority; `user_roles` records what the resolver must agree with, and tests treat disagreement as failure.

**Security model**:
- Public reads: surfacing catalog and shops separately for each printer remains shop scoped behind the signed user context (primary guard: shop scoping from the session, never from the request).
- Customer data: a person can act across shops, but each shop still only ever sees orders addressed to it (spec 0003 AC-3).
- Platform admin: grant exists once, audited, changed only through the credential change flow in the admin dashboard.
- Personal data lockup (names, phones, addresses, artwork) sits behind session auth; money rows are never written by client submitted totals.

**Configuration required**:
- None new for this feature. The checkout slice will require `PAYSTACK_SECRET_KEY`, `PLATFORM_FEE_PERCENT`, and `PAYSTACK_FEE_BEARER` (fee percentage still undecided, so payments refuse to start money movement until configured, per roadmap v2 section 7).

**Critical test scenarios** (each maps to an AC):
- Happy path: apply the migration to a fresh database, then insert a shop with settings, product and variant, design, customer row, order and item snapshot, payment, payout, and history rows, verifies **AC-1** and **AC-2**.
- Money: store totals around one trillion kobo (10^12) and read them back exactly, proves the bigint number mode holds, verifies **AC-3**.
- Snapshot survival: edit a product's name, price, and tiers after order creation and confirm the order item still shows and reprices to the frozen values, verifies **AC-3**.
- Concurrency: create two orders for one shop in parallel transactions (this contract test runs against the real database on the unpooled Neon URL, since a pooled proxy can fake serialization), verifies **AC-4**.
- Identity: grant a platform admin role and confirm the audit event; revoke and confirm; confirm resolver flags agree with table rows, verifies **AC-6**.
- Protection: attempt to delete a user. It should fail while their orders and payout exist, verifies **AC-7**.

## Migration plan

**Strategy**: no migration needed (additive only, no live data).
**Phases**:
1. Extend `lib/db/schema.ts` with all new tables and shop settings columns.
2. Generate one drizzle-kit migration and apply it with the unpooled Neon URL; verify on a fresh branch database first.
**Rollback**: revert the commit and generate a down migration; with zero production data no backfill exists.
**Risks**: none on live data; the only risk is a constraint naming mismatch with the existing migration journal, caught by the apply step.

## Build plan

Applied through Tracer Bullet: start with the full model since the whole point is the foundation, then tests prove behavior end to end against the real migration (the thin thread here is the schema plus the resolver, the parts every later slice touches).

1. Extend `lib/db/schema.ts` with `user_roles`, `shop_customers`, `addresses`, `products`, `product_variants`, `designs`, `orders`, `order_items`, `order_status_history`, `payments`, `payouts`, and the `printer_shops` settings columns with all constraints and indexes, satisfies **AC-1**
2. Generate and apply the migration (drizzle-kit generate, then apply with the unpooled URL), satisfies **AC-2**
3. Update `lib/auth/role-resolver.ts` to read `user_roles` alongside memberships and profiles, and update `lib/services/shop-service.ts` to link the organization row and default settings at shop creation, satisfies **AC-6**, **AC-1**
4. Write the audit hook for role grant and revoke paths, satisfies **AC-6**
6. Add data contract Vitest suites for uniqueness, bigint money, order number concurrency, tier validation, snapshot survival, and FK restriction, satisfies **AC-3**, **AC-4**, **AC-6**, **AC-7**

## Consequences

**Positive**:
- Every Slice 1 feature (upload, checkout, payout, queue, tracking) starts from a complete schema; no breaking migrations before launch.
- Order history is protected from catalog drift by the frozen snapshot, and from user deletion by restricted foreign keys.
- Role truth moves into the database, auditable, and matches the permission matrix work spec 0003 asked for.

**Negative / tradeoffs**:
- Per shop customer rows add a join and a growth lever that the global profile alone would not have; they are required by the chosen answer, not by the code today.
- Two roles sources (derived and explicit) must be kept in agreement by tests forever, an ongoing discipline cost.
- `payouts` and `payments` rows sit unused until the checkout slice lands; schema before logic deliberately.
- Deciding no guest columns means guest checkout later costs a real migration, owned deliberately.

**Neutral**:
- Order number display format stays unset; the schema stores the integer and the display string is derived at render (follow up).
- The status vocabulary keeps spec 0003 names; the customer facing words ("received", "rejected" versus "submitted", "cancelled") stay a tracking feature decision.
- Enum values live in one exported TypeScript union per table pair (`orders.status` shared with `order_status_history.status`, `payments.provider_status`, `payouts.status`) and rely on TypeScript unions plus service validation, not database enums; acceptable while the codebase is the only writer. New JSON columns use Drizzle's `jsonb` type (the existing `audit_events.details_json` stays as it is).

## Follow-up

- [ ] Decide the order number display format (shop code plus padded counter versus plain integer) before the checkout slice routes orders in emails.
- [ ] Design the account deletion anonymization path (NDPA 2023) before any delete user feature ships.
- [ ] Decide `PLATFORM_FEE_PERCENT` and who bears Paystack's processing fee before the checkout slice, and record it on the payouts record at payment time.
- [ ] Add the row level security second layer for tenant isolation (spec 0001 follow up carries this).
- [ ] Decide retention for orders abandoned in `awaiting_auth` (cleanup job or permanent draft) at launch time.
- [ ] Update spec 0003's data model sketch pointer so it defers to this spec where they disagree (guest checkout, designs, per shop customers), or fold wording in at the next spec revision.
- [ ] `drizzle-orm-patterns` conventions not yet referenced in the root `AGENTS.md`; add the pointer there (codebase wide persistence rules).

## References

**Project sources** (verifiable, in this repo):
- `presswise-roadmap.md` v2 sections 1, 5, and 7: field inventory (tenants, products, variants, customers, orders, items, history), money rules, Paystack flow
- `docs/specs/0003-customer-printer-accounts.md`: identity model, audit table, status vocabulary
- `docs/specs/0001-stack-architecture/index.md`: stack conventions, bigint kobo money, structured result types
- `lib/db/schema.ts` and `lib/db/migrations/`: the shipped tables this spec extends
- `docs/scope/scope.md` feature 3: this decision's scope row and the "no breaking migration" done condition

**Practices & standards**:
- money as integer minor units, never floats
- frozen order snapshots so reference data edits never alter placed orders
- idempotent payment confirmation with amount verification
- serialized counters (row lock under transaction) for business critical sequence numbers
- restricted foreign keys to preserve audit and financial history
