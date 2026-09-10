import { defineConfig } from 'vitepress'

/**
 * The Pitta documentation site.
 *
 * `docs/` holds two audiences at once. The prose under `guide/`, `recipes/` and
 * `drivers/` is written for someone using or extending Pitta; the numbered
 * files (`00-OVERVIEW.md` … `12-ENGINE-REDIS.md`) are the design record, which
 * is public on purpose — the driver contract and the security requirements are
 * more useful to a contributor than a summary of them would be. Both are in the
 * nav, kept apart.
 *
 * GitHub Pages serves from a subpath, so the base is taken from the
 * environment: `DOCS_BASE=/pitta-db/ pnpm run docs:build`.
 */
export default defineConfig({
  title: 'Pitta',
  description: 'Database client for VS Code — PostgreSQL, MySQL, SQL Server, SQLite, MongoDB, Redis.',
  base: process.env.DOCS_BASE ?? '/',
  lang: 'en-GB',
  cleanUrls: true,
  lastUpdated: true,

  // The design record links to files by their repository path. Ignoring dead
  // links wholesale would hide real ones, so only that shape is allowed.
  ignoreDeadLinks: [/^\.\.\//, /^packages\//, /^test\//],

  head: [
    ['link', { rel: 'icon', href: 'https://raw.githubusercontent.com/shresthadeepesh/pitta-db/main/resources/icon.png' }],
  ],

  themeConfig: {
    logo: 'https://raw.githubusercontent.com/shresthadeepesh/pitta-db/main/resources/icon.png',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Recipes', link: '/recipes/' },
      { text: 'Writing a driver', link: '/drivers/authoring' },
      { text: 'Design', link: '/00-OVERVIEW' },
      {
        text: 'Install',
        items: [
          { text: 'Visual Studio Marketplace', link: 'https://marketplace.visualstudio.com/items?itemName=DipeshShrestha.pitta-db' },
          { text: 'Open VSX', link: 'https://open-vsx.org/extension/DipeshShrestha/pitta-db' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Using Pitta',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Connections', link: '/guide/connections' },
            { text: 'The data grid', link: '/guide/data-grid' },
            { text: 'Query mode', link: '/guide/query-mode' },
            { text: 'Stored routines', link: '/guide/routines' },
            { text: 'Safety and guards', link: '/guide/safety' },
            { text: 'Remote-SSH, WSL, containers', link: '/guide/remote' },
            { text: 'Settings', link: '/guide/settings' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        { text: 'Connection recipes', link: '/recipes/' },
      ],

      '/recipes/': [
        {
          text: 'Connection recipes',
          items: [
            { text: 'Overview', link: '/recipes/' },
            { text: 'Docker and Compose', link: '/recipes/docker' },
            { text: 'Amazon RDS and Aurora', link: '/recipes/rds' },
            { text: 'Google Cloud SQL', link: '/recipes/cloud-sql' },
            { text: 'Azure Database and Azure SQL', link: '/recipes/azure' },
            { text: 'Supabase', link: '/recipes/supabase' },
            { text: 'Neon', link: '/recipes/neon' },
            { text: 'Through an SSH bastion', link: '/recipes/ssh' },
            { text: 'MongoDB and Atlas', link: '/recipes/mongodb' },
            { text: 'Redis, Sentinel, Cluster', link: '/recipes/redis' },
            { text: 'SQLite', link: '/recipes/sqlite' },
          ],
        },
      ],

      '/drivers/': [
        {
          text: 'Extending Pitta',
          items: [
            { text: 'Writing a driver', link: '/drivers/authoring' },
            { text: 'The conformance kit', link: '/drivers/conformance' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Driver API contract', link: '/03-DRIVER-API' },
            { text: 'Engine model (v2)', link: '/10-ENGINE-MODEL' },
          ],
        },
      ],

      '/': [
        {
          text: 'Design record',
          items: [
            { text: '00 — Overview', link: '/00-OVERVIEW' },
            { text: '01 — Functional spec', link: '/01-SPEC-FUNCTIONAL' },
            { text: '02 — Architecture', link: '/02-ARCHITECTURE' },
            { text: '03 — Driver API', link: '/03-DRIVER-API' },
            { text: '04 — Data model', link: '/04-DATA-MODEL' },
            { text: '05 — Security', link: '/05-SECURITY' },
            { text: '06 — Roadmap', link: '/06-ROADMAP' },
            { text: '07 — Tasks', link: '/07-TASKS' },
            { text: '08 — Testing', link: '/08-TESTING' },
            { text: '09 — Decisions (ADRs)', link: '/09-DECISIONS' },
            { text: '10 — Engine model', link: '/10-ENGINE-MODEL' },
            { text: '11 — MongoDB', link: '/11-ENGINE-MONGODB' },
            { text: '12 — Redis', link: '/12-ENGINE-REDIS' },
            { text: '13 — Release', link: '/13-RELEASE' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/shresthadeepesh/pitta-db' }],

    editLink: {
      pattern: 'https://github.com/shresthadeepesh/pitta-db/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message: 'MIT licensed. No paid tier, no feature held back.',
      copyright: 'Pitta',
    },
  },
})
