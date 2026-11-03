# 0005. Printer interface and data model

**Date**: 2026-10-30
**Status**: In Progress

## Structure

* [0005-catalog-and-public-shop-pages.md](./0005-catalog-and-public-shop-pages.md) defines catalog editing, photo processing, and public product details for the printer shop.

## Summary

This spec defines the printer directory, each printer shop storefront, and the private printer dashboard. It replaces the earlier shared data model decision with a complete data and interface contract for those pages. Printer products use real photos, and the dashboard uses the existing Presswise design system with data stored in Neon Postgres.

## Requirements

**User stories**:

* As a customer, I want to find printer shops by location, product category, material, and finish so I can find a printer that can make what I need.
* As a customer, I want to browse a printer's real products and details without leaving the shop's storefront.
* As a printer owner, I want one private dashboard for orders, products, staff, payouts, and shop settings.
* As a printer manager or staff member, I want to see only the shop work and actions my role allows.
* As a printer, I want to publish only accurate shop details and products with real photos.

**Acceptance criteria**:

* **AC-1**: The schema supports the confirmed shared identity, shop, team, catalog, image, customer, order, payment, payout, refund attempt, and audit data with the keys, constraints, and indexes in Feature design.
* **AC-2**: Existing shops and products are migrated without deleting their data. Existing active shops and products become private drafts so the new public pages expose no rows by accident.
* **AC-3**: An owner can create one private shop. The shop can be published only when it has a name, a Nigerian state or FCT, a city, and at least one published priced product variant with a material, a finish, and a real cover photo. A published shop slug cannot be changed.
* **AC-4**: `/printers` shows published shops only, with location, real product photo, a matching material or finish, starting price, and minimum quantity when it is greater than one. Location, category, material, and finish filters combine with AND logic. The directory has 12 shops per page.
* **AC-5**: A public shop page shows the printer brand first and the shop's published catalog. A product detail dialog opens from the catalog. Storefront browsing does not provide checkout. In production, a shop uses its configured subdomain; local development can use `/shops/[slug]`.
* **AC-6**: Product photos are printer supplied PNG, JPEG, or WebP files no larger than 5 MB each. Each product has one required cover photo and no more than five photos. Every photo has alt text and a permanent R2 object key in the database. The uploading owner or manager attests that each photo shows the actual product, not a mockup. Temporary uploads are bound to the authorized shop and product, verified before finalization, and cleaned up if abandoned.
* **AC-7**: The catalog supports Caps, Apparel, Bags, and Other. Products have Draft, Published, and Archived states. Product descriptions, colors, and sizes are optional. Materials and finishes are printer entered free text, trimmed and matched without case sensitivity. Published edits take effect when saved.
* **AC-8**: The private dashboard has Overview, Orders, Catalog, Storefront, Team, Payouts, and Settings pages. Desktop has a collapsible sidebar, expanded by default, with its state remembered in local storage. Mobile has Overview, Orders, Catalog, and More in a bottom bar. The Overview contains the agreed order and payout metrics, not storefront management.
* **AC-9**: The owner and managers see paid orders created today in Africa/Lagos time, ready orders with status `paid`, active orders with status `in_production` or `shipped`, and settled net payouts from the last 30 days. Payouts are labelled net payout, not profit. Staff see only counts for their assigned orders, with no payout metric.
* **AC-10**: Orders are newest first, in status tabs, 25 per page, with a `hasNext` value for pagination. Staff see the order contact and fulfillment details needed for their assigned work, but not unrelated customer profile data. Delivery orders require a tracking number before shipping. Completion is marked manually.
* **AC-11**: Owners manage all shop functions. Managers manage orders, catalog, storefront, analytics, refunds, and staff task assignment. Staff handle only assigned orders and fulfillment. Only owners can publish or unpublish the whole shop. Team, payouts, and Settings are owner only.
* **AC-12**: Owners can invite managers and staff by email. Invitations expire after 48 hours if not accepted, and owners can resend or cancel pending invitations. Owners and managers can assign an order to one staff member. Staff can update only orders assigned to them. A user can belong to only one printer shop.
* **AC-13**: The Payouts page is read only. Settings cover shop details, delivery choices and fees, and the VAT setting. Street addresses are not public. Shop location is Nigerian state or FCT, city, and optional area.
* **AC-14**: Only owners and managers can request a full refund for an order that is paid, not in production, and has no settled payout. The order remains out of production while a refund is pending or failed. A successful refund marks the order refunded and cancels a pending payout. A settled payout blocks printer initiated refunds. Failed refunds can be retried without duplicate provider requests, using an idempotency key. Refund state and reason appear in order tracking. This feature sends no refund email.
* **AC-15**: A pending refund can be checked against Paystack by an owner or manager without creating another refund request. Webhooks remain the normal confirmation path. Only a verified provider result can mark a refund successful or failed.
* **AC-16**: Shop and product drafts and suspended shops are not publicly visible or indexable. Public pages use only published product data and real photos. `/storefront` remains the separate in memory demonstration and is not changed into a production shop.
* **AC-17**: Every printer dashboard read and mutation is scoped by the signed in user's active shop membership and role. Sensitive shop, membership, order, payment, payout, and refund changes are audited.
* **AC-18**: The new printer feature gate is enforced on every public and dashboard page, Server Action, and Route Handler. Paystack webhooks remain available while the gate is off so existing refunds can finish. Disabling the feature does not affect `/storefront`.
* **AC-19**: Only platform admins can suspend or reinstate a shop, with an audit event and a reason for suspension. Owners can unpublish their own published shop, but cannot suspend or reinstate it.

