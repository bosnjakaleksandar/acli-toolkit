import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import AcliBanner from "./components/AcliBanner.vue";
import AcliFlow from "./components/AcliFlow.vue";
import AcliHero from "./components/AcliHero.vue";
import AcliIcon from "./components/AcliIcon.vue";
import AcliMascot from "./components/AcliMascot.vue";
import AcliPullDiagram from "./components/AcliPullDiagram.vue";
import AcliReplay from "./components/AcliReplay.vue";
import AcliTerminal from "./components/AcliTerminal.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    "home-hero-image": () => h(AcliHero),
  }),
  enhanceApp({ app }) {
    app.component("AcliBanner", AcliBanner);
    app.component("AcliFlow", AcliFlow);
    app.component("AcliIcon", AcliIcon);
    app.component("AcliMascot", AcliMascot);
    app.component("AcliPullDiagram", AcliPullDiagram);
    app.component("AcliReplay", AcliReplay);
    app.component("AcliTerminal", AcliTerminal);
  },
} satisfies Theme;
