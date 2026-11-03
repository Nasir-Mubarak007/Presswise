# 0003. Customer & printer accounts

**Date**: 2026-10-28
**Status**: Accepted

## Summary

This decision defines one shared identity model for Presswise where one person can be a customer, a printer, or both, while each role sees a different interface and permission set. It also locks the editor pattern: Fabric.js is the 2D design editor, while the 3D product preview stays a separate renderer so the product preview and the art layout do not fight each other.

## Context

The product has two audiences with different jobs. A customer wants to browse products, personalize them, pay, and track orders. A printer wants to manage a shop, review incoming orders, confirm production, and receive payouts. The same person may need both sides at different times, so the platform should not force a separate identity for each role.

The public storefront must keep the customer flow simple and safe. Customers should be required to sign in or sign up before they can finish an order, but they should not be blocked from browsing or previewing products. The printer side needs a tenant and organization structure so one shop can have multiple team members with different roles, while a customer remains a customer only unless they are also invited in.

The design editor also needs a clear boundary. Fabric.js is the right choice for art placement, rotation, resizing, dragging, and text on a flat canvas because it gives fast and familiar 2D controls. The 3D preview is a different concern: it should render the physical product and should not be built as a Fabric.js scene because the 2D transform and the 3D product model are different products with different constraints.

## Requirements

**User stories**:
- As a customer, I want to sign in or sign up before I finish an order so that my purchase is tied to a real account.
- As a printer, I want a shop account with team roles so that my staff can manage orders without exposing all account actions.
- As a user, I want one identity that can act as both a customer and a printer so that I can move between storefront and shop dashboard without duplicate accounts.
- As a designer, I want a drag and resize editor for art on the product so that I can position the design quickly and accurately.

**Acceptance criteria**:
- **AC-1**: One auth identity can hold multiple roles, including customer and printer, without creating duplicate login credentials.
- **AC-2**: A customer must be signed in before finishing checkout, but can browse and preview products when unsigned in.
- **AC-3**: A printer shop has one owner plus staff members with scoped permissions, and staff cannot access customer data outside their shop or role.
- **AC-4**: The product editor uses Fabric.js for 2D art placement, including drag, rotate, resize, and text placement on the selected product face.
- **AC-5**: The 3D product preview is rendered separately from the editor and remains a real product view, not a Fabric.js scene.
- **AC-6**: Every role change, shop membership change, payment decision, refund, and sensitive account action is recorded in an audit event table with an actor, action, target, timestamp, and request ID.
- **AC-7**: The system can resolve the active role for a request from the shared user record and the current tenant context, with a clear deny path when the user lacks permission.

## Options considered

### Option 1: Shared auth user with role based interfaces

One auth record owns the identity, and each user can have one or more roles such as customer, printer owner, or printer staff. A customer profile and a printer profile both point to the same user record. The storefront and printer dashboard read the user's active role and tenant membership before showing the appropriate UI.

**Pros**:
- One login for both sides of the product without duplicate accounts.
- Cleaner data model for payments, orders, and shop membership because the identity is shared.
- Easier to enforce permission boundaries with one user record and a separate role table.

**Cons**:
- The app must handle a user who is both a customer and a printer without confusing the active context.
- The permission model must be explicit, or the printer dashboard could leak into customer routes.
- Role switching adds a small amount of UI and status complexity.

### Option 2: Separate auth users for customer and printer

A customer account and a printer account are distinct auth identities. The same person may have two logins and two profile records, even if they are the same real person.

**Pros**:
- Easy to reason about at first because each user has one role.
- Simpler initial permission checks with fewer role combinations.

**Cons**:
- A real person ends up with duplicate accounts and duplicate profile states.
- It creates repeated data and weaker trust signals across storefront and shop operations.
- It is a poor fit for the product because the same person may need to act as both buyer and seller.

### Option 3: One account with hard coded customer and printer views

A single role is assigned to the user, and the UI switches based on a flag rather than a role table.

**Pros**:
- Very simple early implementation.
- Small amount of code to start.