## Decision

**Chosen option**: Option 3: Add the database backed printer experience alongside the in memory demo.

Use the existing Next.js, Neon Postgres, Drizzle ORM, Better Auth, Cloudflare R2, Paystack, and Presswise design system. Build the public directory and shop storefront separately from `/storefront`, and put printer operations behind a role checked dashboard.

**Implementation skills**: `drizzle-orm-patterns` (`oakoss/agent-skills`, `.agents/skills/drizzle-orm-patterns/`) · `organization-best-practices` (`better-auth/skills`, `.agents/skills/organization-best-practices/`) · `nextjs16-skills` (`vercel-labs/agent-skills`, `.agents/skills/nextjs16-skills/`) · `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`)

## Feature design

### Routes and page behavior

| Page | Route | Visibility and behavior |
|---|---|---|
| Printer directory | `/printers` | Public, indexable, published shops only, 12 per page |
| Local shop fallback | `/shops/[slug]` | Public, indexable, published shop only, for local development and deployments without the shop domain |
| Production shop | `https://[slug].[STOREFRONT_BASE_DOMAIN]` | Public, indexable, published shop only |
| Overview | `/printer` | Authenticated shop member, role checked |
| Orders | `/printer/orders` | Authenticated shop member, role and assignment checked |
| Catalog | `/printer/catalog` | Authenticated shop member, owner or manager writes |
| Storefront management | `/printer/storefront` | Authenticated shop member, owner or manager edits; owner publishes |
| Team | `/printer/team` | Owner only |
| Payouts | `/printer/payouts` | Owner only, read only |
| Settings | `/printer/settings` | Owner only |

Use the configured base domain to resolve a shop subdomain. If the host is not a configured shop host, use the normal application routes. The shop route must reject draft and suspended shops before rendering metadata or content. Enforce `PRINTER_EXPERIENCE_ENABLED` in the server side route and mutation boundary, not only in navigation. Keep the Paystack webhook route available while the gate is off so outstanding refunds can be reconciled.

Use the Next.js 16 async request APIs for route parameters, search parameters, and headers. Apply database migrations through the direct, unpooled Neon connection string, and test them on a Neon branch before production.

The directory filters are location, category, material, and finish. A shop must satisfy every selected filter. When category, material, and finish are combined, at least one published product variant must satisfy all selected product filters together. Keyword search is a case insensitive partial match across shop name, tagline, description, city, area, state, published product name, material, and finish. Search results sort by exact shop name match, shop name prefix, then other matches, with shop name and ID as stable tie breaks. Unfiltered results sort by shop name. Each directory card shows the shop name, location, a real product photo, the matching material or finish, starting unit price, and minimum quantity when greater than one.

The shop storefront leads with the printer's brand, then its published products. Product details open in a dialog. Capabilities come from the materials and finishes on published variants, not from separately maintained shop tags. Product photos and cover selection come from `product_images`. No storefront action creates a cart or order.

The dashboard uses a collapsible desktop sidebar with its state in local storage. It opens expanded by default. On mobile, the bottom bar contains Overview, Orders, Catalog, and More. More contains Storefront, Team, Payouts, and Settings, subject to role access. The overview keeps analytics and work status prominent; editing the storefront belongs on its own page.

### Data model

All monetary values are integer kobo stored as Postgres bigint. Use text columns with exported TypeScript unions for status values, matching the existing schema style. Every shop owned row includes `shop_id` and queries filter by the authorized shop.

