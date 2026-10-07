<script setup lang="ts">
import { useStrings } from "../i18n";
import AcliIcon from "./AcliIcon.vue";

// What `acli import` copies from the server and where it lands locally.
// Every arrow points one way: the server is only read.
const t = useStrings({
  en: {
    server: "Staging server",
    local: "Your machine",
    files: "WordPress files",
    db: "Database",
    git: "Git repository",
    link: "Link to the profile",
    env: "Local environment",
    blocked: "push · deploy · import on the server",
    blockedNote: "blocked in code",
    rows: [
      { from: "wp-content/", via: "rsync · project wp-export + scp", to: "wp-content/" },
      { from: "MySQL / MariaDB", via: "wp db export · project db-export", to: "database in Docker / Lando, URLs replaced" },
      { from: "origin", via: "git fetch", to: ".git → origin (pull-only)" },
    ],
    extra: [".acli/config.yaml", "docker-compose.yaml / .lando.yml"],
  },
  sr: {
    server: "Staging server",
    local: "Tvoj računar",
    files: "WordPress fajlovi",
    db: "Baza podataka",
    git: "Git repozitorijum",
    link: "Veza sa profilom",
    env: "Lokalno okruženje",
    blocked: "push · deploy · import na server",
    blockedNote: "blokirano u kodu",
    rows: [
      { from: "wp-content/", via: "rsync · project wp-export + scp", to: "wp-content/" },
      { from: "MySQL / MariaDB", via: "wp db export · project db-export", to: "baza u Docker / Lando, URL-ovi zamenjeni" },
      { from: "origin", via: "git fetch", to: ".git → origin (samo pull)" },
    ],
    extra: [".acli/config.yaml", "docker-compose.yaml / .lando.yml"],
  },
});

const icons = ["folder", "database", "git-branch"];
</script>

<template>
  <figure class="acli-diagram">
    <div class="acli-diagram__head">
      <span><AcliIcon name="cloud" /> {{ t.server }}</span>
      <span />
      <span><AcliIcon name="laptop" /> {{ t.local }}</span>
    </div>
    <div v-for="(row, index) in t.rows" :key="row.from" class="acli-diagram__row">
      <div class="acli-diagram__box">
        <small>{{ [t.files, t.db, t.git][index] }}</small>
        <span><AcliIcon :name="icons[index]" /> <code>{{ row.from }}</code></span>
      </div>
      <div class="acli-diagram__arrow">
        <span class="acli-diagram__via">{{ row.via }}</span>
        <span class="acli-diagram__line" aria-hidden="true" />
      </div>
      <div class="acli-diagram__box is-local">
        <small>{{ [t.files, t.db, t.git][index] }}</small>
        <span><code>{{ row.to }}</code></span>
      </div>
    </div>
    <div class="acli-diagram__row">
      <div />
      <div />
      <div class="acli-diagram__box is-local is-extra">
        <small>{{ t.link }} · {{ t.env }}</small>
        <span v-for="file in t.extra" :key="file"><code>{{ file }}</code></span>
      </div>
    </div>
    <div class="acli-diagram__blocked">
      <AcliIcon name="ban" size="18" />
      <span><s>{{ t.blocked }}</s> — <strong>{{ t.blockedNote }}</strong></span>
    </div>
  </figure>
</template>