**Cons**:
- It blocks the product from supporting real multi role behavior later.
- It is brittle for staffing, shop members, and payouts at a printer company.
- It is not a scalable way to express permission boundaries.

## Decision

**Chosen option**: Option 1: Shared auth user with role based interfaces

Presswise will use a single auth identity per person, with separate role records and tenant memberships for customer and printer access. The storefront will require sign in before checkout, while the printer interface will live behind shop membership checks and scoped permissions. Fabric.js handles the 2D product editor; the 3D product preview remains a distinct renderer driven by product geometry and material data.

**Implementation skills**: Better Auth (`better-auth/skills`, `.agents/skills/`) · Next.js (`vercel-labs/agent-skills`, `.agents/skills/`) · Drizzle ORM (`oakoss/agent-skills`, `.agents/skills/`)

## Rationale

The user model in Presswise is not a single role model. A person may place orders, run a printer shop, and manage staff. Requiring separate accounts would split the same person across the platform and make trust, billing, and shop membership harder to track. A single auth user plus role and tenant tables keeps identity stable while allowing the app to resolve the active context cleanly.

The login gate before checkout is also a real business rule, not just a UX choice. It protects the customer order record, reduces fraud, and gives us a real account for order tracking and refund handling. It also creates a clean path for future guest checkout, but that should be a deliberate decision later rather than a hidden bypass.

The editor split is the right boundary for this product. Fabric.js excels at interactive placement and resizing of 2D artwork, which is exactly what the customization flow needs. The 3D preview is a different layer that needs real geometry, materials, and lighting, so it should remain separate and not be routed through the same canvas model. That keeps the app easier to reason about and avoids forcing a 3D scene to behave like a 2D editor.

## Feature design

**Data model sketch**:
- `auth_users`
  - `id` uuid, primary key
  - `email` text, unique, required
  - `password_hash` text, required for email password auth
  - `email_verified_at` timestamp, nullable
  - `created_at`, `updated_at`
- `user_roles`
  - `id` uuid, primary key
  - `user_id` uuid, FK to `auth_users.id`, required
  - `role` enum (`customer`, `printer_owner`, `printer_staff`, `platform_admin`), required
  - `created_at`
  - unique constraint on (`user_id`, `role`)
- `printer_shops`
  - `id` uuid, primary key
  - `owner_user_id` uuid, FK to `auth_users.id`, required
  - `name` text, required
  - `slug` text, unique, required
  - `status` enum (`draft`, `active`, `suspended`), required
  - `created_at`, `updated_at`
- `shop_memberships`
  - `id` uuid, primary key
  - `shop_id` uuid, FK to `printer_shops.id`, required
  - `user_id` uuid, FK to `auth_users.id`, required
  - `role` enum (`owner`, `manager`, `staff`), required
  - `status` enum (`active`, `invited`, `declined`), required
  - unique constraint on (`shop_id`, `user_id`)
- `customer_profiles`
  - `user_id` uuid, PK and FK to `auth_users.id`, required
  - `full_name` text, nullable
  - `phone` text, nullable
  - `preferred_currency` text default `NGN`, required
  - `default_address_id` uuid, nullable
- `designs`
  - `id` uuid, primary key
  - `user_id` uuid, FK to `auth_users.id`, required
  - `product_id` uuid, FK to `products`, required
  - `status` enum (`draft`, `saved`, `submitted`, `archived`), required
  - `front_artwork_json` jsonb, nullable
  - `back_artwork_json` jsonb, nullable
  - `created_at`, `updated_at`
- `orders`
  - `id` uuid, primary key
  - `customer_user_id` uuid, FK to `auth_users.id`, required
  - `shop_id` uuid, FK to `printer_shops.id`, required
  - `status` enum (`draft`, `awaiting_auth`, `submitted`, `paid`, `in_production`, `shipped`, `completed`, `cancelled`, `refunded`), required
  - `payment_status` enum (`pending`, `paid`, `failed`, `refunded`), required
  - `total_kobo` bigint, required
  - `currency` text default `NGN`, required
  - `created_at`, `updated_at`