* Existing Better Auth tables remain the identity source: `user`, `session`, `account`, `verification`, `organization`, `member`, and `invitation`. Their existing keys and session behavior do not change.
* `user_roles`: `id` UUID primary key, `user_id` required FK to `user.id`, role text in `customer`, `printer_owner`, `printer_staff`, or `platform_admin`, and timestamps. Unique (`user_id`, `role`). Owners map to `printer_owner`; managers and staff map to `printer_staff`. Printer role changes are synchronized with shop membership in the same service transaction. Platform admin changes remain separately audited.
* `printer_shops`: `id` UUID primary key, required unique `organization_id` FK after backfill, unique `owner_user_id` FK, name, optional description, globally unique slug, status, optional suspension reason, brand color, optional theme and tagline, logo and banner object keys, required state from Nigeria's 36 states or the FCT, city, optional area, VAT enabled flag defaulting to false, delivery configuration, optional Paystack subaccount code, order sequence defaulting to zero, and timestamps. Validate state against a fixed list; city and area are printer entered text. `delivery_config` stores pickup, standard, and express availability, fee in kobo, and estimate text. Status is `draft`, `published`, or `suspended`. Enforce one shop per owner and preserve shop rows that have financial history.
* `shop_memberships`: `id` UUID primary key, `shop_id` FK, `user_id` FK, role (`owner`, `manager`, or `staff`), status (`active` or `removed`), and timestamps. Enforce unique (`shop_id`, `user_id`), one active membership per user with a partial unique index, and one active owner per shop. Better Auth `invitation` rows represent pending and expired invitations; accepted organization membership is synchronized to this table. Better Auth organization roles map owner to owner, manager to admin, and staff to member. This table is the printer authorization source.
* `customer_profiles`: one row per user, with full name, phone, preferred currency defaulting to `NGN`, optional default address FK set to null when the address is removed, and timestamps.
* `addresses`: `id` UUID primary key, user FK, optional label, required first address line, optional second line, city, state, phone, and timestamps. Address rows cascade on user deletion only when no restricted order history depends on the user.
* `shop_customers`: `id` UUID primary key, shop FK, user FK, and timestamps. Unique (`shop_id`, `user_id`). Orders restrict deletion of a referenced shop customer.
* `products`: `id` UUID primary key, shop FK, shop unique slug, name, category (`caps`, `apparel`, `bags`, `other`), optional artwork kind and description, optional base price in kobo, optional sizes and colors, status (`draft`, `published`, `archived`), and timestamps. Category and price may remain empty on a draft, but must be present and valid before publication. Materials and finishes are not product or shop tags. Index by shop and status.
* `product_variants`: `id` UUID primary key, product FK, required material and finish, price add on in kobo defaulting to zero, minimum quantity defaulting to one, optional bulk tiers, and timestamps. Enforce case insensitive uniqueness by a unique index on (`product_id`, `lower(trim(material))`, `lower(trim(finish))`). A tier is `{ minQty, unitPriceKobo }`; validate positive integers and sorted, nonoverlapping quantity ranges. A tier applies when quantity is at least its `minQty` and less than the next tier's `minQty`; the last tier has no upper limit. Use a matching tier's unit price, otherwise product base price plus variant add on. Material and finish are trimmed at write time and matched case insensitively. A published variant requires both values and a positive price.
* `product_image_uploads`: `id` UUID primary key, shop, product, and uploader FKs, unique temporary R2 object key, expected content type and size, alt text, `expires_at`, and completion time. The server creates a 15 minute upload intent whose random temporary key is bound to the authorized shop and product. Finalization checks the unexpired intent, membership, product, actual file type, and size before copying to a permanent key and creating `product_images`. An hourly BullMQ cleanup task removes expired incomplete intents and their temporary objects.
* `product_images`: `id` UUID primary key, product FK, permanent unique R2 object key, required alt text, sort position from zero to four, `attested_by_user_id` FK, attestation time, and creation time. The owner or manager must attest that the image depicts the actual product, not a mockup. Unique (`product_id`, `sort_order`). The first image is the cover. A published product has one to five images. Validate file signature bytes, PNG, JPEG, or WebP decoding, and a maximum size of 5 MB before finalizing the database row.
* `designs`: `id` UUID primary key, user FK, product FK, status (`draft`, `saved`, `submitted`, `archived`) defaulting to draft, optional front and back artwork JSON while drafting, and timestamps. Index (`user_id`, `updated_at`). A user can access only their own designs.
* `orders`: `id` UUID primary key, shop FK, shop customer FK, customer user FK, unique shop order number, status (`awaiting_auth`, `submitted`, `paid`, `in_production`, `shipped`, `completed`, `cancelled`, `refund_pending`, `refund_failed`, `refunded`), payment status (`pending`, `paid`, `failed`, `refunded`), delivery method (`pickup`, `standard`, `express`), subtotal, delivery fee, VAT, total, currency defaulting to `NGN`, contact name, phone and email, address lines, city, state, optional carrier and tracking number, optional decline reason, and timestamps. All amounts are bigint kobo. Index (`shop_id`, `status`) and (`customer_user_id`, `created_at` descending). The shop order sequence increments under a shop row lock in the order creation transaction.
* `order_items`: `id` UUID primary key, order FK, optional design FK set null on design deletion, product FK, variant FK, frozen product name, variant label, color, size, quantity, unit price, line total, design snapshot JSON, and creation time. Index (`order_id`). Catalog references restrict hard deletion. Order item rows cascade only with an order deletion permitted by the financial history rules.
* `order_status_history`: `id` UUID primary key, order FK, status from the order status union, optional note, optional actor user FK for system transitions, and creation time. Index (`order_id`, `created_at`).
* `orders.assigned_membership_id` is nullable and references the assigned staff membership. The service validates that the active membership belongs to the same shop and has the staff role.
* `payments`: `id` UUID primary key, order FK, unique Paystack reference, provider defaulting to `paystack`, optional channel, amount in kobo, provider status (`attempted`, `active`, `succeeded`, `failed`), verified flag defaulting to false, optional unique idempotency key, and timestamps. Index (`order_id`). Payment amount always equals the order total.
* `payouts`: `id` UUID primary key, order FK unique, shop FK, `gross_kobo`, `platform_fee_kobo`, `net_kobo`, status (`pending`, `settled`, `failed`, `cancelled`), optional Paystack settlement reference, optional `paid_at`, and timestamps. Settlement calculation and fee policy remain the checkout decision's responsibility.
* `refunds`: one row per order, with order FK unique, amount, reason, requesting user FK, status (`pending`, `succeeded`, `failed`), and timestamps. Full amount equals `orders.total_kobo`.
* `refund_attempts`: `id` UUID primary key, refund FK, unique server generated idempotency key, optional Paystack reference, status (`pending`, `succeeded`, `failed`), provider result details, created time, and verified time. Index (`refund_id`, `created_at`). Keep every attempt so a retry never overwrites the prior provider outcome. Store no secrets or payment credentials.
* `audit_events`: retain the existing actor user FK, target type and ID, action, optional JSON details, optional request ID, and timestamp. Index (`target_type`, `target_id`, `created_at`).

