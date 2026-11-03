# 0005. Catalog and public shop pages

## Summary

This decision completes the printer catalog and the public product experience inside the existing printer app. It uses a private image upload flow, real product photos, and a product details dialog that has a shareable link. The existing `/storefront` demo stays separate, and checkout remains out of scope.

## Context

The private catalog currently has a product list but no complete create, edit, publish, photo, or safe delete flow. The current public shop page reads the original photo key as if it were public, and it has no product details experience. The existing schema does not yet support saved descriptions, product edit conflict checks, or public image derivatives.

Customers need accurate product details and prices, while printers need a reliable way to keep drafts private and publish real photos. The catalog is limited to 2,000 published products per shop. Object storage, background jobs, and rate limiting are named in the project stack, but the live service configuration is not complete. The printer feature gate therefore remains off until the required services pass a production smoke test.

## Requirements

**User stories**:

* As a printer owner or manager, I want to create and update products so that my catalog reflects what I can make.
* As a printer owner or manager, I want to upload real product photos and control their order so that customers see accurate images.
* As a customer, I want to search, filter, and page through a printer's products so that I can find a relevant item.
* As a customer, I want to open a product detail dialog with a shareable URL so that I can review product options and pricing without checkout.

**Acceptance criteria**:

* **AC-CAT-1**: The catalog lists products in pages of 25, applies the selected Draft, Published, or Archived status, and uses the correct database offset. Desktop uses a table and mobile uses product cards.
* **AC-CAT-2**: A printer can create a draft with a required name, a stable shop scoped slug, and a version number. The wizard has Details, Variants and pricing, Photos, and Review and publish steps. Its URL uses `step=details`, `step=variants`, `step=photos`, or `step=review`. It autosaves changed field patches 500 milliseconds after typing, and saves on field blur or step change. Review shows the public card preview, readiness checklist, and field errors with links to their step. Publish is unavailable until all changes are saved.
* **AC-CAT-3**: Draft saves may be incomplete, but a product can publish only with a category, a positive base price, valid variant pricing, complete variant material and finish, and at least one finalized real product photo. A published edit applies immediately only when the complete product remains valid.
* **AC-CAT-4**: A product name is at most 120 characters and its description is at most 2,000 characters. Naira input is decimal text with at most two decimal places, parsed without floating point, and converted on the server to integer kobo.
* **AC-CAT-5**: A product has no more than 50 variants. Material and finish are trimmed, each is at most 80 characters, and a duplicate normalized pair is rejected. Minimum quantity defaults to one. Bulk tiers have increasing quantity thresholds at or above the minimum and positive final unit prices. A variant adjustment may be negative only when the resulting unit price remains positive.
* **AC-CAT-6**: The product list supports copying a template from the six in memory demo products. A template copies only name, category, sizes, and colors. It never copies demo prices, variants, or mockup images.
* **AC-CAT-7**: Each product has at most five photos, each no larger than 5 MB and 40 megapixels. Only PNG, JPEG, and single frame WebP are accepted. Each photo requires alt text of at most 250 characters and an attestation that it shows the real product. A user can select multiple photos and upload no more than two at a time. The first ordered photo is the cover.
* **AC-CAT-8**: Creating an upload intent reserves a photo slot. The count includes finalized photos and unexpired intents in `reserved`, `uploading`, or `processing` state, so concurrent requests cannot exceed five slots. The server locks the product and checks the count and creates the intent in one database transaction. Completed intents are represented by a finalized image and do not count twice. Expired, failed, and cancelled intents release their reservation. The editor queues selected files and allows no more than two browser uploads at a time.
* **AC-CAT-9**: The browser uploads directly to a private R2 bucket using a server signed PUT URL that expires after 15 minutes. The server generates an opaque key. R2 CORS allows PUT from the configured app origin and `http://localhost:3000` only during local development. (basis: Cloudflare R2 presigned URL and CORS documentation, and the installed AWS SDK skill)
* **AC-CAT-10**: Finalization queues a small job payload containing an intent ID. A Railway BullMQ worker checks the actual file bytes, decodes the image with Sharp, stores the private original, and creates a metadata stripped WebP derivative no larger than 2,400 pixels on its longest edge only when the product and shop are published. Shop branding derivatives are created only while the shop is published. Finalization is idempotent. The editor polls every two seconds until processing completes or fails. (basis: the installed Sharp and BullMQ skills)
* **AC-CAT-11**: Transient image processing errors receive three automatic retries with 30, 60, and 120 second delays. Permanent validation failures stop immediately. Upload failures use stable codes: `INVALID_TYPE`, `INVALID_IMAGE`, `ANIMATED_IMAGE`, `FILE_TOO_LARGE`, `IMAGE_TOO_LARGE`, `INTENT_EXPIRED`, `STORAGE_UNAVAILABLE`, and `PROCESSING_FAILED`. The first five are permanent validation failures; the last three are retryable or require a fresh intent. After retry exhaustion, the editor shows the code and a clear message, and retains the selected file and metadata for retry with a fresh intent.
* **AC-CAT-12**: Originals remain private. Public derivatives are generated only for published products in published shops. Draft previews are available only to an active owner or manager for that shop, through a five minute signed read URL. Unpublish and archive transitions immediately stop application reads and metadata from exposing the asset, then delete the public derivative with retryable cleanup. If R2 deletion fails, the known public object URL may remain directly accessible until cleanup succeeds. Public images use a five minute cache lifetime.
* **AC-CAT-13**: Shop data adds an optional description of at most 2,000 characters, one logo, and one banner. Branding images use the shared upload pipeline and are public only while the shop is published. An authorized owner or manager can attach or replace a finalized logo or banner through a server action. Logo alt text is required and at most 250 characters. Banner alt text is either supplied up to 250 characters or explicitly marked decorative. Separate visual settings controls remain out of scope.
* **AC-CAT-14**: Product actions support publish, unpublish to draft, archive, restore to draft, and permanent delete. Archive is reversible. A published product's last photo cannot be removed until a replacement is finalized or the product is unpublished. Permanent delete is owner only and is allowed only when there are no order or saved design references. Deletion first archives the product; storage cleanup failure leaves it archived with deletion pending for a safe retry.
* **AC-CAT-15**: Only an active shop owner or manager can create, edit, publish, unpublish, archive, restore, attach branding, or manage photos. Only the owner can permanently delete a product. Staff and platform admin roles do not bypass shop membership checks. Each create, edit, publication change, archive, restore, delete, branding change, photo finalization, reorder, and removal writes an audit event.
* **AC-CAT-16**: The public shop shows its name, description, tagline, city and state, optional area, logo, banner, search, categories, and published product grid. A product card shows its lowest valid variant price as a “from” price at that variant's minimum quantity. Search covers product name, description, category, material, and finish after trimming, collapsing whitespace, and converting to lower case. Exact name matches rank first, followed by name prefixes, partial name matches, then any non-name match. Search results use stable name and ID tie breakers. Without search, products sort by most recently updated, then ID.
* **AC-CAT-17**: A shop supports at most 2,000 published products, enforced with a per-shop transaction lock during publication. Public results show 24 products per page. Search and category filters combine. Only categories with published products appear. The `q`, `category`, `page`, and `product` query values preserve the listing and open dialog state. Search is trimmed and limited to 100 characters. An unknown category shows a clear filter error without silently widening results. Missing, invalid, or out of range page values use page one.
* **AC-CAT-18**: A product opens in a desktop dialog or a near full screen mobile dialog. Its URL uses `?product=<slug>`, participates in browser history, and closes with browser Back. Details include product text, category, sizes, colors, variants, unit price, minimum quantity, quantity tier preview, and an image gallery with mobile navigation. The dialog is keyboard accessible and restores focus when closed.
* **AC-CAT-19**: Published shop and product URLs have product specific metadata, canonical URLs, Open Graph previews using the real cover photo, sitemap entries, and Product JSON LD with name, description, image, category, material, color, and size where available, and without Offer or availability claims. The configured production shop subdomain is canonical; `/shops/[slug]` is canonical only when no production shop domain is configured. A product title is `<product name> | <shop name>`; a shop title is `<shop name> | Presswise`. A missing product description uses `Explore <product name> from <shop name>, a printer in <city>, <state>.` A missing shop description uses its tagline or `Custom products from <shop name> in <city>, <state>.` Product URLs are indexable. Search and category variants are `noindex,follow`. Draft, archived, unpublished, and suspended content returns no public data or indexable metadata.
* **AC-CAT-20**: Server Actions and Route Handlers validate input with Zod and return the shared result shape. Field errors use stable keys in the shared `fields` map: `name`, `description`, `category`, `basePrice`, `variants.<index>.material`, `variants.<index>.finish`, `variants.<index>.priceAdjustment`, `variants.<index>.minimumQuantity`, `variants.<index>.bulkTiers.<index>`, and `photos.<index>.altText`. Details fields link to `step=details`, variant fields to `step=variants`, and photo fields to `step=photos`. Version conflicts return a conflict error, preserve local edits as unsaved, and offer explicit reload or retry actions.
* **AC-CAT-21**: Upload intent creation is limited to 30 intents per authenticated user in a rolling one hour window using Upstash. Upload intent requests fail closed if the rate limiter is unavailable.
* **AC-CAT-22**: An hourly Railway BullMQ job removes expired upload objects and orphaned derivatives. R2 lifecycle rules remove temporary objects left in the staging prefix after one day. The feature gate remains off until both R2 buckets, public delivery, Upstash, and the worker are configured and smoke tested. (basis: Cloudflare R2 object lifecycle documentation and the selected hourly cleanup policy)
* **AC-CAT-23**: The catalog and public shop changes do not add a cart or checkout and do not change `/storefront`, which remains an in memory demo.

