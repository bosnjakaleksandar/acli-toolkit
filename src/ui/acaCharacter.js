const FRAME_WIDTH = 20;
const FRAME_HEIGHT = 8;
const MESSAGE_WIDTH = 48;
const REGION_HEIGHT = FRAME_HEIGHT + 1;
const INDENT = "  ";
const GAP = "   ";
const NAME = "A-CLI Bot";
const NAME_ROW = 2;
const MESSAGE_ROW = 3;

export const ACA_TIMING = Object.freeze({
  frameInterval: 200,
  startupDuration: 1800,
  idleDuration: 1600,
  transitionDuration: 1200,
});

// A-CLI's robot mascot: antenna status light, a head with eyes and a mouth,
// and a torso with indicator lights. Expressions carry the personality;
// the antenna and torso lights carry the operational state.
const shape = ({
  antenna = "◉",
  eyes = "◕   ◕",
  mouth = "◡",
  lights = "● ● ●",
  arms = false,
} = {}) => {
  const [armLeft, armRight] = arms ? ["▪─", "─▪"] : ["  ", "  "];
  return [
    `         ${antenna}`,
    "     ╭───┴───╮",
    `     │ ${eyes} │`,
    `     │   ${mouth}   │`,
    "     ╰───┬───╯",
    "    ╭────┴────╮",
    `  ${armLeft}│  ${lights}  │${armRight}`,
    "    ╰─────────╯",
  ].map(normalizeLine);
};

export const ACA_STATES = Object.freeze({
  // Boot sequence: antenna wakes, eyes open, lights come online, then a happy blink.
  startup: frames([
    shape({ antenna: "·", eyes: "·   ·", mouth: "─", lights: "     " }),
    shape({ antenna: "○", eyes: "─   ─", mouth: "─", lights: "     " }),
    shape({ eyes: "○   ○", mouth: "─", lights: "● · ·" }),
    shape({ eyes: "◕   ◕", mouth: "─", lights: "● ● ·" }),
    shape({ mouth: "─" }),
    shape({}),
    shape({ eyes: "^   ^" }),
    shape({ eyes: "^   ^" }),
    shape({}),
  ]),
  // Content, with an occasional blink.
  idle: frames([shape({}), shape({}), shape({ eyes: "─   ─" }), shape({})]),
  // Eyes drift upward while pondering.
  thinking: frames([
    shape({ eyes: "◔   ◔", mouth: "─", lights: "· ● ·" }),
    shape({ eyes: "◕   ◕", mouth: "~", lights: "· · ●" }),
    shape({ eyes: "◔   ◔", mouth: "─", lights: "● · ·" }),
  ]),
  // Focused stare, arms out, torso lights cycling.
  working: frames([
    shape({ eyes: "◉   ◉", mouth: "─", lights: "● · ·", arms: true }),
    shape({ eyes: "◉   ◉", mouth: "─", lights: "· ● ·", arms: true }),
    shape({ eyes: "◉   ◉", mouth: "─", lights: "· · ●", arms: true }),
  ]),
  success: frames([
    shape({}),
    shape({ eyes: "^   ^" }),
    shape({}),
    shape({ eyes: "^   ^" }),
  ]),
  warning: frames([
    shape({ antenna: "!", eyes: "○   ○", mouth: "○", lights: "· ● ·" }),
    shape({ antenna: "!", eyes: "○   ○", mouth: "○", lights: "○ ● ○" }),
  ]),
  error: frames([
    shape({ antenna: "!", eyes: "×   ×", mouth: "⌢", lights: "· · ·" }),
    shape({ antenna: "!", eyes: "×   ×", mouth: "⌢", lights: "● ● ●" }),
  ]),
  cancelled: frames([
    shape({ antenna: "·", eyes: "─   ─", mouth: "─", lights: "○ ○ ○" }),
    shape({ antenna: "○", eyes: "─   ─", mouth: "─", lights: "· · ·" }),
    shape({ antenna: "·", eyes: "─   ─", mouth: "─", lights: "○ ○ ○" }),
  ]),
  offline: frames([shape({ antenna: "○", eyes: "─   ─", mouth: "─", lights: "○ ○ ○" })]),
});