Role rows and shop membership rows must agree. User deletion is restricted while shop, design, order, payout, or audit history references the user. Never cascade delete financial history.

Keep the existing `mockup_url` column only if required for migration compatibility. New printer product pages and APIs never use it. It is not a substitute for a row in `product_images`.

### State transitions

* Shop: `draft` → `published` by its owner after publication requirements pass; `published` → `draft` only by an owner unpublishing; `published` → `suspended` by a platform admin with a required reason; `suspended` → `published` only by a platform admin after the publication requirements pass. A published slug is immutable.
* Product: `draft` → `published` → `archived`; an archived product is not public. Changes to a published product take effect when saved.
* Membership: invitation `pending` → `accepted` or `expired` or `cancelled`; accepted membership `active` → `removed`. Invitations expire after 48 hours. A user with an active membership cannot join another shop.
* Order: `awaiting_auth` → `submitted` → `paid` → `in_production` → `shipped` → `completed`. A full refund before production moves the order through `refund_pending` to `refunded` or `refund_failed`. `refund_failed` never returns to a production state automatically.
* Payment: `attempted` → `active` → `succeeded` or `failed`, with success set only after server verification matches the order amount.
* Payout: `pending` → `settled`, `failed`, or `cancelled`. A successful refund cancels a payout only while it is pending.
* Refund: `pending` → `succeeded` or `failed`. A retry is allowed only after the prior attempt is verified failed. A status check reads and verifies the existing provider refund; it does not create another refund.

### Order transition contract

The service locks the order row, validates the actor and current state, and commits the order, payment or refund state, status history, and audit event together. A rejected transition changes none of those rows.

| From | To | Actor and preconditions | Atomic effects |
|---|---|---|---|
| `awaiting_auth` | `submitted` | Signed in customer submits checkout with valid cart and contact details | Freeze order and item values, set payment pending, add history and audit |
| `submitted` | `paid` | Server confirms Paystack payment and exact amount | Mark payment verified and paid, set order paid, add history and audit; payout creation follows the checkout payout decision |
| `submitted` | `cancelled` | Server receives a verified terminal payment failure | Mark payment failed and order cancelled, add history and audit |
| `paid` | `in_production` | Owner, manager, or assigned staff; payment is verified; no refund is pending or failed | Set order status, add history and audit |
| `in_production` | `shipped` | Owner, manager, or assigned staff; delivery orders include a tracking number | Save tracking details when supplied, set status, add history and audit |
| `shipped` | `completed` | Owner, manager, or assigned staff; completion is explicitly marked | Set status, add history and audit |
| `paid` | `refund_pending` | Owner or manager; no production has begun and payout is not settled | Create the unique refund and first attempt, set order status, add history and audit |
| `refund_pending` | `refunded` | Verified Paystack success from webhook or status check | Mark refund and attempt successful, set payment refunded and order refunded, cancel a pending payout, add history and audit |
| `refund_pending` | `refund_failed` | Verified terminal Paystack failure | Mark refund and attempt failed, keep payment paid and payout unchanged, set order refund failed, add history and audit |
| `refund_failed` | `refund_pending` | Owner or manager retries after checking the prior attempt is failed | Create a new attempt with a new key, set order pending, add history and audit |

`cancelled`, `refunded`, and `completed` are terminal. `refund_failed` can only return to `refund_pending` through the verified retry path. A pending refund cannot transition into production. An ambiguous provider timeout leaves the attempt pending until a status check establishes the result.

### API surface

