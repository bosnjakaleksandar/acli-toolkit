const GITHUB = "https://github.com/bosnjakaleksandar/acli-toolkit";

// English lives at the root, Serbian (Latin script) under /sr/. VitePress adds
// the language switcher to the nav once there is more than one locale.
const en = {
  label: "English",
  lang: "en-US",
  description: "Scaffold new projects and pull existing WordPress sites from staging into Docker or Lando — safely, pull-only.",
  themeConfig: {
    nav: [
      { text: "Walkthrough", link: "/guide/walkthrough" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Profiles", link: "/guide/profiles" },
      { text: "Reference", link: "/reference/commands" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Walkthrough: zero to local site", link: "/guide/walkthrough" },
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
    editLink: {
      pattern: `${GITHUB}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "A-CLI Developer Toolkit",
    },
  },
};

const sr = {
  label: "Srpski",
  lang: "sr-Latn",
  link: "/sr/",
  description: "Pokreni nove projekte i povuci postojeće WordPress sajtove sa staging servera u Docker ili Lando — bezbedno, samo pull.",
  themeConfig: {
    nav: [
      { text: "Vodič korak po korak", link: "/sr/guide/walkthrough" },
      { text: "Uputstvo", link: "/sr/guide/getting-started" },
      { text: "Profili", link: "/sr/guide/profiles" },
      { text: "Referenca", link: "/sr/reference/commands" },
    ],
    sidebar: [
      {
        text: "Uputstvo",
        items: [
          { text: "Prvi koraci", link: "/sr/guide/getting-started" },
          { text: "Od nule do lokalnog sajta", link: "/sr/guide/walkthrough" },
          { text: "Kreiranje projekta", link: "/sr/guide/create" },
          { text: "Profili", link: "/sr/guide/profiles" },
          { text: "Import i pull WordPress-a", link: "/sr/guide/import-and-pull" },
        ],
      },
      {
        text: "Referenca",
        items: [
          { text: "Komande", link: "/sr/reference/commands" },
          { text: "Konfiguracija", link: "/sr/reference/configuration" },
        ],
      },
      {
        text: "Pomoć",
        items: [{ text: "Česta pitanja i problemi", link: "/sr/faq" }],
      },
    ],
    editLink: {
      pattern: `${GITHUB}/edit/main/docs/:path`,
      text: "Izmeni ovu stranicu na GitHub-u",
    },
    footer: {
      message: "Objavljeno pod MIT licencom.",
      copyright: "A-CLI Developer Toolkit",
    },
    outline: { level: [2, 3], label: "Na ovoj stranici" },
    docFooter: { prev: "Prethodna", next: "Sledeća" },
    lastUpdated: { text: "Poslednja izmena" },
    langMenuLabel: "Promeni jezik",
    returnToTopLabel: "Nazad na vrh",
    sidebarMenuLabel: "Meni",
    darkModeSwitchLabel: "Tema",
    lightModeSwitchTitle: "Uključi svetlu temu",
    darkModeSwitchTitle: "Uključi tamnu temu",
    skipToContentLabel: "Pređi na sadržaj",
    notFound: {
      title: "STRANICA NIJE PRONAĐENA",
      quote: "Ova stranica ne postoji — ali A-CLI Bot zna put nazad.",
      linkLabel: "idi na početnu",
      linkText: "Nazad na početnu",
    },
  },
};

export default {
  title: "A-CLI",
  base: "/acli-toolkit/",
  lastUpdated: true,
  // Internal working notes (implementation plans) live next to the docs but are not pages.
  srcExclude: ["superpowers/**"],

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/acli-toolkit/logo.svg" }]],

  locales: { root: en, sr },

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "A-CLI",
    outline: [2, 3],
    search: {
      provider: "local",
      options: {
        locales: {
          sr: {
            translations: {
              button: { buttonText: "Pretraga", buttonAriaLabel: "Pretraga" },
              modal: {
                displayDetails: "Prikaži detalje",
                resetButtonTitle: "Obriši pretragu",
                backButtonTitle: "Zatvori pretragu",
                noResultsText: "Nema rezultata za",
                footer: { selectText: "izaberi", navigateText: "kretanje", closeText: "zatvori" },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: "github", link: GITHUB }],
  },
};
