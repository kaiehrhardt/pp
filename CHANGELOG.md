## [2.0.1](https://github.com/kaiehrhardt/pp/compare/2.0.0...2.0.1) (2026-07-19)


### Bug Fixes

* **chart:** scope the app Service selector to the app's own pods ([f022a0f](https://github.com/kaiehrhardt/pp/commit/f022a0f63b834156dc604b002fdbec26da5897c1))

# [2.0.0](https://github.com/kaiehrhardt/pp/compare/1.8.1...2.0.0) (2026-07-19)


* feat!: back room state with Turso and cross-pod Redis pub/sub for horizontal scaling ([9771693](https://github.com/kaiehrhardt/pp/commit/9771693e5183a0fc108646b44033beb9b0c03cfc)), closes [#26](https://github.com/kaiehrhardt/pp/issues/26)


### Features

* add session evaluation widget, fix reaction picker stacking ([e0cca72](https://github.com/kaiehrhardt/pp/commit/e0cca72b33048829faf97cc0f3b46850b2fa3206))


### BREAKING CHANGES

* the app now requires a reachable Redis (REDIS_URL) to boot at
all, in every environment including local dev and tests — there is no in-memory
fallback. TURSO_DATABASE_URL defaults to a local file (file:./dev.db) so Turso
itself has no hard external dependency, but Redis does. Existing Helm deployments
must set redis.enabled/sqld.enabled or supply external TURSO_DATABASE_URL/
TURSO_AUTH_TOKEN/REDIS_URL via extraEnv before upgrading, or the app will
crash-loop on boot.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBPvypL1TAJcsNWMM4VRwR

## [1.8.1](https://github.com/kaiehrhardt/pp/compare/1.8.0...1.8.1) (2026-07-17)


### Bug Fixes

* **ci:** don't require plugin verification for helm-unittest and run CI push trigger only on main ([efa5a5f](https://github.com/kaiehrhardt/pp/commit/efa5a5f4aaab0b27bc8ace663aea45bf66c55cf3))

# [1.8.0](https://github.com/kaiehrhardt/pp/compare/1.7.0...1.8.0) (2026-07-17)


### Features

* add session trophy leaderboard ([ebb47cf](https://github.com/kaiehrhardt/pp/commit/ebb47cfa25967e13ff886bad402530ab57613153))
* award trophies for mini-game wins ([accbe58](https://github.com/kaiehrhardt/pp/commit/accbe5813d1ed70bbf3b5154bcfffe98d56d4e2b))
* let participants choose an emoji avatar ([3a8189e](https://github.com/kaiehrhardt/pp/commit/3a8189eaf884f52eede93e7e59d49956f9d4340d))
* scale poker table and participant tiles with window size ([6dd223d](https://github.com/kaiehrhardt/pp/commit/6dd223dd0389bc94c030bbad86d021ec86f46225))

# [1.7.0](https://github.com/kaiehrhardt/pp/compare/1.6.2...1.7.0) (2026-07-16)


### Features

* add Helm chart with tests, PR validation, and automated GHCR release ([e82a121](https://github.com/kaiehrhardt/pp/commit/e82a12130568ddd85b9d956dd6dfb1db2b51db31))
* add mini-games (unanimous-vote confetti, guess the average, RPS duels) ([e572563](https://github.com/kaiehrhardt/pp/commit/e5725637f01eb670dddce707872ab003f7446acf))

## [1.6.2](https://github.com/kaiehrhardt/pp/compare/1.6.1...1.6.2) (2026-07-16)


### Bug Fixes

* text-only language toggle and fix toolbar overlap ([60bf801](https://github.com/kaiehrhardt/pp/commit/60bf8015213a49f2485a2e1bbb63bc9f9cf43a53))

## [1.6.1](https://github.com/kaiehrhardt/pp/compare/1.6.0...1.6.1) (2026-07-16)


### Bug Fixes

* **deps:** pin dependencies ([55c06b7](https://github.com/kaiehrhardt/pp/commit/55c06b7dc1937faa1f7984c3a40fe45f4783646e))

# [1.6.0](https://github.com/kaiehrhardt/pp/compare/1.5.0...1.6.0) (2026-07-16)


### Features

* add German/English internationalization ([db79b11](https://github.com/kaiehrhardt/pp/commit/db79b117838234b2b5c02a85461eecfbc904eee2))

# [1.5.0](https://github.com/kaiehrhardt/pp/compare/1.4.0...1.5.0) (2026-07-16)


### Features

* **ci:** enforce test coverage and upload lcov report ([288b326](https://github.com/kaiehrhardt/pp/commit/288b326ea07fb5bb0a4389904e5d3c912ed8b7bb))

# [1.4.0](https://github.com/kaiehrhardt/pp/compare/1.3.0...1.4.0) (2026-07-16)


### Bug Fixes

* annotate BunRequest type for /api/rooms/:id to satisfy type check ([ac69e2a](https://github.com/kaiehrhardt/pp/commit/ac69e2a692fbe8003e9c700ee720c56f25067b24))


### Features

* show a dedicated "room full" message in the client ([4f9c41c](https://github.com/kaiehrhardt/pp/commit/4f9c41c2198422f3a2d828f391d582e4c7b88547))

# [1.3.0](https://github.com/kaiehrhardt/pp/compare/1.2.1...1.3.0) (2026-07-16)


### Features

* expand avatar color palette and cap rooms at 15 participants ([20339ed](https://github.com/kaiehrhardt/pp/commit/20339ed22150d3f0c1f652a261d471305e0b7eea))

## [1.2.1](https://github.com/kaiehrhardt/pp/compare/1.2.0...1.2.1) (2026-07-16)


### Bug Fixes

* **deps:** pin dependencies ([a9ccfcc](https://github.com/kaiehrhardt/pp/commit/a9ccfcc952a9c70563d7bb003fc94266c6a8a12a))

# [1.2.0](https://github.com/kaiehrhardt/pp/compare/1.1.0...1.2.0) (2026-07-16)


### Features

* **ci:** build/test on feature branches and PRs instead of main ([4ea2fe0](https://github.com/kaiehrhardt/pp/commit/4ea2fe001ed0038eafa0f4135a94664a68e3f892))

# [1.1.0](https://github.com/kaiehrhardt/pp/compare/1.0.0...1.1.0) (2026-07-16)


### Features

* add room chat and animate the card reveal ([9ebc829](https://github.com/kaiehrhardt/pp/commit/9ebc829bf4848e5f04167cbc7d0e85e23bd54c83))
* surface changelog in-app, add license and dependency automation ([3b4fa40](https://github.com/kaiehrhardt/pp/commit/3b4fa400e14a287234dcf836126d1d57a1cc1ce4))

# 1.0.0 (2026-07-15)


### Features

* host kick, visual redesign, and release automation ([509f51b](https://github.com/kaiehrhardt/pp/commit/509f51b6f9558590fa5b9f787d6de95256a2190b))
* initial content ([9365e8e](https://github.com/kaiehrhardt/pp/commit/9365e8e146f93bd17020599f09501ac74cb1d037))