const STATE_COLORS = Object.freeze({
  startup: "\x1B[38;5;208m",
  idle: "\x1B[38;5;214m",
  thinking: "\x1B[36m",
  working: "\x1B[36m",
  success: "\x1B[32m",
  warning: "\x1B[33m",
  error: "\x1B[31m",
  cancelled: "\x1B[2m",
  offline: "\x1B[2m",
});

// States whose duration is unknown up front (an async task the caller is
// waiting on, not a fixed transition) loop until stop() is called instead of
// settling after a fixed duration. Everything else is a bounded transition.
const LOOPING_STATES = new Set(["thinking"]);

export class AcaCharacter {
  constructor({ stdout = process.stdout, env = process.env, processRef = process, manageProcess = true } = {}) {
    this.stdout = stdout;
    this.env = env;
    this.processRef = processRef;
    this.timer = null;
    this.rendered = false;
    this.cursorHidden = false;
    this.generation = 0;
    this.state = "idle";
    this.message = "Ready to build something awesome?";
    this.signalHandlers = new Map();
    if (manageProcess) this.attachProcessHandlers();
  }

  /**
   * Shows a state and its message. Finite states (the common case — a
   * transition with a known natural length, like "working" or "success")
   * resolve once their cycle settles, so `await mascot.show(...)` paces the
   * transition. Looping states (currently just "thinking" — used while an
   * async task of unknown duration runs) start animating and resolve
   * immediately; call stop() when the task finishes.
   */
  async show(state, message = defaultMessage(state)) {
    this.assertState(state);
    this.stopTimer();
    this.state = state;
    this.message = message;
    // --quiet ("Suppress decorative output") hides the mascot everywhere,
    // not just the startup banner — it's purely decorative in every command.
    if (this.env.ACLI_QUIET === "1") return;
    const stateFrames = ACA_STATES[state];
    const animated = this.canAnimate() && stateFrames.length > 1;

    if (LOOPING_STATES.has(state) && animated) {
      this.loopUntilStopped(state, message, stateFrames);
      return;
    }

    await this.playOnce(state, message, stateFrames, animated);
  }

  async playOnce(state, message, stateFrames, animated) {
    const generation = this.generation;
    const duration = state === "startup"
      ? ACA_TIMING.startupDuration
      : state === "idle"
        ? ACA_TIMING.idleDuration
        : ACA_TIMING.transitionDuration;

    this.hideCursor(animated);

    if (!animated) {
      this.render(stateFrames.at(-1), state, message);
      this.restoreCursor();
      return;
    }

    this.render(stateFrames[0], state, message);

    for (let elapsed = ACA_TIMING.frameInterval, index = 1; elapsed < duration; elapsed += ACA_TIMING.frameInterval, index += 1) {
      await this.wait(ACA_TIMING.frameInterval, generation);
      if (generation !== this.generation) return;
      this.render(stateFrames[index % stateFrames.length], state, message);
    }

    this.render(stateFrames.at(-1), state, message);
    this.restoreCursor();
  }

  loopUntilStopped(state, message, stateFrames) {
    this.render(stateFrames[0], state, message);
    this.hideCursor(true);
    let index = 1;
    this.timer = setInterval(() => {
      this.render(stateFrames[index % stateFrames.length], state, message);
      index += 1;
    }, ACA_TIMING.frameInterval);
    this.timer.unref?.();
  }

  stop({ clear = false } = {}) {
    this.stopTimer();
    if (clear && this.rendered && this.stdout.isTTY) this.clearRegion();
    this.restoreCursor();
    this.rendered = false;
  }

  cleanup() {
    this.stop();
    for (const [signal, handler] of this.signalHandlers) {
      this.processRef.removeListener?.(signal, handler);
    }
    this.signalHandlers.clear();
  }

  hasActiveAnimation() {
    return this.timer !== null;
  }

