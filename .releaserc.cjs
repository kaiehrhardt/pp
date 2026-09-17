// Do not set `preset: 'conventionalcommits'` here (conventional-changelog-
// conventionalcommits). It depends on @conventional-changelog/template,
// which only renders correctly under conventional-changelog-writer@9+, but
// @semantic-release/commit-analyzer and @semantic-release/release-notes-
// generator's stable releases still pin conventional-changelog-writer@^8
// (no stable release bridges that gap yet — only unreleased betas do). That
// preset silently produced empty changelogs/release notes for every
// release from 3.0.0 through 3.0.3, then started hard-crashing the Release
// workflow once a patch bump made the mismatch fatal instead of silent.
// Both plugins default to the `angular` preset, which recognizes a
// `BREAKING CHANGE:` footer (not `type!: subject` shorthand) for major
// releases — see AGENTS.md.

module.exports = {
  branches: ['main'],
  tagFormat: '${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: false }],
    [
      'semantic-release-helm3',
      {
        chartPath: 'charts/pp',
        registry: 'ghcr.io/kaiehrhardt/charts',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md', 'charts/pp/Chart.yaml'],
        message: 'chore(release): ${nextRelease.version}',
      },
    ],
    '@semantic-release/github',
  ],
};