## Options considered

### Option 1: Complete the catalog in the existing printer app

Extend the current Drizzle model, catalog routes, and shop page. Use private R2 originals, public WebP derivatives, and the selected Railway worker for image processing. Keep the product dialog within the existing public shop route. (basis: `AGENTS.md`, the printer interface contract, and the current catalog and shop implementation)

**Pros**:

* Reuses the existing authentication, database, printer services, and design system.
* Keeps the photo, publication, and public page rules in one server checked flow.
* Preserves the existing in memory demo and allows a feature gated release.

**Cons**:

* Requires new schema, worker code, R2 buckets, and deployment configuration.
* Real upload verification is blocked until the storage and job services are configured.

### Option 2: Use a hosted catalog or commerce platform

Move product editing and image handling to an external system, then connect it to the printer shop pages. (basis: the project's existing Next.js, Neon, Drizzle, and Better Auth stack)

**Pros**:

* Could provide a ready made catalog editor and managed media workflow.
* Reduces the amount of custom administration UI.

**Cons**:

* Adds a new provider and a second source of truth for products and publication.
* Does not remove the need for the printer role checks, pricing rules, and shop specific public URLs.

### Option 3: Finish the visual catalog and defer real photos

Build the editor and public dialog first, but keep photo upload and publication on placeholders until a later slice. (basis: the user's requirement for real product photos and the parent printer spec)

**Pros**:

* The editor can be shown before storage is configured.
* The UI work can proceed with mocked data.

**Cons**:

* It does not prove the real photo and privacy flow.
* It leaves product publication and storefront behavior incomplete.

## Decision

**Chosen option**: Option 1: Complete the catalog in the existing printer app.

Use the existing stack, preserve `/storefront`, and deliver the catalog as a gated end to end feature. Keep the product dialog on the public shop route, and process images through the Railway worker because the accepted file size and pixel limits make image decoding unsuitable for a short request path. (basis: `AGENTS.md`, `docs/specs/0005-printer-interface-and-data-model/index.md`, and the selected Cloudflare R2 and BullMQ skills)

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `nextjs16-skills` (`gocallum/nextjs16-agent-skills`, `.agents/skills/nextjs16-skills/`) · `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `upstash-ratelimit-js` (`upstash/skills`, `.agents/skills/upstash-ratelimit-js/`) · `infra-platform-aws-sdk` (`agents-inc/skills`, `.agents/skills/infra-platform-aws-sdk/`) · `cloudflare-r2` (`secondsky/claude-skills`, `.agents/skills/cloudflare-r2/`) · `bullmq-specialist` (`sickn33/agentic-awesome-skills`, `.agents/skills/bullmq-specialist/`) · `sharp` (`clasen/skills`, `.agents/skills/sharp/`)

## Rationale

The existing application already owns shop membership, catalog rows, and public shop routing. Extending those records avoids another product source of truth and keeps authorization close to the data. A separate private original bucket and public derivative bucket keep draft photos private, while opaque keys and a short cache lifetime limit stale public access. Direct upload avoids sending photo bytes through the app server. Background processing keeps image decoding away from Vercel request time limits and gives the editor a clear retry state. (basis: `AGENTS.md`, the current printer schema and shop route, Cloudflare R2 presigned URL documentation, and idempotent background job practice)

The 2,000 product limit is small enough for ranked PostgreSQL matching without introducing a search provider. The existing `?product=` design keeps share links and dialog navigation together. The main cost is operating two R2 buckets, a Railway worker, and Upstash configuration before enabling the feature. (basis: the confirmed 2,000 product limit, the existing database stack, and the user's selected URL behavior)

## Feature design

### Data model

| Entity | Key fields and constraints | Relationship |
|---|---|---|
| `printer_shops` | Add nullable `description` up to 2,000 characters, logo and banner original and public object keys, logo alt text, banner alt text, a banner decorative flag, and a visibility transition flag | One shop has many products and upload intents |
| `products` | Add nullable `description` and integer `version`; retain stable shop scoped `slug`, name, category, artwork kind, positive base price in kobo, sizes, colors, status, and visibility transition state | Many products belong to one shop |
| `product_variants` | Allow nullable material and finish for incomplete drafts; retain price adjustment, minimum quantity, and structured `bulk_tiers` JSON; enforce normalized pair uniqueness when both fields exist | Many variants belong to one product |
| `product_images` | Keep `object_key` for the private original; add nullable `public_object_key` for the WebP derivative; retain alt text, sort order, attestation, and uploader | Many photos belong to one product |
| `asset_upload_intents` | Shop ID, nullable product ID, uploader ID, asset type, temporary object key, declared content type and size, alt text and attestation when relevant, expiry, explicit `reserved`, `uploading`, `processing`, `complete`, `failed`, `expired`, or `cancelled` state, safe failure code, and result reference | Product photo intents reference a product. Shop logo and banner intents have no product ID |
| `publication_transitions` | Shop or product target, requested target state, `queued`, `processing`, `retryable_failed`, or `complete` state, idempotency key, retry count, and safe failure code | Stores recoverable object storage work. A target has at most one active transition |

Migrate the existing `product_image_uploads` rows into `asset_upload_intents` as product photo intents, preserving IDs, shop, product, uploader, keys, and timestamps. Bulk tiers remain JSON on a variant, with a shared Zod schema enforcing their shape. Product and shop image keys are generated by the server, never from a browser supplied filename. Product slugs are generated once from a normalized lower case name, replacing non alphanumeric runs with one hyphen and trimming edge hyphens. The server uses `product` when normalization produces an empty value, and appends the lowest available numeric suffix such as `-2` if the shop already has that slug. A rename does not change the slug. (basis: `lib/db/schema.ts` and the confirmed shared upload intent model)

### State transitions

| From | To | Preconditions and effects |
|---|---|---|
| New | Draft | Name is present. Server generates a normalized stable shop slug and version |
| Draft | Published | Product fields, price, at least one complete priced variant, and a finalized photo pass readiness checks |
| Published | Draft | Authorized owner or manager requests unpublish. Set visibility transition state immediately, then remove public derivatives through a retryable transition before completing the status change |
| Draft or Published | Archived | Authorized owner or manager requests archive. Set visibility transition state immediately, then remove public derivatives through a retryable transition before completing the status change |
| Archived | Draft | Authorized owner or manager restores the product. Public derivatives remain absent |
| Archived | Deleted | Owner only, no order or saved design references, and storage cleanup succeeds. Cleanup failure leaves the product archived and deletion pending for retry |

A published product may remain hidden while its shop is draft or suspended. Publishing a product or shop creates and verifies all required public derivatives before its publication state changes. A per target transition record serializes publication changes and makes work recoverable. On unpublish or archive, the transition flag immediately excludes content from application reads and metadata, then removes derivatives; a failed removal remains `retryable_failed` and blocks another transition until retried. The existing lifecycle status is not changed until cleanup succeeds. If publication fails after creating some derivatives, remove those derivatives as compensation; if compensation fails, keep the target hidden and the transition retryable. The public object cache may retain an already fetched image for up to five minutes. Product publication locks the shop row while counting published products and fails explicitly if the 2,000 product limit would be exceeded. Object operations, compensation, and retries are idempotent.

### API surface

All Server Actions and Route Handlers check the printer feature gate, use the shared `Result<T>` shape, and validate boundary inputs with Zod.

| Operation | Surface | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| List catalog | Server Component read at `/printer/catalog` | `status` and one based `page` query values | 25 products, normalized status and page, `hasNext` | Active owner or manager | 401, 403, unknown status |
| Create product | Server Action | Name, optional template ID | Product ID, stable slug, status, version, field errors | Active owner or manager | 401, 403, 409, 422 |
| Patch product or variants | Server Action | Product ID, changed fields, expected version | Product ID, slug, status, new version | Active owner or manager | 403, 404, 409 version conflict, 422 |
| Change product state | Server Action | Product ID and publish, unpublish, archive, or restore action | Status, version, readiness errors, and transition state | Active owner or manager | 403, 404, 409, 422, storage unavailable |
| Delete product | Server Action | Archived product ID | Deleted status or archived deletion pending state | Active owner only | 403, 404, 409 if not archived, referenced, or cleanup fails |
| Reorder photos | Server Action | Product ID and ordered image IDs | Updated ordered image list | Active owner or manager | 403, 404, 409, 422 |
| Request asset upload | `POST /api/printer/assets/intents` | Asset type, product ID when needed, content type, size, alt text and attestation for product photos | Intent ID, signed PUT URL, required headers, expiry | Active owner or manager | 401, 403, 404, 409 at photo limit, 413, 415, 429, rate limiter unavailable |
| Upload bytes | Browser `PUT` to the signed R2 URL | File bytes and signed headers | R2 upload response | Signed URL holder | Expired URL, CORS or storage error |
| Finalize asset | `POST /api/printer/assets/intents/[id]/finalize` | Intent ID | Accepted processing status | Active owner or manager for the intent shop | 403, 404, 409, 413, 415, storage unavailable |
| Read processing status | `GET /api/printer/assets/intents/[id]` | Intent ID | Processing status and safe error or finalized asset ID | Active owner or manager for the intent shop | 403, 404 |
| Preview private asset | `GET /api/printer/assets/[id]/preview` | Product image or shop asset ID | Five minute signed read URL | Active owner or manager for the asset shop | 403, 404, storage unavailable |
| Attach shop branding | Server Action | Finalized logo or banner intent ID, alt text or decorative flag | Updated branding asset and public derivative state | Active owner or manager | 403, 404, 409 if intent is not finalized, 422, storage unavailable |
| Remove photo | `DELETE /api/printer/products/[id]/photos/[imageId]` | Product and image IDs | Updated ordered photo list | Active owner or manager | 403, 404, 409 if it is the last photo on a published product, storage unavailable |
| Read public shop | Server Component at `/shops/[slug]` or shop subdomain | `q`, `category`, `page`, and `product` | Published shop, matching products, dialog state, metadata | Public | 404 for private shop or product, invalid query |
| Read sitemap | Dynamic sitemap route | Published shop rows | Canonical shop and product URLs | Public | Feature gate off |

Shop identity and actor identity always come from the server session and active shop membership. The browser never supplies an authoritative shop ID. The signed upload URL is returned once and is not logged or persisted in audit data.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| Catalog list | Product fields, normalized status, page, and `hasNext` | Authorized shop membership, requested `status` (default Draft), requested `page` (default 1; missing, invalid, or out of range uses 1), `products`, and a 25 row page size; unknown status is rejected |
| Wizard step | Current step and public card preview | The `step` query value, validated against the four supported steps, and the saved product fields |
| Product create | Product ID, slug, draft status, initial version | Database insert, server generated normalized stable shop scoped slug with lowest available numeric collision suffix, version initialized to one |
| Autosave | Persisted fields and new version | Validated changed field patch and expected version compared with `products.version` |
| Template copy | Name, category, sizes, and colors | The selected item in the six in memory demo products; prices, variants, and images are excluded |
| Product patch | Persisted product or variant values, new version, and field errors | Zod validated patch, field constraints, expected version, and shared `fields` error map |
| Product state change | Status, version, and readiness errors | Current product and shop state, requested action, publication checks, authorization, and successful required R2 operations |
| Product deletion | Deleted status or a conflict | Owner membership, product references, and successful cleanup of related R2 objects |
| Branding update | New logo or banner, alt text, and publication readiness | Authorized finalized asset intent and submitted text or decorative flag, with derivative generated only if the shop is published |
| Photo ordering | Ordered photo list | Submitted image IDs validated against the product's finalized photos and persisted `sort_order` values |
| Photo removal | Updated ordered photo list or a conflict | Product status, remaining finalized photos, replacement photo state, and successful R2 cleanup |
| Variant price preview | Unit price at selected quantity | For a quantity at or above the minimum, use the final unit price of the highest bulk tier whose threshold is not greater than the quantity; otherwise use positive base price plus adjustment. For a quantity below the minimum, show a minimum quantity validation message. Values are integer kobo |
| Public product card | “From” price | Lowest valid variant price at that variant's minimum quantity, applying the highest tier threshold at or below that quantity, or base price plus adjustment if none applies |
| Publish readiness | Missing category, price, complete variant, or cover photo | Product fields, variants, finalized product images, and current shop publication state |
| Product upload intent | Temporary key, signed PUT URL, required headers, file type and size, expiry, photo reservation | Server generated opaque key, private bucket credentials, validated request, current finalized photos and unexpired intents in a reserving state, product row lock, and 15 minute expiry |
| Upload limit | Allow or deny result | Authenticated user ID, Upstash sliding window, 30 intents per rolling hour |
| Processing status | Pending, processing, complete, or failed state | `asset_upload_intents` row and worker result; never the file bytes or signed read URL |
| Private preview | Signed read URL and expiry | Private original key and the active owner or manager membership; five minute expiry |
| Public image | Image URL, alt text, and display order | `R2_PUBLIC_URL`, `public_object_key`, `product_images.alt_text`, and `sort_order`; only published shop and product rows |
| Shop header | Name, description, tagline, location, logo, and banner | Published `printer_shops` row and public derivative keys |
| Public product page | Fields, variants, images, price preview, canonical URL, metadata, and JSON LD | Published shop and product rows, variants, image rows, `STOREFRONT_BASE_DOMAIN`, and selected URL state; canonical production subdomain when configured; title and description use the exact templates in AC-CAT-19; JSON LD includes name, description, image, category, material, color, and size when available |
| Search result | Match, rank, category, and page | Published products and variants for the shop; trimmed case insensitive normalized text; exact name, name prefix, partial name, then any non-name match; stable name and ID tie breakers |
| Sitemap | Indexable shop and product URLs | Published shop and product rows and the configured storefront base domain |
| Audit event | Actor, action, target, and request identifier | Authenticated actor, completed mutation, target record, and request context; signed URLs and photo bytes are excluded |
| Upload failure | Stable code, message, and retry guidance | `asset_upload_intents` state and failure code; permanent validation codes do not retry, while expired intent, storage outage, and exhausted transient processing can use a fresh intent |

### Key invariants

* Every public catalog read requires both a published shop and a published product. Public code reads only public derivative keys.
* Private originals and draft preview URLs never appear in public data, page metadata, sitemap entries, logs, or audit details.
* Product status changes and shop publication changes do not commit when a required R2 copy or removal fails.
* Publication transitions are recorded before R2 work, exclude transitioning content from application reads, and can be retried or compensated after partial object operations. A failed transition blocks conflicting transitions until resolved.
* Product publication locks the shop row while checking the 2,000 published product limit. Photo intent creation locks the product while checking and reserving one of five slots.
* Database and R2 operations are retried idempotently. Worker payloads contain identifiers only, not photo bytes or signed URLs.
* The server validates the actual image bytes and decoded dimensions. Declared file type and size are not trusted as proof.
* Price math uses integer kobo parsed from decimal text without floating point. For a requested quantity at or above the minimum, the highest qualifying bulk tier supplies the final unit price; without a qualifying tier, use base price plus adjustment.
* Product changes use the expected version. A conflict never discards local input or silently overwrites another session.
* A published product always has a real cover photo. Its last photo can be removed only after a replacement is finalized or the product is unpublished.
* Search, filters, and pagination never return unpublished data. Catalog status defaults to Draft and page defaults to one. Unknown status is rejected, and an invalid or out of range page uses page one. Public and private pagination preserve the active filters.
* Exceeding the 2,000 product limit returns an explicit publish error, not a silently truncated catalog.
* The public cache lifetime is 300 seconds. A private transition stops application reads immediately and removes public objects through retryable cleanup. Cached or directly addressed public objects may remain visible until the cache expires or R2 cleanup succeeds.
* The hourly worker removes expired staging objects and orphaned public derivatives. R2 lifecycle cleanup is a one day safety net.
* `/storefront` remains unchanged and is not a source of real prices, variants, or product images.

### Security model

The server resolves the signed in actor and active shop membership for every private read and mutation. Owners and managers can manage catalog records and product photos. Only the owner can permanently delete an unused product. Staff and platform administrator roles do not grant catalog access without shop membership. Public readers can see only published shop and product data. Private previews use short lived signed URLs and require an active owner or manager membership. Audit records store actor, action, target, and request identifier, but never signed URLs or photo bytes.

The upload limiter uses the authenticated user ID and a sliding one hour window. Missing or unavailable Upstash configuration rejects new upload intents. R2 credentials remain server side. CORS allows only the configured app origin and the local development origin, with no wildcard. (basis: least privilege, bearer URL handling, and the installed Upstash, AWS SDK, and R2 skills)

### Configuration required

* `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`: server side R2 S3 compatible credentials.
* `R2_PRIVATE_BUCKET`: staging and private original objects.
* `R2_PUBLIC_BUCKET`: optimized public derivatives only.
* `R2_PUBLIC_URL`: public delivery domain for derivative keys.
* `NEXT_PUBLIC_APP_URL`: exact deployed browser upload origin. Local development also allows `http://localhost:3000`.
* `STOREFRONT_BASE_DOMAIN`: production canonical shop subdomain base.
* `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: upload intent rate limiting.
* `BULLMQ_REDIS_URL`: Railway Redis connection for the image and cleanup workers.
* `PRINTER_EXPERIENCE_ENABLED`: must remain off until required services and production smoke tests pass.

### Critical test scenarios

* Create a draft, autosave fields, reload the same step, and confirm the version and values. Verify all four step query values, review preview, readiness links, and blocked publish while edits remain unsaved, verifies **AC-CAT-2**.
* Load the catalog without query values, with each valid status, an unknown status, and missing, invalid, or out of range pages. Verify defaults, rejection, page fallback, correct offsets, `hasNext`, and filter preserving links, verifies **AC-CAT-1**.
* Submit two competing patches for one version and confirm the second receives a conflict while local values remain unsaved, verifies **AC-CAT-20**.
* Create products with names that normalize identically and with names that normalize to empty. Verify stable slugs, numeric collision suffixes, and unchanged slugs after rename. Exercise valid and invalid Naira strings, positive price boundaries, negative adjustments, minimum quantities, tier selection, and duplicate normalized variant pairs, verifies **AC-CAT-2**, **AC-CAT-3**, **AC-CAT-4**, and **AC-CAT-5**.
* Create five photo reservations concurrently and confirm no sixth intent can be issued. Confirm completed intents count only through finalized images, failed and expired intents release slots, and the browser queues beyond two uploads, verifies **AC-CAT-7** and **AC-CAT-8**.
* Upload a valid image, then spoofed MIME, oversized, over pixel limit, animated, truncated, and unsupported files. Confirm only a valid single frame image produces a private original and optimized WebP, verifies **AC-CAT-9**, **AC-CAT-10**, and **AC-CAT-11**.
* Retry an upload finalization and a background job after a timeout. Confirm one image row and one derivative result, verifies **AC-CAT-10** and **AC-CAT-11**.
* Fail R2 copy or removal during publish, unpublish, archive, or shop publication, including after partial success. Confirm transitioning content is excluded from app reads, conflicting transitions are blocked, recovery is idempotent, and publication state changes only after required operations complete, verifies **AC-CAT-12** and **AC-CAT-14**.
* Publish two products concurrently when one slot remains under the shop limit. Confirm the per-shop lock prevents the limit from being exceeded. Confirm deletion archives before cleanup, and a cleanup failure can be retried from the archived state, verifies **AC-CAT-14** and **AC-CAT-17**.
* Attach and replace finalized logo and banner assets as owner and manager. Verify authorization, public visibility only for published shops, logo alt text, decorative banner behavior, and audit events, verifies **AC-CAT-13** and **AC-CAT-15**.
* Test each actor role against catalog reads, mutations, private previews, and permanent deletion, verifies **AC-CAT-15**.
* Search a controlled set of products and variants with case and whitespace variations. Verify ranking, non-name match tie breakers, combined category filter, 24 row pages, empty state, invalid category, and page fallback, verifies **AC-CAT-16** and **AC-CAT-17**.
* Open a product URL directly, navigate between images and variants, then use browser Back. Verify responsive behavior, focus handling, production subdomain canonical URL, metadata fallbacks, Open Graph data, sitemap entries, and JSON LD without offers or availability, verifies **AC-CAT-18** and **AC-CAT-19**.
* Exceed the shop product limit, rate limit, and upload expiry. Verify explicit errors, no silent truncation, and no secret or signed URL in logs, verifies **AC-CAT-20**, **AC-CAT-21**, and **AC-CAT-22**.
* Visit draft, archived, unpublished, and suspended shop URLs and confirm they return no data or indexable metadata. Verify `/storefront` still uses its in memory demo, verifies **AC-CAT-19** and **AC-CAT-23**.

## Build plan

Use the project Tracer Bullet approach. First prove one real product from a private draft through upload intent, direct R2 upload, worker processing, publication, and public display. Then add the complete editor, lifecycle, search, and product detail experience.

1. Add an additive Drizzle migration for shop branding fields, product description and version, nullable draft variant values, public derivative keys, explicit upload intent states, and recoverable publication transitions. Preserve and convert existing upload intent rows, and add normalized uniqueness, product limit, and query indexes, satisfies **AC-CAT-3**, **AC-CAT-5**, **AC-CAT-7**, **AC-CAT-8**, **AC-CAT-13**, **AC-CAT-14**, and **AC-CAT-17**.
2. Build the first gated vertical slice: create a draft product, request and reserve one photo intent, upload to private R2, process it in BullMQ, publish a valid product and shop, and render the public cover. Add idempotency, authorization, audit, cleanup, rate limiting, and shared boundary validation, satisfies **AC-CAT-3**, **AC-CAT-7** through **AC-CAT-15**, and **AC-CAT-20** through **AC-CAT-22**.
3. Build the product wizard, autosave patches, optimistic version handling, variants, Naira conversion, bulk tiers, safe templates, readiness review, and catalog list pagination, satisfies **AC-CAT-1** through **AC-CAT-6** and **AC-CAT-20**.
4. Complete product lifecycle actions, ordering and removal of photos, owner only permanent deletion, branding attachment action, and recoverable R2 transitions, satisfies **AC-CAT-12** through **AC-CAT-15**.
5. Build public shop search, category filters, 24 product pagination, normalized stable ranking, URL state, responsive product dialog, pricing preview, metadata fallbacks, canonical URLs, social previews, sitemap, and JSON LD, satisfies **AC-CAT-16** through **AC-CAT-19**.
6. Configure production R2, Upstash, Railway Redis, worker deployment, CORS, lifecycle rules, Sentry and structured logs. Run migration, permissions, storage, SEO, `/storefront` preservation, and end to end checks while the feature gate is off. Enable only after the smoke tests pass, verifies **AC-CAT-22** and **AC-CAT-23**.

## Consequences

**Positive**:

* Product data, publication, images, and public product details share one authorization and data model.
* Draft originals stay private, and public pages use optimized derivatives only.
* Product URLs can be shared and indexed without adding cart or checkout behavior.

**Negative / tradeoffs**:

* The feature now depends on two R2 buckets, Upstash, a Railway Redis connection, and a deployed worker.
* A failed worker job leaves the photo pending until retries finish and the user starts a fresh intent.
* A five minute cache lifetime allows brief stale visibility after a product becomes private.
* Logo and banner data can display publicly, but editing controls wait for the separate storefront settings slice.

**Neutral**:

* The product catalog is capped at 2,000 published products per shop.
* Search uses the existing database rather than a new search provider.
* This slice does not include a cart, checkout, or payment flow.

## Follow-up

* [ ] Add the AWS SDK, R2, Sharp, and Upstash skill pointers to an upload or storage area `AGENTS.md`, with a short root pointer. The relevant skills are installed but are not yet listed in project context.
* [ ] Add the BullMQ skill pointer to a jobs or worker area `AGENTS.md`, with a short root pointer.
* [ ] Connect the optional Upstash and Context7 MCP servers in the developer's MCP configuration if live resource tools or documentation lookup are wanted. They are not connected by this design.
* [ ] Add owner and manager controls for the shop description, logo, and banner in the separate storefront settings slice.
* [ ] Design cart, checkout, payment, and payout behavior in the separate checkout decision.
* [ ] Configure both R2 buckets, Upstash, Railway Redis, and the production shop domain, then run real storage and worker smoke tests before enabling the feature gate.

## References

**Project sources**:

* `AGENTS.md`, the application stack, result type, feature gate, and build approach.
* `docs/specs/0005-printer-interface-and-data-model/index.md`, the parent printer feature contract.
* `lib/db/schema.ts`, current shop, product, variant, image, and upload intent tables.
* `lib/services/printer-service.ts`, current public shop reads and catalog pagination.
* `app/shops/[slug]/page.tsx`, current public shop rendering and image URL handling.
* `lib/domain/result.ts`, shared server result and field error shape.
* `upstash-ratelimit-js`, `.agents/skills/upstash-ratelimit-js/`.
* `infra-platform-aws-sdk`, `.agents/skills/infra-platform-aws-sdk/`.
* `cloudflare-r2`, `.agents/skills/cloudflare-r2/`.
* `bullmq-specialist`, `.agents/skills/bullmq-specialist/`.
* `sharp`, `.agents/skills/sharp/`.
* `drizzle-orm-patterns`, `.agents/skills/drizzle-orm-patterns/`.
* `nextjs16-skills`, `.agents/skills/nextjs16-skills/`.
* `neon-postgres`, `.agents/skills/neon-postgres/`.

**Practices and standards**:

* Least privilege and server side tenant authorization.
* Idempotent processing for retryable background work.
* Additive database migration and feature gated rollout.
* Public metadata must not expose private or unpublished data.

**Links**:

* Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
* Cloudflare R2 browser CORS: https://developers.cloudflare.com/r2/buckets/cors/
* Cloudflare R2 object lifecycle rules: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## Migration plan

**Strategy**: Feature gated additive migration.

**Phases**:

1. Inspect the current migration and database state. Confirm whether `product_image_uploads` has rows and no live code consumers. Record existing image keys and product references before changing the upload intent model.
2. Add nullable shop description and branding key columns, product description and version, nullable variant material and finish fields, and public derivative keys. Rename or migrate `product_image_uploads` into `asset_upload_intents`, backfilling existing rows as product photo intents. Preserve source keys and IDs.
3. Add validation indexes and constraints only after existing rows are checked. Do not treat legacy `mockup_url` values as real photos or public derivatives.
4. Deploy the new actions, routes, and worker with the printer feature gate off. Configure the private and public buckets, CORS, lifecycle, Upstash, and Railway Redis. Run migration and real storage checks on a non production branch first.
5. Enable the feature only after the database, authorization, worker, public delivery, and SEO smoke tests pass.

**Rollback**: Turn off `PRINTER_EXPERIENCE_ENABLED`, stop accepting new upload intents, and pause the worker after active jobs finish. Keep the additive schema and existing private objects. Do not run a destructive down migration. Correct data with a forward migration.

**Risks**: Existing upload intent rows may have expired temporary objects or incomplete state. R2 and database changes cannot be one atomic transaction, so each transition must be idempotent and recoverable. The worker and two buckets require separate deployment configuration before live uploads can be verified.