  canAnimate() {
    if (!this.stdout.isTTY || this.env.CI || this.env.TERM === "dumb") return false;
    return ![this.env.ACLI_REDUCED_MOTION, this.env.A_CLI_REDUCED_MOTION, this.env.REDUCED_MOTION, this.env.NO_MOTION]
      .some(isEnabled);
  }

  attachProcessHandlers() {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        this.stop();
        this.processRef.exitCode = signal === "SIGINT" ? 130 : 143;
      };
      this.signalHandlers.set(signal, handler);
      this.processRef.on?.(signal, handler);
    }
    const exitHandler = () => this.stop();
    this.signalHandlers.set("exit", exitHandler);
    this.processRef.on?.("exit", exitHandler);
  }

  render(frame, state, message) {
    if (!this.stdout.isTTY) {
      const lines = frame.map((line, row) => this.composeRow(line, row, message, {}).trimEnd());
      this.stdout.write(`${lines.join("\n")}\n\n`);
      this.rendered = true;
      return;
    }
    if (this.rendered) this.moveToRegionStart();
    const colorEnabled = this.env.NO_COLOR === undefined;
    const style = colorEnabled
      ? { color: STATE_COLORS[state], bold: "\x1B[1m", reset: "\x1B[0m" }
      : {};
    const lines = frame.map((line, row) => this.composeRow(line, row, message, style));
    lines.push("");
    for (const line of lines) this.stdout.write(`\x1B[2K\r${line}\n`);
    this.rendered = true;
  }

  composeRow(line, row, message, { color = "", bold = "", reset = "" }) {
    const art = `${INDENT}${color}${line}${reset}`;
    if (row === NAME_ROW) return `${art}${GAP}${bold}${NAME}${reset}`;
    if (row === MESSAGE_ROW) return `${art}${GAP}${this.normalizeMessage(message)}`;
    return art;
  }

  normalizeMessage(message) {
    const available = Math.max(0, (this.stdout.columns || 80) - INDENT.length - FRAME_WIDTH - GAP.length);
    const width = Math.min(MESSAGE_WIDTH, available);
    return String(message).replace(/[\r\n]/g, " ").slice(0, width).padEnd(width, " ");
  }

  moveToRegionStart() {
    this.stdout.write(`\x1B[${REGION_HEIGHT}A`);
  }

  clearRegion() {
    this.moveToRegionStart();
    for (let index = 0; index < REGION_HEIGHT; index += 1) this.stdout.write("\x1B[2K\r\n");
    this.stdout.write(`\x1B[${REGION_HEIGHT}A`);
  }

  hideCursor(shouldHide) {
    if (!shouldHide || !this.stdout.isTTY || this.cursorHidden) return;
    this.stdout.write("\x1B[?25l");
    this.cursorHidden = true;
  }

  restoreCursor() {
    if (!this.cursorHidden) return;
    this.stdout.write("\x1B[?25h");
    this.cursorHidden = false;
  }

  stopTimer() {
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.restoreCursor();
  }

  wait(milliseconds, generation) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      if (generation !== this.generation) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  assertState(state) {
    if (!Object.hasOwn(ACA_STATES, state)) throw new TypeError(`Unknown Aca state: ${state}`);
  }
}

export const mascot = new AcaCharacter();

function frames(value) {
  return Object.freeze(value.map((frame) => Object.freeze(frame)));
}

function normalizeLine(line) {
  return line.slice(0, FRAME_WIDTH).padEnd(FRAME_WIDTH, " ");
}

function defaultMessage(state) {
  return {
    startup: "Initializing developer toolkit...",
    idle: "Ready to build something awesome?",
    thinking: "Analyzing...",
    working: "Working...",
    success: "Operation completed successfully.",
    warning: "Attention required.",
    error: "Operation failed.",
    cancelled: "Operation cancelled.",
    offline: "Network unavailable; continuing offline.",
  }[state];
}

function isEnabled(value) {
  return value !== undefined && !["", "0", "false", "no"].includes(String(value).toLowerCase());
}

export const ACA_DIMENSIONS = Object.freeze({ width: FRAME_WIDTH, height: FRAME_HEIGHT });
