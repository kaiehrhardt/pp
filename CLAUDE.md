
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs actually used in this repo

- `Bun.serve()` with `routes` + `websocket`, all wired up in `src/backend/index.ts` — HTTP endpoints, the WebSocket upgrade, and serving the frontend all go through this one server. Don't introduce `express`.
- HTML imports: `src/backend/index.ts` imports `src/frontend/index.html` directly, which pulls in `index.tsx`/`styles.css`; Bun's bundler transpiles and bundles it. Don't add `vite` or a separate frontend build step.
- Browser-built-in `WebSocket` on the client (`src/frontend/useRoomSocket.ts`). Don't add `ws`.
- `Bun.file()` to read `CHANGELOG.md` (`src/backend/changelog.ts`). Prefer it over `node:fs` readFile/writeFile.
- No database. Per ADR-0001 (`docs/adr/0001-in-memory-single-instance-state.md`), all room state lives in memory in a single process — that's a deliberate tradeoff (simplicity over restart-persistence/horizontal scaling), not an oversight. Don't reach for `bun:sqlite`, `Bun.redis`, `Bun.sql`, or any other persistence layer without first flagging that it contradicts this ADR.

## Testing

Use `bun test`. Tests are colocated with the code they cover (`*.test.ts` next to the source, e.g. `src/backend/domain/room.test.ts`, `src/frontend/linkify.test.ts`). Typecheck the whole project with `bunx tsc --noEmit`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — `semantic-release` (`.releaserc.cjs`) parses commits on `main` to cut releases:

- `fix: ...` → patch release
- `feat: ...` → minor release
- A `BREAKING CHANGE:` footer (or `!` after the type, e.g. `feat!:`) → major release
- Other types (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`, …) don't trigger a release

This only fires on pushes to `main` (see `.github/workflows/release.yml`); commits on feature branches just need to follow the format so the eventual merge/release picks them up correctly.

A PR must contain exactly one commit. Don't rely on GitHub's squash-merge button — instead rebase/squash the feature branch itself down to a single commit (`git rebase -i`) before merging, so the branch already has one commit when the PR is opened/updated. The PR title must match that commit's message and follow Conventional Commits (e.g. `fix: ...`, `feat: ...`, `feat!: ...`), since that's what `semantic-release` sees on `main`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `kaiehrhardt/pp`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
