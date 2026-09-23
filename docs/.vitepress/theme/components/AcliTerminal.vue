<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: "acli" });
</script>

<template>
  <div class="acli-terminal">
    <div class="acli-terminal__bar">
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__title">{{ title }}</span>
    </div>
    <div class="acli-terminal__body">
      <slot />
    </div>
  </div>
</template>