These are application service operations exposed through Next.js Server Actions or Route Handlers as appropriate. Every mutation validates input with Zod, returns the shared result type, logs server failures through `lib/log`, and writes audit events where noted.

| Operation | Method or kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Browse printers | GET `/printers` | query, location, category, material, finish, page | shop cards, page count, applied filters | Public | invalid filter |
| Read shop storefront | GET `/shops/[slug]` or shop host | slug, product filters | published shop, products, variants, real photo URLs | Public | 404 for absent, draft, or suspended shop |
| Read customer order tracking | GET `/orders/[orderId]` | order ID | order status, history, refund status and reason | Signed in customer whose user ID matches the order; owner or manager; assigned staff only | 401, 403, 404 |
| Create shop | Server Action | name, slug, state, city, optional area | shop ID, draft status | Signed in, one shop per user | 401, 403, 409, 422 |
| Update shop details | Server Action | authorized shop ID, editable fields | updated shop | Owner, or manager for storefront fields | 403, 404, 422 |
| Publish or unpublish shop | Server Action | authorized shop ID, desired state | shop status | Owner only | 403, 409 for unmet publication requirements |
| Create or update product | Server Action | shop ID, product fields, variants | product ID, status | Owner or manager | 403, 404, 409, 422 |
| Request product image upload | Route Handler | product ID, file name, content type, size, alt text, actual product photo attestation | upload intent ID, short lived upload URL, and temporary key | Owner or manager | 403, 404, 413, 415 |
| Finalize product image | Route Handler | upload intent ID | permanent image row and URL | Owner or manager, matching shop and product | 403, 404, 409, 413, 415 |
| Remove product image | Server Action | product ID, image ID | updated image list | Owner or manager | 403, 404, 409 if it is the only cover |
| Read dashboard overview | Server Component read | authorized shop context, date range | owner and manager get shop counts and settled net payouts; staff get counts for assigned orders only and no payout value | Shop member | 401, 403, 404 |
| List and update orders | Server Action or Route Handler | shop ID, status, page, order ID, allowed transition, tracking number | orders, page, `hasNext`, updated status | Owner or manager; staff only assigned orders | 403, 404, 409, 422 |
| Assign order | Server Action | order ID, staff membership ID | updated assignment | Owner or manager | 403, 404, 409 |
| Invite team member | Server Action | email, role | invitation ID and pending status | Owner only | 403, 409, 422 |
| Read team | Server Component read | authorized shop ID | active members and pending invitations with expiry | Owner only | 403, 404 |
| Resend or cancel invitation | Server Action | invitation ID, action | updated invitation status and expiry | Owner only | 403, 404, 409 |
| Read payouts | Server Component read | authorized shop ID, page | payout records and totals | Owner only | 403, 404 |
| Update shop settings | Server Action | delivery methods and fees, VAT flag | updated settings | Owner only | 403, 404, 422 |
| Request refund | Server Action | order ID, reason | refund ID and pending status | Owner or manager | 403, 404, 409, 422 |
| Check refund status | Server Action | refund ID | verified current refund status | Owner or manager | 403, 404, 409, provider unavailable |
| Retry failed refund | Server Action | refund ID | new attempt ID and pending status | Owner or manager | 403, 404, 409, provider unavailable |
| Receive Paystack refund webhook | Route Handler | provider event and signature | accepted or rejected result | Provider signature verification | 400 invalid event, 401 invalid signature, idempotent duplicate |
| Suspend or reinstate shop | Server Action | shop ID, action, required suspension reason | updated shop status | Platform admin | 403, 404, 409, 422 |

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| Directory card | Shop name, location, product photo, matching material or finish | Published shop and product rows, matching `product_variants`, selected `product_images` cover |
| Directory card | Product, cover image, displayed material and finish | Among variants matching every selected product filter, choose the lowest unit price at its own minimum quantity, then product name, product ID, and variant ID. Use that product's first image and that variant's material and finish. |
| Directory card | Starting unit price and minimum quantity | Calculate at the chosen variant's minimum quantity. Use a bulk tier only if it includes that quantity; otherwise use base price plus variant add on. Show the minimum quantity only when greater than one. |
| Directory results | Search relevance and page | Exact and prefix shop name match before partial shop name, product, or location match; stable shop name and ID tie break; 12 rows per page |
| Shop storefront | Brand, public location, description, products, and product details | Published shop columns and published product, variant, and image rows |
| Shop publication | Ready or blocked state and reasons | Shop name and location plus at least one published priced variant, material, finish, and real cover image |
| Product image | Image bytes and alt text | R2 object at the finalized permanent key and `product_images.alt_text` |
| Overview | Paid orders today | Orders with paid payment state and `created_at` within the current Africa/Lagos calendar day |
| Overview | Ready orders | Authorized shop orders with status `paid` |
| Overview | Active orders | Authorized shop orders with status `in_production` or `shipped` |
| Overview | Settled net payout for 30 days | Sum of `payouts.net_kobo` for settled payouts whose `paid_at` is within the rolling 30 days ending at the database's current UTC time |
| Staff Overview | Assigned order counts | Orders joined to the current active staff membership; no shop wide counts or payout values |
| Orders list | Order number and fulfillment details | Integer `orders.order_number`, order contact and delivery snapshot, product item snapshots, shop status history, and assigned member; never a customer's unrelated saved profile |
| Orders list | Pagination state | Fetch up to 26 rows for a 25 row page; the extra row sets `hasNext` |
| Order total and payout | Money amount | Server calculation from variant price or matching bulk tier, quantity, delivery configuration, and VAT setting; stored as integer kobo |
| Order total and payout | VAT value | `printer_shops.vat_enabled`; 7.5 percent of item subtotal, rounded half up to whole kobo |
| Refund | Amount and eligibility | Full `orders.total_kobo`; order must be paid and before production, and payout must not be settled |
| Refund attempt | Idempotency key | Server generated once per persisted attempt; a duplicate request returns the current pending attempt |
| Refund status | Success or failure | Verified Paystack response or verified webhook, stored on the same refund record |
| Shop subdomain | Public shop URL | Slug plus `STOREFRONT_BASE_DOMAIN`; local path fallback uses `/shops/[slug]` |
| Customer order tracking | Order and refund status | Matching `orders.customer_user_id`, `order_status_history`, `refunds.status`, and `refunds.reason` |
| Audit event | Actor, action, target, and request identifier | Authenticated session, service operation, changed row, structured request context |

