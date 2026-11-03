# 0001. Stack and architecture

_Decision record for spec 0001. The build spec lives in `index.md`._

## Context

This repository holds only docs and the skill set; the application code lives on a related branch (about 4,500 lines, tested in demo mode). The scaffold adopts the roadmap's Appendix A layout and environment names exactly, so that branch ports in as the baseline rather than being rewritten. The builder is one person doing development, UI/UX, QA, and DevOps alone. The target is an MVP in front of real printers within one to two months. Budget is free or low cost tools. The market is Nigeria, with money stored in kobo (integer cents) and VAT at 7.5 percent. Storefronts must be publicly searchable. The platform is web first with PWA and partial offline support; native mobile is later. The builder has no canvas or graphics experience yet, and the priority is to build the editor and core components in house for learning rather than buying a paid SDK.

## Options considered

### Option 1: The chosen stack (Next.js, Neon, Drizzle, Better Auth, R2, Resend, Vercel, Railway, Paystack)

A single Next.js 16 web app using TypeScript and the App Router. Data lives in Neon Postgres, queried through Drizzle ORM. Accounts use Better Auth with its organization plugin for printer companies and employees. Files go to Cloudflare R2 through signed upload URLs. Email goes through Resend. Payments use Paystack subaccounts with split payments. The app runs on Vercel. Background jobs run on BullMQ with Redis on Railway. Rate limiting uses Upstash. Errors go to Sentry and funnels to PostHog.

**Pros**:
- One person can build and operate it; every tool is managed or serverless with scale to zero.
- Neon database branching gives a throw away database for tests and preview branches.
- Better Auth organizations map directly to the printer company model with admin plus employees.
- Paystack subaccounts with split payments settle the printer's share automatically.

**Cons**:
- Multiple managed services to keep track of (Neon, R2, Resend, Paystack, Railway, Upstash, Sentry, PostHog).
- Vercel functions have cold starts and short execution limits, fine for web requests but not for long running print file generation (that goes to the Railway worker).
- Better Auth is younger than some alternatives, so security upkeep is on the team.

### Option 2: Supabase-based stack (Supabase Postgres, Supabase Auth, Supabase Storage, Vercel)

A single Next.js app where Supabase provides PostgreSQL, authentication, file storage, and realtime subscriptions in one platform.

**Pros**:
- Fewer services to manage; auth, storage, and database are bundled.
- Built in row level security for tenant isolation.
- Realtime subscriptions for live order updates without extra infrastructure.

**Cons**:
- Less control over authentication; the roadmap already decided Better Auth with organizations for the printer company model, which Supabase Auth does not match as directly.
- Migrating away later is harder because auth and storage are coupled to Supabase.
- The roadmap records Supabase was already replaced by Neon and Better Auth, so this is a step backward.

### Option 3: Firebase-based stack (Firebase Auth, Firestore, Firebase Storage, Firebase Hosting)

A Google platform stack with NoSQL document storage, authentication, file storage, and hosting in one.

**Pros**:
- Truly single vendor; one console for everything.
- Strong free tier for early MVP.

**Cons**:
- Firestore is a document database, not relational; the domain has clear relationships (orders, items, customers, printers, products) that a relational database handles better with ACID guarantees and constraints.
- No relational joins or constraints means application code must enforce invariants that a relational database would enforce for free.
- Money stored as kobo with VAT and delivery calculations needs reliable transactions and constraints, which Firestore does not provide as naturally.

## Rationale

The solo builder needs the fewest moving parts to operate, which favors managed services with scale to zero over self hosting anything. A relational database is the right default because the domain has clear relationships (orders contain items, items belong to products and variants, customers belong to printers, payments split to subaccounts); Neon Postgres gives ACID guarantees and constraints that a document database would not. Better Auth organizations map directly to the printer company model (admin plus optional employees), which the roadmap already decided. Paystack subaccounts with split payments settle the printer's share automatically, matching the flat transaction fee revenue model. Vercel keeps hosting simple for one person; Railway adds only Redis and BullMQ for background jobs, nothing more. Every outside service sits behind an interface with an in memory twin, so most code can be tested without any account, which matters because the builder works in demo mode much of the time. (basis: boring technology principle, monolith first pattern, relational database default, interface with in memory twin pattern)

## References

**Project sources**:
- `presswise-roadmap.md` — the product roadmap v2 with all technology decisions (section 1)
- `docs/scope/scope.md` — feature #1 Stack and architecture, Foundation phase, Tracer Bullet approach, GA workflow tier
- `skills-lock.json` — the locked skill set for this project

**Practices & standards**:
- Boring technology: proven tools with large communities and well understood failure modes
- One decision per spec: this spec records the stack decision only; execution steps belong to the scaffold feature
- Interface with in memory twin: every outside service behind an interface so code can be tested without accounts
- Monolith first: a single Next.js app for storefront and dashboard, no service split until a real bottleneck forces it
- Relational database default: ACID guarantees and constraints for the relational domain
- Idempotency keys for money operations: payment confirmation must be idempotent

**Links** (web verified):
- Next.js AI agent guidance: https://nextjs.org/docs/app/guides/ai-agents
- vercel-labs agent skills: https://github.com/vercel-labs/agent-skills
- Drizzle ORM agent skill: https://llmbase.ai/skills/oakoss/drizzle-orm/
- Better Auth skills: https://github.com/better-auth/skills/blob/main/better-auth/best-practices/SKILL.md
- Better Auth MCP server: https://better-auth.com/docs/ai-resources/mcp
- Cloudflare skills: https://github.com/cloudflare/skills
- Cloudflare MCP servers: https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/
- Resend MCP server: https://resend.com/docs/mcp-server
- Resend agent skills: https://github.com/resend/resend-skills
- Vercel MCP server: https://vercel.com/docs/agent-resources/vercel-mcp
- Vercel agent skills: https://github.com/vercel-labs/agent-skills
- Paystack MCP server: https://paystack.com/docs/developer-tools/mcp-server/
- Paystack MCP server source: https://github.com/PaystackOSS/paystack-mcp-server
- Neon MCP access: https://neon.com/
- WCAG accessibility guidelines: https://www.w3.org/WAI/standards-guidelines/wcag/
- GDPR: https://eur-lex.europa.eu/legal-content/EN/TXT?uri=celex%3A32016R0679
- PCI DSS: https://www.pcisecuritystandards.org/standards/pci-dss
