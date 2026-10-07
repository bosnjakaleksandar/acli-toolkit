<script setup lang="ts">
import AcliIcon from "./AcliIcon.vue";

// A numbered row of steps joined by a line — the map of a longer guide.
// `icon` is an AcliIcon name (see ../icons.ts).
defineProps<{ steps: Array<{ icon: string; title: string; text?: string; link?: string; command?: string }> }>();
</script>

<template>
  <ol class="acli-flow">
    <li v-for="(step, index) in steps" :key="step.title" class="acli-flow__step">
      <component :is="step.link ? 'a' : 'div'" :href="step.link" class="acli-flow__card">
        <span class="acli-flow__badge">{{ index + 1 }}</span>
        <AcliIcon :name="step.icon" class="acli-flow__icon" />
        <strong class="acli-flow__title">{{ step.title }}</strong>
        <span v-if="step.text" class="acli-flow__text">{{ step.text }}</span>
        <code v-if="step.command" class="acli-flow__cmd">{{ step.command }}</code>
      </component>
    </li>
  </ol>
</template>
