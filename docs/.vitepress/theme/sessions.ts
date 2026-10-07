// Recorded-style terminal sessions for <AcliReplay>. The text mirrors what the
// CLI prints (prompts from src/, clack's symbols); keep it in sync when those
// messages change. Sessions are shared by every locale — the CLI speaks English.
import pkg from "../../../package.json";

export type ReplayLine =
  /** A command typed at the shell prompt. */
  | { k: "cmd"; t: string }
  /** Output: `out` plain, `dim` grey, `ok` green, `q` an answered question, `a` its answer. */
  | { k: "out" | "dim" | "ok" | "q" | "a"; t: string }
  /** A spinner cycling through messages, then stopping with `done`. */
  | { k: "spin"; steps: string[]; done: string }
  | { k: "pause"; ms: number };

const answered = (question: string, answer: string): ReplayLine[] => [
  { k: "q", t: `◇  ${question}` },
  { k: "a", t: `│  ${answer}` },
  { k: "dim", t: "│" },
];

export const SESSIONS: Record<string, ReplayLine[]> = {
  install: [
    { k: "cmd", t: "node --version" },
    { k: "out", t: "v22.18.0" },
    { k: "cmd", t: "npm install --global acli-toolkit" },
    { k: "pause", ms: 900 },
    { k: "dim", t: "added 1 package in 4s" },
    { k: "cmd", t: "acli --version" },
    { k: "ok", t: pkg.version },
  ],

  profile: [
    { k: "cmd", t: "acli profile create" },
    ...answered("Profile name:", "coolify"),
    ...answered("How does A-CLI reach this server?", "Coolify project CLI"),
    ...answered("SSH host:", "cloud.example.com"),
    ...answered("SSH port:", "22"),
    ...answered("SSH username:", "developer"),
    ...answered("SSH private key (optional, e.g. ~/.ssh/id_ed25519):", "~/.ssh/cloud"),
    ...answered("SSH host-key policy:", "Accept new hosts"),
    ...answered("Staging URL (optional, also replaced during import):", "https://{projectName}.cloud.example.com"),
    ...answered("Link the site's Git repository after import?", "Yes"),
    ...answered("Local Git SSH Host alias (optional, e.g. github-work):", "github-work"),
    { k: "ok", t: 'Profile "coolify" saved to ~/Library/Application Support/a-cli/config.yaml.' },
  ],

  import: [
    { k: "cmd", t: "cd ~/Sites && acli import" },
    ...answered("Which project do you want to import?", "Client Site"),
    ...answered("Local project directory/name:", "client-site"),
    ...answered("Which local environment do you prefer?", "Docker (docker-compose.yaml)"),
    { k: "q", t: "◇  Selected profile: coolify ──────────────────────────────────╮" },
    { k: "out", t: "│  Remote: developer@cloud.example.com                         │" },
    { k: "out", t: "│  Database and files: exported with the server's project CLI  │" },
    { k: "out", t: "│  (pull-only)                                                 │" },
    { k: "out", t: "│  Local: docker                                               │" },
    { k: "out", t: "│  Server project: Client Site                                 │" },
    { k: "dim", t: "├──────────────────────────────────────────────────────────────╯" },
    {
      k: "spin",
      steps: [
        "1/3 Validating project and requirements...",
        "2/3 Importing files and database...",
        "Detecting WordPress table prefix...",
        "Reading the imported site's actual URL...",
      ],
      done: "2/3 Import complete.",
    },
    { k: "q", t: "◇  3/3 Finalizing..." },
    { k: "ok", t: "◆  3/3 Done." },
    { k: "dim", t: "│" },
    { k: "ok", t: "└  ✔ client-site is ready" },
    { k: "out", t: "" },
    { k: "out", t: "   Location      ~/Sites/client-site" },
    { k: "out", t: "   Environment   Docker Compose" },
    { k: "out", t: "   Git           Linked to origin/main (pull-only)" },
    { k: "out", t: "   Dependencies  Manual steps may remain" },
    { k: "out", t: "" },
    { k: "out", t: "   Next:" },
    { k: "out", t: "     cd client-site" },
    { k: "dim", t: "     # Docker environment is already running" },
  ],

  pull: [
    { k: "cmd", t: "cd ~/Sites/client-site && acli pull db" },
    ...answered("This replaces your local database with a copy from the remote site. Continue?", "Yes"),
    { k: "spin", steps: ["Pulling db...", "Exporting remote database...", "Reading the imported site's actual URL..."], done: "Pull complete." },
    { k: "ok", t: '└  Pulled db for "client-site".' },
  ],
};
