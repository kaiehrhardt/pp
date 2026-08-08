// Enforces the Conventional Commits format documented in AGENTS.md, matching the
// `conventionalcommits` preset .releaserc.cjs configures for semantic-release's
// commit-analyzer/release-notes-generator — so a commit that passes this lint is
// guaranteed to be interpreted by the release tooling the way its author intended.
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