- `order_items`
  - `id` uuid, primary key
  - `order_id` uuid, FK to `orders.id`, required
  - `design_id` uuid, FK to `designs.id`, required
  - `product_variant_id` uuid, FK to `product_variants`, required
  - `quantity` integer, required
  - `unit_price_kobo` bigint, required
  - `line_total_kobo` bigint, required
- `audit_events`
  - `id` uuid, primary key
  - `actor_user_id` uuid, nullable, FK to `auth_users.id`
  - `target_type` text, required
  - `target_id` uuid, required
  - `action` text, required
  - `details_json` jsonb, nullable
  - `request_id` text, nullable
  - `created_at` timestamp, required
  - index on (`target_type`, `target_id`, `created_at`)

**State transitions**:
- `auth_users` identity: pending -> active -> suspended
- `shop_memberships`: invited -> active -> removed
- `designs`: draft -> saved -> submitted -> archived
- `orders`: awaiting_auth -> submitted -> paid -> in_production -> shipped -> completed, or cancelled/refunded from any active state

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /auth/signup | POST | email:string, password:string, role:string (opt) | userId, roles, session | public | 409 already exists, 422 invalid request |
| /auth/signin | POST | email:string, password:string | session, userId | public | 401 invalid credentials |
| /me/roles | GET | none | roles, activeTenant | bearer | 401 unauthorized |
| /shops | POST | name:string, slug:string | shopId, ownerId | bearer | 409 slug conflict, 403 forbidden |
| /shops/{shopId}/members | POST | email:string, role:string | membershipId, status | bearer + shop manager | 403 forbidden, 404 shop not found |
| /checkout/submit | POST | cartId:string, shippingMethod:string | orderId, paymentIntentId | bearer | 401 unauthenticated, 422 invalid cart |
| /designs/{id}/artwork | PUT | frontArt:json, backArt:json, productId:string | designId, version | bearer | 403 forbidden, 404 design not found |
| /audit-events | GET | entityType:string, entityId:string | events[] | bearer + admin or owner | 403 forbidden |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Sign in | session user and role context | `auth_users.id` + `user_roles` rows for the current session |
| Shopper checkout gate | checkout allowed or redirect | `auth_users.id` checked against `customer_profiles` and required session state |
| Shop membership | visibility and permissions in the printer dashboard | `shop_memberships` rows joined to `printer_shops` and `user_roles` |
| Order total | displayed total and payment amount | sum of `order_items.line_total_kobo` + shipping + tax, sourced from order item rows and pricing rules |
| Audit record | what changed and who acted | `actor_user_id` from session, `action` from the mutation path, `target_id` from the updated row |

**Key invariants**:
- A user can have many roles, but each role must be explicitly recorded and validated at request time.
- A customer cannot access shop data unless they are also a member of that shop through `shop_memberships`.
- Checkout requires an authenticated customer session; guest checkout is out of scope unless a separate business rule is approved.
- Order totals must be derived from order item rows and pricing rules; they cannot be arbitrarily stored as an unchecked value.
- Any sensitive mutation affecting payments, payouts, role membership, or account state must create an `audit_events` record.

**Security model**:
- Public routes: product browsing, pricing, category listing, and marketing pages.
- Authenticated routes: customer profile, cart, order tracking, and payment confirmation.
- Role restricted routes: shop dashboard, order management, payout review, and staff invitation flows.
- Access to any shop resource is granted only through `shop_memberships` for a matching `shop_id` and role permission.
- A platform admin may view cross shop audit events, but a printer staff member can only see the shops they belong to.
- This feature touches payments and account identity, so the platform should treat the data as regulated enough to keep a full audit trail and follow least privilege access rules.

**Configuration required**:
- `BETTER_AUTH_SECRET`: signs and verifies auth sessions.
- `NEXTAUTH_URL` or equivalent app URL for auth callbacks and redirects. 
- `PAYSTACK_SECRET_KEY`: required for payment confirmation, payment verification, and split payout work. 

