# 0002. Convert the customer storefront prototype

**Date**: 2026-10-27
**Status**: Accepted

## Summary

This feature converts the existing customer storefront HTML into an accessible React experience at `/storefront` in the current Next.js app. It keeps the original shop design and customer journey, while using typed demo data and mock services instead of accounts, payments, or a database. The result is a working prototype that can later connect to the Presswise data model and real services.

## Context

The project has a single Next.js 16 app using TypeScript, React 19, and Tailwind CSS v4. Its home page is still a scaffold. A standalone HTML file contains a detailed customer storefront with product selection, customization, checkout, order tracking, and account screens. The HTML has its own styling and browser logic, so a direct copy would leave the experience difficult to maintain and test.

The product roadmap says that drinkware is not available, real payment and authentication integration is incomplete, and the final data model is still to be designed. The first conversion therefore needs to be explicit about what is demo behavior. It must not appear to create real accounts, collect card details, or preserve personal data. The shop route will be a temporary demo route, not a production printer URL.

> Premise note: The project scope defaults to a real end to end build, while this request intentionally starts with a front end demo. This is appropriate for converting a visual reference, but the result must not be presented as a production shop. Keep the temporary boundary visible and replace the demo model when the shared data model and database are ready.

## Requirements

**User stories**:
- As a customer, I want to browse and customize a print product so that I can see how the Presswise shopping flow will work.
- As a customer, I want to try checkout and tracking so that I can preview the whole order journey without making a real payment.
- As a developer, I want the demo data behind typed services so that I can replace the fixtures with real Presswise services later.

**Acceptance criteria**:
- **AC-1**: `/storefront` presents the HTML prototype's responsive shop experience, including the shop identity, catalog, category filters, search, light and dark themes, and customer views, while keeping the whole demo flow on one URL.
- **AC-2**: The catalog contains the six mockup products shown in the HTML, their displayed options, and prices in kobo. Customers can change product options and quantity and see the resulting price. Drinkware is not shown as an available product.
- **AC-3**: Customers can customize a product with an uploaded image, move and resize the image, add optional text, change product options, and switch between front and back views where supported. The preview reflects the selected mock product and design. Upload checks follow the roadmap: PNG, JPEG, or WebP, up to 2.5 MB, at least 200 px, with a warning below 600 px.
- **AC-4**: Customers can review checkout details, choose pickup or a delivery option, see item cost, delivery, demo VAT, and total in kobo, and submit a simulated successful payment without entering card details or contacting Paystack.
- **AC-5**: Customers can view a confirmation and track seeded demo orders or an order created in the current page session. The clearly marked demo printer controls can advance eligible statuses or decline before production with a required reason. Tracking shows status history and any tracking number, decline reason, or refund state.
- **AC-6**: Sign in, sign up, email verification, password reset, and account screens remain available as simulations. They warn against using real credentials, validate only in the browser, and never send, store, or log passwords or create a real account.
- **AC-7**: Catalog, account, order, payment simulation, lookup, and status actions use typed asynchronous mock services. Product fixtures, customer details, image previews, demo identity, and orders remain in memory only. Reloading clears them. A failed action shows an inline error, preserves current work, and can be retried.
- **AC-8**: The route is marked `noindex`. The customer flow works with keyboard, touch, and narrow screens, has visible focus and labelled controls, and includes keyboard alternatives for moving and zooming the design.

## Options considered

### Option 1: Keep the HTML as the working prototype

Continue using the standalone HTML and leave the Next.js app as a scaffold.

**Pros**:
- No conversion work is needed.
- The current prototype remains untouched.

**Cons**:
- The customer journey remains separate from the chosen application stack.
- The single file is harder to extend, test, and connect to the future data model.

### Option 2: Convert the flow into the existing Next.js app

Build the customer flow as React components under a dedicated feature folder and expose it at `/storefront`.

