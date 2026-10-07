<script setup lang="ts">
import { computed } from "vue";
import { ICONS } from "../icons";

// A decorative line icon. Usable from Markdown: <AcliIcon name="circle-check" />.
const props = withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: "1em" });
const body = computed(() => {
  const svg = ICONS[props.name];
  if (!svg && import.meta.env.DEV) console.warn(`[AcliIcon] unknown icon "${props.name}"`);
  return svg ?? "";
});
</script>

<template>
  <svg
    class="acli-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    v-html="body"
  />
</template>
