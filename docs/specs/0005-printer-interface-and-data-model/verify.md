# Verify: Printer account and shop onboarding · spec 0005 · updated 2026-10-31

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Visit `/printer` while signed out → the page redirects to `/sign-in?next=/printer` → AC-8, AC-17.
- [x] Follow the sign up link from that sign in page → the registration page keeps `/printer` as its destination and requests name, email, and password → AC-3.
- [ ] On a test database, create an account from that flow → the new account is signed in and redirected to private printer shop setup → AC-3.
- [ ] Submit a shop name, unique shop address, Nigerian state or FCT, and city → the shop is created as a private draft, the account receives owner membership, and the dashboard opens → AC-3, AC-16, AC-17.
- [ ] Submit a shop address that is already in use → the form shows an actionable error and creates no shop → AC-3.
- [x] Visit `/printer/onboarding` while signed out → the page redirects to sign in and preserves the onboarding destination → AC-3, AC-17.
- [ ] Visit `/printer/onboarding` while signed in with an active shop → the page redirects to `/printer` → AC-8, AC-17.
- [ ] Sign in with an invalid password → a safe error is shown and the requested in app destination is preserved → AC-17.
- [ ] Use an external `next` value such as `https://example.com` → sign in and sign up use the safe default destination instead → AC-17.

## Commands

- [x] `npm run typecheck` → passes.
- [x] `npm test -- tests/auth tests/printer` → 25 tests pass.
- [x] `npx eslint app/sign-in/page.tsx app/sign-up/page.tsx app/printer/onboarding/page.tsx lib/auth/redirects.ts lib/printer-dashboard.ts tests/auth/auth-redirects.test.ts` → passes.

## Acceptance-criteria coverage

AC-3 is covered by the registration and private shop setup steps. AC-8 is covered by signed in dashboard routing. AC-16 is covered by checking that a new shop remains a private draft. AC-17 is covered by authenticated routing, owner membership creation, safe redirects, and action error handling.

## Responsive interface checks · updated 2026-11-02

- [x] Visit `/printers` at 390px and 1440px → the filter form fits without horizontal scrolling. The empty state renders because there are no published shops to check for cards → AC-4.
- [x] Visit `/printer` on desktop, collapse the sidebar, refresh, then reopen it → the sidebar state is remembered and the navigation can always be reopened → AC-8.
- [x] Visit `/printer` on mobile and desktop → the bottom navigation appears only on mobile, and the desktop sidebar appears only on desktop → AC-8.
- [x] As an owner, open mobile More and check the extra pages and logout → Storefront, Team, Payouts, Settings, and Log out are available. Logging out returns to `/sign-in` → AC-8.
- [ ] Using a non owner account, open mobile More → Team, Payouts, and Settings are hidden → AC-11. Blocked, a non owner test account was not available.

## Commands · updated 2026-11-02

- [x] `npm test -- tests/auth tests/printer` → 31 tests pass.
- [x] `npm run typecheck` → passes.
- [x] `npx eslint components/printer-dashboard-shell.tsx app/auth/actions.ts app/printers/page.tsx tests/printer/printer-dashboard-shell.test.tsx` → passes with one existing Next image optimization warning.

## Runtime evidence · updated 2026-11-02

- `/printers` at a 390px viewport rendered the filter form and empty state. The browser reported a 375px layout viewport and 375px document width.
- `/printers` at a 1440px viewport rendered the filter form and empty state. The browser reported a 1440px layout viewport and 1440px document width, with six filter grid columns.
- `/printer` at a 1440px viewport rendered the desktop sidebar and hid the mobile navigation. After collapsing and reloading, the stored preference remained `collapsed`, and the Show menu control reopened the sidebar.
- `/printer` at a mobile viewport hid the desktop sidebar and displayed the four item bottom bar. The More menu showed Storefront, Team, Payouts, Settings, and Log out.
- Submitting Log out returned the shared browser to `/sign-in`.
- Signed out visits to `/printer` and `/printer/onboarding` redirected to sign in with their requested destinations. The sign up link preserved `/printer`; its form contained name, email, and password fields. An external `next` value was reduced to the safe `/me` destination in the sign up link.
- Browser page errors: none. Browser console errors: none.

AC-3 has partial flow evidence for safe redirection and registration fields, account creation and shop publication still require verification. AC-4 has responsive layout evidence only; published shop cards and filter results are blocked because there are no published shops. AC-8 has dashboard navigation and logout evidence. AC-11 non owner role visibility remains blocked.

## Assigned order asset access · updated 2026-11-17

- [ ] Seed `order_item_assets` rows for a product photo and a submitted design, each linked to an order item → the asset route returns image bytes only when the asset belongs to the requested order → AC-10, AC-CAT-12.
- [ ] Request an order asset as the owner, manager, assigned staff, unassigned staff, and a member of another shop → only the active shop owner or manager and staff assigned to that order receive image bytes → AC-10, AC-11, AC-17, AC-CAT-12.
- [ ] Inspect image responses and logs → object keys, signed B2 URLs, and credentials are not exposed → AC-CAT-12.

## Catalog schema migration · updated 2026-11-03

## Database checks

- [x] Apply the catalog migrations to the configured database → `asset_upload_intents` and `publication_transitions` exist, the legacy upload table is removed, and the new catalog columns and indexes are present → AC-CAT-3, AC-CAT-5, AC-CAT-7, AC-CAT-8, AC-CAT-13, AC-CAT-14.
- [x] Check the configured database upload intent count after conversion → there were no existing upload rows to convert → AC-CAT-8.
- [ ] On a database with legacy upload intents, apply the migration → each row keeps its identifiers, uploader, product, file metadata, and timestamps; status comes from `completed_at` or `expires_at` → AC-CAT-8, AC-CAT-10.
- [ ] On a disposable database, add two variants with the same product and case or whitespace normalized material and finish → the second insert is rejected, while draft variants may omit either value → AC-CAT-3, AC-CAT-5.
- [ ] On a disposable database, add two active publication transitions for one shop or product → the second transition is rejected, and a transition with both or neither target is rejected → AC-CAT-14, AC-CAT-17.

## Commands

- [x] `npm exec -- drizzle-kit check` → migration snapshots are valid.
- [x] `npm run typecheck` → passes.
- [x] `npm test -- tests/printer/printer-service.test.ts` → 17 tests pass, including the incomplete variant directory case.
- [x] `npm run lint -- lib/db/schema.ts lib/services/printer-service.ts` → passes with two existing unused variable warnings.

## Acceptance criteria coverage

These checks cover the schema support for AC-CAT-3, AC-CAT-5, AC-CAT-7, AC-CAT-8, AC-CAT-13, and AC-CAT-14. AC-CAT-10 still needs a migration test with existing upload rows. Upload validation, processing, audit, role checks, and public page behavior remain open for later build steps.
