<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { SESSIONS, type ReplayLine } from "../sessions";
import { useStrings } from "../i18n";
import AcliIcon from "./AcliIcon.vue";

// A terminal that plays a session back line by line when it scrolls into
// view. Server-rendered (and with reduced motion) it shows the whole session.
const props = withDefaults(defineProps<{ session: string; title?: string }>(), { title: "~" });

interface Rendered { cls: string; text: string }

const t = useStrings({
  en: { replay: "Replay", skip: "Skip", example: "Example session" },
  sr: { replay: "Ponovo", skip: "Preskoči", example: "Primer sesije" },
});

const SPINNER = ["◒", "◐", "◓", "◑"];
const script = computed<ReplayLine[]>(() => SESSIONS[props.session] ?? []);

function finalOf(line: ReplayLine): Rendered | null {
  if (line.k === "pause") return null;
  if (line.k === "cmd") return { cls: "cmd", text: line.t };
  if (line.k === "spin") return { cls: "q", text: `◇  ${line.done}` };
  return { cls: line.k, text: line.t };
}

const full = computed(() => script.value.map(finalOf).filter((line): line is Rendered => line !== null));
const lines = ref<Rendered[]>(full.value);
const playing = ref(false);
const done = ref(true);
const body = ref<HTMLElement>();
const minHeight = ref<string>();
let run = 0;
let observer: IntersectionObserver | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function play() {
  const id = ++run;
  const alive = () => id === run;
  lines.value = [];
  playing.value = true;
  done.value = false;
  for (const line of script.value) {
    if (!alive()) return;
    if (line.k === "pause") { await sleep(line.ms); continue; }
    if (line.k === "cmd") {
      const typed: Rendered = { cls: "cmd", text: "" };
      lines.value.push(typed);
      await sleep(350);
      for (const char of line.t) {
        if (!alive()) return;
        typed.text += char;
        lines.value = [...lines.value];
        await sleep(28 + Math.random() * 40);
      }
      await sleep(320);
      continue;
    }
    if (line.k === "spin") {
      const spin: Rendered = { cls: "spin", text: "" };
      lines.value.push(spin);
      let frame = 0;
      for (const step of line.steps) {
        for (let i = 0; i < 6; i++) {
          if (!alive()) return;
          spin.text = `${SPINNER[frame++ % SPINNER.length]}  ${step}`;
          lines.value = [...lines.value];
          await sleep(120);
        }
      }
      Object.assign(spin, finalOf(line));
      lines.value = [...lines.value];
      await sleep(200);
      continue;
    }
    lines.value = [...lines.value, finalOf(line)!];
    await sleep(line.k === "a" ? 260 : line.k === "q" ? 110 : 60);
  }
  if (alive()) { playing.value = false; done.value = true; }
}

function skip() {
  run++;
  lines.value = full.value;
  playing.value = false;
  done.value = true;
}

onMounted(() => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  // Reserve the finished height so the page doesn't jump while it plays.
  if (body.value) minHeight.value = `${body.value.offsetHeight}px`;
  lines.value = [];
  done.value = false;
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer?.disconnect();
      play();
    }
  }, { threshold: 0.35 });
  observer.observe(body.value!);
});

onBeforeUnmount(() => { run++; observer?.disconnect(); });
</script>

<template>
  <div class="acli-terminal acli-replay">
    <div class="acli-terminal__bar">
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__dot" />
      <span class="acli-terminal__title">{{ title }}</span>
      <span class="acli-replay__tag">{{ t.example }}</span>
      <button v-if="playing" type="button" class="acli-replay__btn" @click="skip">{{ t.skip }} <AcliIcon name="skip-forward" /></button>
      <button v-else-if="done" type="button" class="acli-replay__btn" @click="play">{{ t.replay }} <AcliIcon name="rotate-ccw" /></button>
    </div>
    <div ref="body" class="acli-terminal__body" :style="{ minHeight }">
      <pre><template v-for="(line, index) in lines" :key="index"><span :class="`acli-replay__line is-${line.cls}`"><span v-if="line.cls === 'cmd'" class="acli-prompt__sign">$ </span>{{ line.text }}<span v-if="playing && index === lines.length - 1 && line.cls === 'cmd'" class="acli-replay__cursor">▋</span></span>
</template></pre>
    </div>
  </div>
</template>