### Key invariants

* All public shop and product reads require published state. Suspended or draft shops, and unpublished or archived products, return no public content or metadata.
* Shop membership and role are resolved on the server for every dashboard operation. A client supplied shop ID is never sufficient authorization.
* One user has one printer shop membership. One shop has one owner. Staff assignment must reference an active staff membership in that same shop.
* Every product published in a public shop has at least one real cover photo, one priced variant, and nonempty material and finish. The uploader attestation is stored with the image and the upload intent cannot be finalized for another shop or product.
* Materials and finishes are normalized by trimming and matched case insensitively. Product capabilities are derived from published variants.
* Every order amount and refund amount is recalculated or verified on the server in integer kobo. Client supplied totals are not trusted.
* VAT, when enabled, is calculated at 7.5 percent of item subtotal only and rounded half up to whole kobo. Delivery fees are added from the selected enabled delivery method.
* Order item snapshots remain unchanged when catalog rows are edited or archived.
* Staff can read and update only assigned orders and the order data needed for fulfillment. Managers cannot access owner only pages or publish the shop.
* Refund provider requests are idempotent. A retry uses a distinct attempt key only after the previous attempt is verified failed. A pending refund is never retried as a new request.
* A duplicate refund request while an attempt is pending returns the existing refund and attempt. A retry after a verified failure creates and stores a new key before contacting Paystack. If Paystack does not support provider idempotency, an ambiguous timeout must be resolved by checking status before another request.
* A pending or failed refund blocks production. Only verified provider confirmation can change refund success or failure.
* An order with a settled payout cannot be refunded by a printer. A successful refund cancels only a pending payout.
* Sensitive changes to shops, roles, orders, payments, payouts, and refunds write an audit event. Logs and audit details contain no secrets or full payment credentials.
* Product and shop photo URLs are derived from R2 public delivery configuration and permanent object keys. Never accept arbitrary external image URLs as product photos.
* Every server page, Server Action, and Route Handler for the new printer experience checks the feature gate. Paystack webhooks remain enabled for existing refund records when the gate is off.
* When the feature gate is off, new printer pages and actions return not found. The Paystack webhook remains reachable and processes only valid events for existing records.
* `/storefront` stays an in memory demo with simulated accounts and payments.

### Security model

Public access is limited to published shop and product data. Drafts, suspension details, invitations, customer profiles, order records, and payout data are private. The server derives the active shop from the authenticated user's membership, then applies the role and assignment checks before reading or writing shop data.

Owners can access all pages and actions for their shop. Managers can manage orders, catalog, storefront content, analytics, refunds, and staff assignment, but cannot manage team invitations, payouts, Settings, or whole shop publication. Staff can access only assigned orders and necessary fulfillment details. Refund APIs, provider verification, and webhook handling remain server side.

### Configuration required

