// The A-CLI Bot as drawn by the CLI (src/ui/mascot.ts). That module creates a
// terminal-bound instance on import, so the docs keep their own copy of the
// drawing; keep the two in sync when the mascot changes.

export type MascotState = "startup" | "idle" | "thinking" | "working" | "success" | "warning" | "error";

interface ShapeOptions {
  antenna?: string;
  eyes?: string;
  mouth?: string;
  lights?: string;
  arms?: boolean;
}

function shape({ antenna = "◉", eyes = "◕   ◕", mouth = "◡", lights = "● ● ●", arms = false }: ShapeOptions = {}): string[] {
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
  ];
}

export const MASCOT_FRAMES: Record<MascotState, string[][]> = {
  startup: [
    shape({ antenna: "·", eyes: "·   ·", mouth: "─", lights: "     " }),
    shape({ antenna: "○", eyes: "─   ─", mouth: "─", lights: "     " }),
    shape({ eyes: "○   ○", mouth: "─", lights: "● · ·" }),
    shape({ eyes: "◕   ◕", mouth: "─", lights: "● ● ·" }),
    shape({ mouth: "─" }),
    shape({}),
    shape({ eyes: "^   ^" }),
    shape({ eyes: "^   ^" }),
    shape({}),
  ],
  idle: [shape({}), shape({}), shape({}), shape({}), shape({}), shape({ eyes: "─   ─" }), shape({})],
  thinking: [
    shape({ eyes: "◔   ◔", mouth: "─", lights: "· ● ·" }),
    shape({ eyes: "◕   ◕", mouth: "~", lights: "· · ●" }),
    shape({ eyes: "◔   ◔", mouth: "─", lights: "● · ·" }),
  ],
  working: [
    shape({ eyes: "◉   ◉", mouth: "─", lights: "● · ·", arms: true }),
    shape({ eyes: "◉   ◉", mouth: "─", lights: "· ● ·", arms: true }),
    shape({ eyes: "◉   ◉", mouth: "─", lights: "· · ●", arms: true }),
  ],
  success: [shape({}), shape({ eyes: "^   ^" }), shape({}), shape({ eyes: "^   ^" })],
  warning: [
    shape({ antenna: "!", eyes: "○   ○", mouth: "○", lights: "· ● ·" }),
    shape({ antenna: "!", eyes: "○   ○", mouth: "○", lights: "○ ● ○" }),
  ],
  error: [
    shape({ antenna: "!", eyes: "×   ×", mouth: "⌢", lights: "· · ·" }),
    shape({ antenna: "!", eyes: "×   ×", mouth: "⌢", lights: "● ● ●" }),
  ],
};

// The CLI's ANSI colors for each state, as web colors.
export const MASCOT_COLORS: Record<MascotState, string> = {
  startup: "#ff8700",
  idle: "#ffaf00",
  thinking: "#22d3ee",
  working: "#22d3ee",
  success: "#4ade80",
  warning: "#facc15",
  error: "#f87171",
};

// `figlet.textSync("A-CLI", { font: "ANSI Shadow" })`, the banner `acli` prints.
export const BANNER = [
  " █████╗        ██████╗██╗     ██╗",
  "██╔══██╗      ██╔════╝██║     ██║",
  "███████║█████╗██║     ██║     ██║",
  "██╔══██║╚════╝██║     ██║     ██║",
  "██║  ██║      ╚██████╗███████╗██║",
  "╚═╝  ╚═╝       ╚═════╝╚══════╝╚═╝",
].join("\n");