**Pros**:
- Reuses the selected framework, language, and test setup.
- Keeps the demo separate from the home page and future printer shop URLs.
- Makes a later swap from mock services to real services practical.

**Cons**:
- Requires translating the original browser logic and styles into React.
- Global styles and client side state need careful boundaries so they do not affect other app routes.

### Option 3: Create a second Next.js app

Build and operate a new standalone app just for the storefront conversion.

**Pros**:
- Creates a strong deployment boundary.
- Allows independent dependencies and release timing.

**Cons**:
- Duplicates framework configuration and build maintenance for a demo route.
- Splits a product whose chosen architecture is one Next.js app.

## Decision

**Chosen option**: Option 2: Convert the flow into the existing Next.js app.

Build a grouped customer storefront feature in the current app, served at `/storefront`. Use React and TypeScript, Tailwind CSS v4 for ordinary layout, and scoped custom CSS for the editor and close visual details. Use an asynchronous in memory service adapter backed by typed fixtures. Keep the route and all demo data isolated from existing production service boundaries.

The original HTML loads Space Grotesk and IBM Plex Sans from Google Fonts. Keep those font requests for closer visual fidelity, with local system fallbacks. This adds a third party request when the storefront is used.

## Rationale

The current app already provides the selected framework, the testing tools, and a single app architecture. The user chose a route in that app, not a second application. A dedicated feature folder and `/storefront` route keep the prototype isolated without creating a second project to install, build, and deploy.

The demo has no agreed database schema yet. An asynchronous service adapter preserves a replaceable boundary without pretending that mock HTTP endpoints or process memory are a production backend. The user chose to keep all data in memory and connect to the shared data model and database later. The demo must therefore reset on reload and must not represent simulated account or payment actions as real.

The original HTML already contains the visual direction and mock product artwork. Translating its interactions into typed components is safer than retaining direct DOM mutation in a growing single file. Reusing the existing design is also smaller than a redesign and lets the work focus on behavior, accessibility, and a future service replacement.

## Feature design

**Data model sketch**:

| Entity | Fields | Relationships and constraints |
|---|---|---|
| `Product` | `id`, `name`, `category`, `priceKobo`, `mockup`, `sizes`, `colors`, `materials`, `finishes`, `hasBackView` | One product can be selected by many transient designs. Values come from typed fixture data. |
| `Design` | `id`, `productId`, `side`, `imagePreview`, `imagePosition`, `imageSize`, `zoom`, `text`, `selectedOptions`, `quantity` | Belongs to one product. Image preview is a browser object URL and remains in memory only. One design is used by one demo order. |
| `CheckoutDetails` | `name`, `email`, `phone`, `address`, `deliveryMethod`, `designApproved` | Transient details attached to one order. Address fields are optional for pickup. |
| `DemoOrder` | `orderNumber`, `designSummary`, `checkoutDetails`, `subtotalKobo`, `deliveryKobo`, `vatKobo`, `totalKobo`, `paymentResult`, `status`, `trackingNumber`, `declineReason` | Contains one product and design. Order numbers are unique within the current in memory service instance. |
| `OrderEvent` | `status`, `occurredAt`, `note` | Many events belong to one demo order and are displayed in chronological order. |
| `DemoIdentity` | `displayName`, `email`, `demoOnly` | Optional in memory identity for account screens. No password or verification secret is retained. |

These are storefront only demo types, not the Presswise database schema. Product fixture fields should match the mockups and options in the HTML. Do not invent a persistent product or account schema here.

**State transitions**:

- Payment simulation creates a `paid` order directly. No card data is requested.
- `paid` → `in_production` → `shipped` → `delivered`.
- `paid` → `rejected` → `refunded`.
- `pending_payment` → `cancelled` is represented only if the demo exposes cancellation before the payment simulation completes.
- The demo printer cannot decline after production starts. A decline requires a non empty customer visible reason.
- Tracking number is required to mark a shipped order. Pickup orders can be marked delivered or collected without one.

