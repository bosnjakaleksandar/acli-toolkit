export default {
  title: "A-CLI",
  description: "Scaffold new projects and pull existing WordPress sites from staging into Docker or Lando — safely, pull-only.",
  base: "/acli-toolkit/",
  lastUpdated: true,

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/acli-toolkit/logo.svg" }]],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "A-CLI",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Profiles", link: "/guide/profiles" },
      { text: "Reference", link: "/reference/commands" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Create a project", link: "/guide/create" },
          { text: "Profiles", link: "/guide/profiles" },
          { text: "Import & pull WordPress", link: "/guide/import-and-pull" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Commands", link: "/reference/commands" },
          { text: "Configuration", link: "/reference/configuration" },
        ],
      },
      {
        text: "Help",
        items: [{ text: "FAQ & troubleshooting", link: "/faq" }],
      },
    ],

    outline: [2, 3],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/bosnjakaleksandar/acli-toolkit" }],
    editLink: {
      pattern: "https://github.com/bosnjakaleksandar/acli-toolkit/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "A-CLI Developer Toolkit",
    },
  },
};
