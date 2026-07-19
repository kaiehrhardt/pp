
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
- Room state lives in Turso (libSQL) via `@libsql/client` (`src/backend/domain/db.ts`, `store.ts`), not in-process memory — per ADR-0003 (`docs/adr/0003-turso-and-redis-for-horizontal-scaling.md`), which supersedes ADR-0001 for this subsystem. `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` default to a local file (`file:./dev.db`) so local dev/tests need no external account. Cross-pod WebSocket fan-out goes through `Bun.redis` pub/sub (`src/backend/redis/pubsub.ts`, `src/backend/ws/roomChannel.ts`), reading `REDIS_URL`. Duels are the one exception: per ADR-0003 they stay ephemeral, in-process, never written to Turso — don't "fix" that into a `duels` table. Outside this subsystem, the general ADR-0001 spirit still applies: flag before reaching for another persistence layer.

## Testing

Use `bun test`. Unit/integration tests are colocated with the code they cover (`*.test.ts` next to the source, e.g. `src/backend/domain/room.test.ts`, `src/frontend/linkify.test.ts`). End-to-end tests live under `e2e/` (`*.e2e.test.ts`) since they exercise the whole app rather than one module — they drive the real server through Playwright's Chromium (needs `bunx playwright install chromium` once, plus a reachable Redis like the other integration tests). Typecheck the whole project with `bunx tsc --noEmit`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — `semantic-release` (`.releaserc.cjs`) parses commits on `main` to cut releases:

- `fix: ...` → patch release
- `feat: ...` → minor release
- A `BREAKING CHANGE:` footer (or `!` after the type, e.g. `feat!:`) → major release
- Other types (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`, …) don't trigger a release

This only fires on pushes to `main` (see `.github/workflows/release.yml`); commits on feature branches just need to follow the format so the eventual merge/release picks them up correctly.

A PR must contain exactly one commit. Don't rely on GitHub's squash-merge button — instead rebase/squash the feature branch itself down to a single commit (`git rebase -i`) before merging, so the branch already has one commit when the PR is opened/updated. The PR title must match that commit's message and follow Conventional Commits (e.g. `fix: ...`, `feat: ...`, `feat!: ...`), since that's what `semantic-release` sees on `main`.

## README maintenance

Before finishing any change, check whether `README.md` still matches reality — new/changed features, scripts, prerequisites, or UI flows described in the "Try it locally" walkthrough. Update it in the same commit/PR if it's out of date; otherwise leave it alone.

The "Architecture" section's Mermaid diagrams are a structural picture of the system (components, deployment topology, cross-pod sequence flows, data model), not implementation detail — if a change adds/removes a component, changes how state is persisted or relayed (e.g. touches ADR-0003's territory), or alters the Turso schema, update the relevant diagram(s) in the same commit/PR. Validate edits by actually rendering them (e.g. `bunx @mermaid-js/mermaid-cli`) rather than eyeballing the syntax — Mermaid's sequence-diagram parser chokes on HTML-entity-escaped angle brackets (`&lt;id&gt;`) even though flowcharts tolerate them, so use plain `<id>` if a diagram needs that.

The screenshots under `docs/screenshots/` (`landing.jpg`, `room-voting.jpg`, `room-revealed.jpg`, `rps-duel.jpg`, `leaderboard.jpg`, `session-evaluation.jpg`, `chat.jpg`, `room-full.jpg`) are real app captures, not mockups — if a change alters what those screens visually show (layout, new UI elements, avatars, toolbar, etc.), regenerate the affected file(s): run `bun run dev`, drive the app with Playwright against the local Chromium at `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (`chromium-cli` if available), and overwrite the existing files in place (same filenames/crop, 1280×960) rather than adding new ones. If a genuinely new use case is worth its own screenshot (as opposed to an existing one just going stale), add it under a new filename and reference it from the README's screenshot table too.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `kaiehrhardt/pp`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
