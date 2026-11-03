# Verify: Stack & architecture · spec 0001 · updated 2026-10-27

_Steps derived from the scope's Done when for spec 0001: the stack is recorded in a spec and the empty scaffold boots locally and passes build. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] `npm run dev`, then visit http://localhost:3000 → the page shows the Presswise heading and the stack list, and the browser console has no errors → scope Done when (boots locally)
- [ ] Resize to a narrow phone width → the content stays readable with no sideways scrolling → scope Done when (boots locally)

## Commands

- [ ] `npm run build` → exits 0, and the route table lists `/` as static → scope Done when (passes build)
- [ ] `npm run typecheck` → exits 0, including on a clean `.next` folder (the script runs `next typegen` first) → scaffold convention (TypeScript strict)
- [ ] `npm run lint` → exits 0 → scaffold convention
- [ ] `node -v` → prints v24.x, matching `.nvmrc` and the `engines` field → spec 0001 Follow-up (pin Node LTS)

## Acceptance-criteria coverage

Spec 0001 has no numbered acceptance criteria. The scope Done when is the contract, and each step above maps to one half of it: the spec exists at `docs/specs/0001-stack-architecture/index.md`, and the scaffold boots and builds.