* `PRINTER_EXPERIENCE_ENABLED`: feature gate for the public printer directory, shop routes, and printer dashboard. Off by default until the database, R2 delivery, and route configuration are verified.
* `STOREFRONT_BASE_DOMAIN`: production base domain for printer shop subdomains. The local `/shops/[slug]` route does not require this value.
* Better Auth organization invitations use the agreed 48 hour expiry. Resending replaces or cancels the previous pending invite and issues a new expiry.
* Existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_URL` configuration is required for product photos.
* Existing `RESEND_API_KEY` and `EMAIL_FROM` configuration is required for invitation email delivery.
* Existing Paystack credentials are required before enabling refunds. The exact refund endpoint and webhook event names must be verified against current Paystack documentation during implementation.

### Critical test scenarios

* Migration: a Neon branch with representative existing rows migrates successfully, preserves them, and makes previously active shops and products private drafts, verifies **AC-1**, **AC-2**.
* Shop publication: a complete draft publishes; missing location, price, variant material, finish, or real cover photo blocks publication with a field specific explanation, verifies **AC-3**.
* Directory: keyword search is case insensitive and partial; shops match every selected filter; a product variant must satisfy combined product filters; card photo, material, finish, price, and quantity selection are deterministic, verifies **AC-4**, **AC-16**.
* Storefront: a published shop subdomain and local fallback resolve; a draft or suspended shop returns not found and no indexable metadata, verifies **AC-5**, **AC-16**.
* Image upload: valid PNG, JPEG, or WebP within 5 MB can be finalized only for its authorized shop and product after the owner or manager attests that it shows the real product; unsupported formats, oversized images, missing alt text, excess images, and arbitrary external URLs are rejected; expired temporary objects are cleaned, verifies **AC-6**.
* Dashboard: desktop collapse persists, initial state is expanded, mobile navigation shows the four required entries, and all seven pages are separate, verifies **AC-8**.
* Analytics: use controlled timestamps around a Lagos day boundary and a 30 day payout boundary to prove the exact counts and sums; staff receive only assigned order counts and no payout values, verifies **AC-9**.
* Orders: status tabs sort newest first and paginate by 25 with the correct `hasNext`; shipping without a delivery tracking number is rejected; staff cannot access an unassigned order, verifies **AC-10**, **AC-11**.
* Order transitions: allowed actor, source status, prerequisites, and atomic side effects are enforced; an invalid transition changes no order, payment, refund, history, or audit rows, verifies **AC-10**, **AC-14**, **AC-17**.
* Roles: each owner, manager, and staff permission is checked on the server. A manager cannot publish a shop or read payouts, and staff cannot assign or edit another worker's order, verifies **AC-11**, **AC-12**, **AC-17**.
* Team: invitation remains pending until accepted or it expires after 48 hours; resend and cancel are owner only; a member cannot join a second shop, verifies **AC-12**.
* Tracking: a customer can read only their own order, authorized shop members can read the order within their role boundary, and refund status and reason match the verified refund row, verifies **AC-14**, **AC-17**.
* Refund: only eligible paid orders with unsettled payouts can request a full refund; webhook duplicates and request retries do not duplicate provider refunds; failed refunds block production and can be retried, verifies **AC-14**, **AC-15**, **AC-17**.
* Refund recovery: status check queries the same provider refund without creating another request; an unverified provider result does not change order or payout state, verifies **AC-15**.
* Suspension: a platform admin can suspend and reinstate a shop with the required audit data; an owner cannot do either, verifies **AC-19**.
* Separation: disabling the feature gate blocks all new public and dashboard reads and writes while the Paystack webhook can still resolve existing refunds and `/storefront` continues to use its existing in memory demo, verifies **AC-16**, **AC-18**.

## Migration plan

**Strategy**: Feature gated strangler migration. The existing demonstration stays in place while the database backed printer experience is introduced beside it.

**Phases**:

1. Inspect current shop, membership, product, and organization rows on a Neon branch. Detect duplicate shop owners, users with multiple active memberships, missing organization links, conflicting organization slugs, and invalid slugs. Stop and report conflicts rather than silently choosing a surviving shop.
2. Add new columns and tables in an additive Drizzle migration using `DATABASE_URL_UNPOOLED`. For each existing shop without an organization link, create a matching Better Auth organization and owner member using the shop name and slug, then backfill `organization_id`. Ensure the shop owner has an owner membership and synchronized `user_roles` row. Map old active shops to `draft`, old `active=true` products to `draft`, and old `active=false` products to `archived`. Keep the old product `active` and `mockup_url` columns during rollout, but do not use them for new public pages. Preserve existing rows and keep `/storefront` unchanged.
3. Implement and verify the schema, services, role checks, directory, dashboard, photo storage, and Paystack refund confirmation on the branch. Keep `PRINTER_EXPERIENCE_ENABLED` off.
4. Deploy the new routes with the feature gate off. Confirm the production wildcard domain, R2 image delivery, auth membership checks, and Paystack refund behavior. Enable the feature only after each check passes.
5. After the new code no longer reads the legacy `active` column, remove that column in a later migration only if the preflight confirms no other consumer remains. Observe the first live shops and refund events, and use forward migrations for corrections.

**Rollback**: Turn the feature gate off to make the new routes unavailable. Keep the additive schema and migrated data in place; do not run a destructive down migration. The in memory `/storefront` remains usable. Keep old columns until the new code is proven. Correct schema or data issues with a forward migration after diagnosis.

**Risks**: Existing duplicate shop ownership or missing organization links may block backfill. Wildcard DNS or domain routing may be incomplete. Old shop images may be mockups and must not be treated as valid real product photos. Paystack refund API and webhook details remain unverified until implementation research. Branch testing and a preflight conflict report are required before production migration.

## Build plan

Use the project Tracer Bullet approach. First prove one thin, real thread from a private draft shop through the schema, authorization, a real R2 photo, publication, and a public shop page. Keep the existing `/storefront` untouched. Then extend the same model into search, dashboard operations, and refunds.

1. Inspect live schema and migration state, build the migration preflight report, and test the additive data model on a Neon branch. Add shop publication fields, image rows, catalog lifecycle, member roles, order assignment, refund and payout states, and required indexes without deleting existing data, satisfies **AC-1**, **AC-2**, **AC-17**.
2. Implement the authorized shop and catalog services, publication checks, attested image upload intents and expiry cleanup, shop suspension and reinstatement rules, and one published shop page behind the feature gate. Follow [the catalog and public shop pages child spec](./0005-catalog-and-public-shop-pages.md) for catalog and image behavior. Verify the local route and production host resolution, satisfies **AC-3**, **AC-5**, **AC-6**, **AC-16**, **AC-18**, **AC-19**, **AC-CAT-3**, **AC-CAT-7** through **AC-CAT-15**, and **AC-CAT-20** through **AC-CAT-22**.
3. Implement the printer directory filters, stable ordering, pagination, real product cards, shop profile data, and product detail dialog. Follow [the catalog and public shop pages child spec](./0005-catalog-and-public-shop-pages.md) for public catalog search, details, and metadata. Verify public data boundaries, metadata, no checkout behavior, and preservation of `/storefront`, satisfies **AC-4**, **AC-5**, **AC-7**, **AC-16**, **AC-CAT-16** through **AC-CAT-19**, and **AC-CAT-23**.
4. Implement the printer dashboard shell, responsive navigation, role specific Overview metrics, catalog wizard and list, Storefront, Settings access rules, server side feature gate, and platform admin suspension actions. Follow the catalog child spec for editor behavior, satisfies **AC-8**, **AC-9**, **AC-11**, **AC-13**, **AC-17**, **AC-18**, **AC-19**, and **AC-CAT-1** through **AC-CAT-6**, **AC-CAT-20**.
5. Implement order tabs and pagination, assignment, the transition matrix, customer tracking reads, delivery tracking requirements, fulfillment privacy, and manual completion, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-14**, **AC-17**.
6. Implement owner only Team and Payouts pages, Better Auth invitations, membership synchronization, one shop per user enforcement, and owner only shop publication, satisfies **AC-11**, **AC-12**, **AC-13**, **AC-17**.
7. Verify Paystack refund API and webhook behavior from official provider documentation. Implement the full refund request, webhook verification, idempotent retry, manual status check, payout cancellation, and audit trail only after that verification, satisfies **AC-14**, **AC-15**, **AC-17**, **AC-18**.
8. Run focused unit and integration tests for permission boundaries, date and money calculations, image validation and cleanup, migration behavior, and refund state transitions. Enable the production feature gate only after the end to end checks pass, satisfies **AC-1** through **AC-19**.

## Consequences

**Positive**:

* Printers get a focused operations dashboard, while discovery and the printer storefront are separate public surfaces.
* Shop capability comes from published materials and finishes, which keeps filters aligned with what the printer actually sells.
* Real printer supplied photos and explicit publication checks improve trust and prevent demo mockups from appearing as real listings.
* The database backed experience can ship without disrupting the in memory demonstration.

**Negative / tradeoffs**:

* The one spec spans the public directory, shop pages, dashboard, catalog, team, order operations, and refunds. The build plan must keep the work in verified slices.
* Shop role checks, invitation synchronization, R2 image lifecycle, subdomain routing, and refund confirmation add operational work beyond the current demo.
* A feature gate and additive migration require extra deployment checks. Existing active shops will become private until an owner reviews and republishes them.
* Refund behavior cannot ship until Paystack's current API and webhook semantics are verified.

**Neutral**:

* `/storefront` remains the in memory demo and is not the printer storefront.
* The public directory and individual shops are both indexable, but only after explicit publication.
* A printer may copy the six existing demo products as templates. The template supplies fields only, never demo prices or mockup images.

## Follow-up

* [ ] Verify Paystack's current refund endpoint, event names, signature rules, and status verification flow against official documentation before implementing the adapter.
* [ ] Confirm R2 public delivery and production wildcard domain configuration in the deployment environment.
* [ ] Add pointers to the relevant installed implementation skills in the appropriate `AGENTS.md` context so future implementation sessions load them.
* [ ] Add an audit event retention policy before production launch.
* [ ] Review existing shops and products after migration, then republish only those with approved details and real photos.

## Rationale

See [rationale.md](./rationale.md) for the context, options, tradeoffs, and reviewed design references.
