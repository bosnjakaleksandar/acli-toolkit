<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { MASCOT_COLORS, MASCOT_FRAMES, type MascotState } from "../mascot";

const props = withDefaults(defineProps<{
  state?: MascotState;
  message?: string;
  /** Play `startup` once before settling into `state`, like `acli` does on launch. */
  boot?: boolean;
}>(), { state: "idle", message: "", boot: false });

const current = ref<MascotState>(props.boot ? "startup" : props.state);
const frameIndex = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

const frames = computed(() => MASCOT_FRAMES[current.value]);
const frame = computed(() => frames.value[frameIndex.value % frames.value.length]!.join("\n"));
const color = computed(() => MASCOT_COLORS[current.value]);

function tick() {
  if (current.value === "startup" && frameIndex.value >= frames.value.length - 1) {
    current.value = props.state;
    frameIndex.value = 0;
    return;
  }
  frameIndex.value += 1;
}

onMounted(() => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    current.value = props.state;
    return;
  }
  timer = setInterval(tick, 220);
});
onBeforeUnmount(() => clearInterval(timer));
watch(() => props.state, (state) => { current.value = state; frameIndex.value = 0; });
</script>

<template>
  <div class="acli-mascot" :style="{ '--mascot-color': color }">
    <pre class="acli-mascot__art" aria-hidden="true">{{ frame }}</pre>
    <div v-if="message" class="acli-mascot__speech">
      <strong>A-CLI Bot</strong>
      <span>{{ message }}</span>
    </div>
  </div>
</template>
