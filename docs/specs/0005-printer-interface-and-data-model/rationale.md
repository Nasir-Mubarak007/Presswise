# Rationale for 0005. Printer interface and data model

## Context

> Premise note: This feature spans several independently buildable areas. Separate decisions would make each area easier to implement, but you chose one combined replacement spec to keep the shared model and interface contract together. The build remains deliberately sliced, and any area that grows into a separate product decision should return to design before implementation.

Presswise has a simulated customer storefront and an existing relational schema direction, but no complete database backed printer directory, shop storefront, or operations dashboard. Printer capability is represented most accurately by the materials and finishes offered on real published product variants. The new public pages therefore need a catalog and photo model that cannot confuse demonstration mockups with printer supplied products (basis: `lib/db/schema.ts` and `docs/specs/0004-shared-data-model.md`).

The private printer workflow also crosses shop ownership, team invitations, catalog publication, order fulfillment, payouts, and refunds. A wrong role boundary or partially verified refund can expose customer information or put an order back into production after money has moved. The existing Better Auth organization model, shop membership pattern, shared identity decision, and audit requirement constrain the design.

This feature spans multiple implementable areas. The user chose one replacement spec that preserves the shared data model while adding the interface contract. The build sequence keeps those areas in one decision record, but proves the public and private surfaces in end to end slices rather than making one large release.

## Options considered

### Option 1: Keep the printer experience as a demo

Continue using the in memory storefront and add only a visual printer dashboard with placeholder data.

(basis: the user's request for a database connected printer interface and real printer product photos)

**Pros**:

* Fastest way to show page structure.
* Leaves the existing schema and service behavior alone.

**Cons**:

* Does not connect printer products, staff, or orders to real shop records.
* A placeholder dashboard would not prove the access rules, real product photos, or refund behavior the user asked for.

### Option 2: Replace the demo storefront

Turn `/storefront` into the database backed printer shop and directory.

(basis: `AGENTS.md` and `docs/specs/0002-customer-storefront-prototype.md`, which keep `/storefront` as an in memory demonstration)

**Pros**:

* One public shopping implementation to maintain.
* No separate printer storefront route family.

**Cons**:

* Breaks the explicit project rule that `/storefront` remains an in memory demonstration.
* Couples the printer shop experience to the simulated demo accounts and payments.

### Option 3: Add the database backed printer experience alongside the demo

Keep `/storefront` unchanged and add the public printer directory, public shop pages, and role protected printer dashboard using the existing database and service stack.

(basis: `AGENTS.md`, `docs/specs/0001-stack-architecture/index.md`, and the user's confirmed public directory, shop, and dashboard decisions)

**Pros**:

* Preserves the existing demonstration while delivering the requested real printer surfaces.
* Reuses the existing relational database, authentication, object storage, payment provider, and design system.
* Allows safe migration and rollout behind a feature gate.

**Cons**:

* The application temporarily has both demo and production storefront experiences.
* New public routes, domain routing, and role boundaries need explicit tests.

## Rationale

Option 3 follows the explicit boundary for `/storefront` while giving printers a real catalog and private operations experience. It also honors the accepted shared identity and organization model, and reuses the repository's Next.js, Drizzle, Better Auth, Neon, private Backblaze B2, and Paystack choices rather than adding another service. The single private bucket keeps originals and optimized derivatives inaccessible directly. Customer image routes check publication state, and printer preview routes check active shop membership before streaming bytes. The cost is application bandwidth and image request latency, with no shared cache so later requests stop immediately after publication or membership changes. The add alongside approach allows existing data to be preserved while new pages stay unavailable until their migration and access checks are verified. The schema work replaces the earlier model proposal because the printer interface requires new publication, image, assignment, and refund data (basis: `AGENTS.md`, `docs/specs/0001-stack-architecture/index.md`, `docs/specs/0003-customer-printer-accounts.md`, `docs/specs/0004-shared-data-model.md`, `.env.example`, and the installed Drizzle, Better Auth, Next.js 16, and Neon skills).

The visual direction uses the existing Presswise design system as the foundation. The reviewed Mobbin printer dashboard patterns inform information hierarchy and navigation; Printful and Printify inform the product catalog and storefront presentation; Google Maps informs location selection and filtering. Those references are inspiration only, not a component or brand to copy. The proposed printer navigation keeps daily operations prominent and moves storefront management into its own page (basis: `design-system/Presswise — Design System.md`, Mobbin, Printful, Printify, Google Maps).

Real printer photos, required alt text, explicit product publication, and variant sourced materials and finishes make the storefront data trustworthy. A server checked role boundary, order snapshots, audit records, full refunds only, verified provider status, and a recovery status check protect the sensitive parts of the workflow. The manual refund status check is the chosen recovery path when a webhook is delayed or lost; it reads the existing provider refund and never creates another request (basis: `docs/specs/0003-customer-printer-accounts.md`, least privilege access control, audit trails for money operations, idempotency for payment operations, staged migration practice, and feature gated rollout).

### Order asset snapshots

The order image route needs a stable record for each product photo or submitted design file. The chosen shape is an `order_item_assets` row with an immutable private B2 copy. This keeps the image available when catalog photos change, and lets the server authorize an opaque asset ID through its order. Keeping asset keys in `designSnapshot` would avoid a table, but it would make validation and order membership checks depend on unstructured JSON, and could leave orders pointing at files that later change or disappear. The tradeoff is additional private storage and cleanup work. The separate checkout decision must create these rows when an order is submitted (basis: `lib/db/schema.ts`, the AC-10 order access contract, and immutable order snapshot practice).

The alternatives were an order asset table with private copies, or references stored in `designSnapshot`. The table provides a foreign key to the order item and stable file ownership, while its cost is extra B2 storage and cleanup. JSON references reduce schema work, but cannot enforce that relationship and may point to a catalog file that later changes or disappears.

## References

**Project sources**:

* `AGENTS.md`, the stack, storefront boundary, build approach, and coding conventions.
* `docs/specs/0001-stack-architecture/index.md`, the selected implementation stack.
* `docs/specs/0002-customer-storefront-prototype.md`, the in memory demo boundary.
* `docs/specs/0003-customer-printer-accounts.md`, shared identity, organization membership, and audit expectations.
* `docs/specs/0004-shared-data-model.md`, the existing data model being replaced and extended.
* `lib/db/schema.ts`, the existing relational schema.
* `.env.example`, the configured database, private B2, email, and payment variables.
* `design-system/Presswise — Design System.md`, the visual foundation.
* `drizzle-orm-patterns`, `.agents/skills/drizzle-orm-patterns/`.
* `organization-best-practices`, `.agents/skills/organization-best-practices/`.
* `nextjs16-skills`, `.agents/skills/nextjs16-skills/`.
* `neon-postgres`, `.agents/skills/neon-postgres/`.

**Practices & standards**:

* Least privilege and server side tenant authorization.
* Idempotency for payment and refund operations.
* Expand, backfill, constrain migration sequence for existing data.
* Feature gated rollout and strangler migration for preserving a working surface.

**Links**:

* Mobbin, interface patterns reviewed for printer dashboard layout: https://mobbin.com/
* Printful, product catalog and shop presentation reviewed for inspiration: https://www.printful.com/
* Printify, product catalog and storefront patterns reviewed for inspiration: https://printify.com/
* Google Maps, location selection and filtering patterns reviewed for inspiration: https://maps.google.com/