**API surface**:

These are client side service methods, not HTTP endpoints or server actions.

| Service method | Inputs | Outputs | Auth | Key errors |
|---|---|---|---|---|
| `listProducts` | optional category and search text | matching `Product` fixtures | public demo | fixture load failure |
| `signInDemo` | email and transient password input | demo identity | local simulation only | invalid email or demo validation error |
| `signUpDemo` | name, email, transient password input, terms acceptance | demo verification state | local simulation only | invalid fields or terms not accepted |
| `verifyDemoCode` | email and code | demo identity | local simulation only | invalid or expired demo code |
| `requestDemoPasswordReset` | email | demo reset state | local simulation only | invalid email or demo validation error |
| `resetDemoPassword` | email, code, transient new password input | demo identity | local simulation only | invalid code or password |
| `createDemoOrder` | `Design`, `CheckoutDetails` | confirmed `DemoOrder` | public demo | invalid form, invalid design, or mock service failure |
| `findDemoOrder` | order number and email | matching `DemoOrder` | public demo, both values required | order not found or mock service failure |
| `advanceDemoOrder` | order number, requested status, optional tracking number | updated `DemoOrder` | demo control only | invalid transition, missing tracking number, or order not found |
| `declineDemoOrder` | order number and required reason | rejected `DemoOrder` | demo control only | empty reason, invalid status, or order not found |

No method sends a request to an external service. Account methods must not retain, log, or send password values. Mock service errors are surfaced to the UI and do not clear unrelated page state.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Catalog | Product names, categories, prices, mockups, and options | Typed fixtures transcribed from the existing HTML |
| Search and filters | Visible products | Fixture values plus current search text and category selection |
| Customizer | Product preview, chosen options, side, uploaded image, text, and image geometry | Selected product fixture and current in memory `Design` state |
| Upload validation | File type, size, pixel dimensions, and low resolution warning | Browser `File` metadata and decoded image dimensions; roadmap limits in this spec |
| Price summary | Unit price, quantity, subtotal | Product fixture, selected option adjustments, quantity, and the HTML pricing rules |
| Checkout | Delivery fee, VAT, total, and estimated timing | Demo delivery configuration transcribed from the HTML; VAT rate of 7.5 percent and enabled demo setting from the HTML; integer kobo arithmetic |
| Payment confirmation | Order number and simulated payment result | In memory demo order service; unique number generated by the service; payment outcome fixed to simulated success |
| Tracking | Current status, event history, tracking number, decline reason, and refund state | In memory demo order and its `OrderEvent` list, or typed seeded demo orders |
| Account screens | Demo identity and local validation result | Current in memory identity and input validation; no real authentication source |

The HTML's delivery fees and VAT setting are prototype values, not verified printer settings. Show them as demo values. Never use them to charge a customer.

**Key invariants**:

- All prices and totals are integer kobo. Displayed naira values are formatted from kobo.
- Only one product and one design belong to each order.
- Changing an option or quantity recalculates the total from fixture values. Do not trust a previously displayed total.
- Uploaded image previews use browser memory only. Revoke object URLs when a file is replaced or the editor unmounts.
- Reloading resets the demo. Do not use cookies, local storage, session storage, IndexedDB, or a database for demo state.
- Mock payment always identifies itself as simulated and never collects card details or contacts Paystack.
- Account forms are simulations. Password values are discarded after local validation and must never be persisted, transmitted, or logged.
- Demo status changes follow the transition rules above. Declines require a reason and create the appropriate refund state.

**Security model**:

The storefront is publicly accessible and has no real authentication or authorization. Clearly label printer status controls as demo controls. Do not expose server credentials or call payment, email, storage, or auth providers. Do not log checkout contact details, uploaded image data, or password inputs. Browser upload checks improve feedback only and are not security validation for production uploads. Use escaped React text rendering for user supplied text and decline reasons.

