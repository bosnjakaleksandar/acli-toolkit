import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import AcliBanner from "./components/AcliBanner.vue";
import AcliHero from "./components/AcliHero.vue";
import AcliMascot from "./components/AcliMascot.vue";
import AcliTerminal from "./components/AcliTerminal.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    "home-hero-image": () => h(AcliHero),
  }),
  enhanceApp({ app }) {
    app.component("AcliBanner", AcliBanner);
    app.component("AcliMascot", AcliMascot);
    app.component("AcliTerminal", AcliTerminal);
  },
} satisfies Theme;
