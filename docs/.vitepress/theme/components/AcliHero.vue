<script setup lang="ts">
import AcliBanner from "./AcliBanner.vue";
import AcliMascot from "./AcliMascot.vue";
import AcliTerminal from "./AcliTerminal.vue";

// The first screen of `acli`: banner, the bot booting up, then the main menu.
const menu = [
  "Create a project",
  "Import an existing WordPress site",
  "Profiles",
  "Link an existing project to a staging profile",
  "Pull files/database from a linked profile",
];
</script>

<template>
  <AcliTerminal title="~ acli" class="acli-hero">
    <div class="acli-prompt"><span class="acli-prompt__sign">$</span> acli</div>
    <AcliBanner compact />
    <AcliMascot boot state="idle" message="Ready to build something awesome?" />
    <div class="acli-menu">
      <div class="acli-menu__question"><span class="acli-menu__diamond">◆</span> What would you like to do?</div>
      <div v-for="(item, index) in menu" :key="item" class="acli-menu__item" :class="{ 'is-active': index === 0 }">
        <span class="acli-menu__rail">│</span> {{ index === 0 ? "●" : "○" }} {{ item }}
      </div>
    </div>
  </AcliTerminal>
</template>
