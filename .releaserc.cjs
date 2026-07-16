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