**Configuration required**:

- No new environment variables, credentials, or external service configuration.
- Google Fonts are requested by the browser for this route, with local system fallback.

**Critical test scenarios**:

- Happy path: browse a fixture product, customize its mockup, complete demo checkout, and see a paid confirmation, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, and **AC-5**.
- Upload failure: reject an unsupported, oversized, or too small image with a useful message and preserve the current design, verifies **AC-3** and **AC-7**.
- Pricing: changing product options, quantity, delivery, or VAT inputs updates a correctly rounded integer kobo total, verifies **AC-2** and **AC-4**.
- Tracking: find a seeded order and advance an eligible order; reject a decline without a reason or a shipment without a tracking number, verifies **AC-5** and **AC-7**.
- Account privacy: complete a simulated account action and verify the outcome does not send or retain password values, verifies **AC-6**.
- Accessibility: complete catalog selection, upload, image positioning, checkout, and tracking with keyboard only at mobile and desktop viewport sizes, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, and **AC-8**.
- Reset behavior: reload after creating a demo order and verify the newly created order, identity, checkout details, and uploaded image are gone, verifies **AC-7**.
- Search metadata: verify the storefront response is marked `noindex`, verifies **AC-8**.

## Build plan

1. Add typed storefront models, product fixtures, demo pricing configuration, and an asynchronous in memory service adapter. Keep the adapter browser only and keep its failure results explicit, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-6**, and **AC-7**.
2. Add the isolated `/storefront` route, responsive shop shell, theme control, searchable and filterable product catalog, and `noindex` metadata. Preserve the existing homepage, satisfies **AC-1**, **AC-2**, and **AC-8**.
3. Convert the HTML product mockups and editor into accessible React components with image validation, image positioning, zoom, optional text, product options, and front or back previews. Keep uploaded image data in memory, satisfies **AC-2**, **AC-3**, and **AC-7**.
4. Build the order summary, delivery and pickup selection, integer kobo totals, checkout validation, simulated payment, and order confirmation through the mock service, satisfies **AC-4** and **AC-7**.
5. Add seeded tracking examples, lookup, status history, and clearly marked demo printer controls for allowed transitions, tracking numbers, decline reasons, and refunds, satisfies **AC-5** and **AC-7**.
6. Convert the account screens to safe local simulations, including form validation, visible demo warnings, verification and reset states, and no password retention, satisfies **AC-6** and **AC-7**.
7. Finish keyboard and touch behavior, responsive layouts, visible errors, focus handling, reduced motion support, and automated coverage for the full flow and privacy boundaries, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, and **AC-8**.

## Consequences

**Positive**:
- The customer prototype runs inside the chosen application and can use the existing test suite.
- Typed fixtures and service methods provide a clear replacement point when the shared data model and real backend are ready.
- The original visual direction and full customer journey remain available without claiming the incomplete integrations are live.

**Negative / tradeoffs**:
- The demo does not persist orders or identities. Every page reload starts over.
- The mock service is not suitable for production, multiple users, or multiple server instances.
- Loading fonts from Google makes part of the design depend on a third party request.
- Translating the editor and status logic creates more work than embedding the HTML, but avoids continuing to grow direct DOM manipulation.

**Neutral**:
- The existing homepage remains unchanged. The demo uses `/storefront` until the public printer route is ready.
- The six product fixtures and checkout amounts are illustrative values copied from the prototype, not canonical catalog or tax configuration.

## Follow-up

- [ ] Replace the storefront demo types and fixtures with the agreed shared data model and database after that design is complete.
- [ ] Replace mock account actions with the planned Better Auth services and screens when authentication is ready.
- [ ] Replace simulated payment and order mutations with real server side order and Paystack flows only after their service work is verified.
- [ ] Decide whether the final public printer storefront should use `/{printer}` and remove or retain `/storefront` as a demo route.