**Critical test scenarios**:
- Happy path: one user signs up as a customer, then upgrades to a printer role after being invited to a shop, verifies **AC-1** and **AC-7**.
- Happy path: a signed in customer completes checkout and sees a pending or paid order record, verifies **AC-2** and **AC-7**.
- Failure case: an unsigned customer tries to submit the final checkout payload and is rejected with a clear redirect or auth error, verifies **AC-2**.
- Role path: a printer staff member without owner permission tries to invite another worker and is denied, verifies **AC-3**.
- Editor flow: a user drags, rotates, and resizes artwork in Fabric.js and the saved design retains the transform data, verifies **AC-4**.
- 3D split: the 3D preview remains a product mesh while the editor remains a 2D canvas, verifies **AC-5**.
- Audit case: a role change or refund creates an audit record with the actor and target, verifies **AC-6**.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Authentication | Better Auth with organization and session support | Fits the shared identity and multiple tenant model |
| Authorization | Role and tenant checks at the app boundary | Keeps customer and printer access distinct without duplicate users |
| Editor | Fabric.js | Best fit for a drag, rotate, resize, and text 2D product art editor |
| 3D preview | Three.js or React Three Fiber | Real product rendering should live in a dedicated 3D renderer |
| Data layer | Neon Postgres + Drizzle | Strong relational model for roles, shops, orders, and payments |

## Build plan

1. Add the auth identity, role, and printer shop tables plus the shared user model, satisfies **AC-1** and **AC-7**.
2. Add the customer checkout gate and the session to role resolution layer for storefront actions, satisfies **AC-2** and **AC-7**.
3. Add the shop membership model, staff permissions, and the printer dashboard access checks, satisfies **AC-3** and **AC-7**.
4. Add the Fabric.js editor state and design save payload model for artwork placement and text, satisfies **AC-4**.
5. Keep the 3D preview renderer separate from the editor and wire the preview to the same design data without using the editor canvas for product rendering, satisfies **AC-5**.
6. Add audit events for role changes, refund actions, payout updates, and payment decisions, satisfies **AC-6**.

## Consequences

**Positive**:
- One user can operate both sides of the marketplace without duplicate email or password state.
- The role model maps cleanly to shop ownership, staff access, and customer order records.
- Fabric.js gives a fast and familiar editing experience for art placement and sizing.
- Dedicated 3D rendering keeps the preview closer to the real product instead of mixing art editing and product geometry.

**Negative / tradeoffs**:
- The app must carefully resolve active context on every request, otherwise customer and printer paths will leak into each other.
- Role checks and tenant checks add more app logic than a single role model would.
- Audit events add storage and retention overhead, especially around money actions.
- The 3D preview and editor will each have their own state model, which is more work than one all in one canvas, but it is the clearer architecture.

**Neutral**:
- The same user may start as a customer and later become a printer owner after an invite or shop setup.
- Fabric.js and Three.js are both front end concerns, but they solve different problems and should not be merged into one scene.
- Guest checkout remains intentionally deferred unless the business later decides it is a required feature.

## Follow-up

- [ ] Add a formal permission matrix for customer, printer owner, printer staff, and platform admin before implementation begins.
- [ ] Decide whether the same user can create multiple printer shops or only one shop per identity.
- [ ] Confirm the best source of truth for the current active tenant when the user has multiple shops.
- [ ] Add a retention and purge policy for audit events, especially for payment and refund records.
- [ ] Keep the 3D preview on a dedicated scene pipeline and avoid reusing the Fabric.js canvas for that preview state.

## References

**Project sources**:
- `AGENTS.md` — project conventions for a Next.js app with Better Auth and Neon Postgres
- `docs/scope/scope.md` — customer and printer accounts and order flow roadmap
- `docs/specs/0001-stack-architecture/index.md` — chosen stack and auth framework
- `docs/specs/0002-customer-storefront-prototype.md` — storefront prototype boundary and demo constraints

**Practices & standards**:
- least privilege access control
- single identity with role based tenancy
- audit trail for money and account changes
- separate 2D editor from 3D product renderer
