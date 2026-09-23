<script setup lang="ts">
import { BANNER } from "../mascot";
import pkg from "../../../../package.json";

defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="acli-banner" :class="{ 'acli-banner--compact': compact }">
    <pre class="acli-banner__logo" aria-label="A-CLI">{{ BANNER }}</pre>
    <div class="acli-banner__meta">
      <span>Developer Toolkit</span>
      <span>v{{ pkg.version }}</span>
    </div>
  </div>
</template>
