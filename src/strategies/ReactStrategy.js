import BaseStrategy from "./BaseStrategy.js";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../utils/git.js";

export default class ReactStrategy extends BaseStrategy {
  async scaffold(targetDir, ctx) {
    if (!ctx.skipEnvironment) {
      await this.scaffoldEnvironment(targetDir, ctx);
    }

    const { projectName } = ctx;
    const srcDir = path.join(targetDir, "src");

    await fs.ensureDir(path.join(srcDir, "assets"));
    await fs.ensureDir(path.join(srcDir, "components"));
    await fs.ensureDir(path.join(srcDir, "hooks"));

    const servicesDir = path.join(srcDir, "services");
    await fs.ensureDir(servicesDir);
    const apiUrl = ctx.useLaravel
      ? "http://localhost:8000/api"
      : "https://api.example.com";
    await fs.writeFile(
      path.join(servicesDir, "api.js"),
      `export const API_URL = import.meta.env.VITE_API_URL || "${apiUrl}";\n\nexport const fetchExample = async () => {\n  const response = await fetch(API_URL + '/user');\n  return response.json();\n};\n`,
    );

    await fs.writeFile(
      path.join(srcDir, "App.jsx"),
      `import './styles.css';\n\nexport default function App() {\n  return (\n    <main className="app-shell">\n      <section>\n        <p className="eyebrow">Vite + React</p>\n        <h1>${projectName}</h1>\n        <p>Start building in <code>src/App.jsx</code>.</p>\n      </section>\n    </main>\n  );\n}\n`,
    );

    await fs.writeFile(
      path.join(srcDir, "main.jsx"),
      `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\n\ncreateRoot(document.getElementById('root')).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`,
    );

    await fs.writeFile(
      path.join(srcDir, "styles.css"),
      `:root {\n  color: #1b1f24;\n  background: #f6f7f9;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\nbody {\n  margin: 0;\n}\n\n.app-shell {\n  display: grid;\n  min-height: 100vh;\n  place-items: center;\n  padding: 2rem;\n}\n\nsection {\n  max-width: 44rem;\n}\n\n.eyebrow {\n  color: #0f766e;\n  font-weight: 700;\n  letter-spacing: 0;\n  text-transform: uppercase;\n}\n\nh1 {\n  font-size: clamp(2.5rem, 8vw, 5rem);\n  line-height: 1;\n}\n`,
    );

    await fs.ensureDir(path.join(targetDir, "public"));
    await fs.writeFile(
      path.join(targetDir, "index.html"),
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${projectName}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>\n`,
    );

    await fs.writeFile(
      path.join(targetDir, "vite.config.js"),
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 3000 }\n});\n`,
    );

    const reactPkg = {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "vite",
        build: "vite build",
        lint: "eslint .",
        format: "prettier --write .",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@eslint/js": "^9.0.0",
        "@vitejs/plugin-react": "^4.3.0",
        eslint: "^9.0.0",
        "eslint-plugin-react-hooks": "^5.0.0",
        "eslint-plugin-react-refresh": "^0.4.0",
        globals: "^15.0.0",
        prettier: "^3.0.0",
        vite: "^6.0.0",
      },
    };
    await fs.writeJSON(path.join(targetDir, "package.json"), reactPkg, {
      spaces: 2,
    });

    await fs.writeFile(
      path.join(targetDir, "eslint.config.js"),
      `import js from '@eslint/js';\nimport globals from 'globals';\nimport reactHooks from 'eslint-plugin-react-hooks';\nimport reactRefresh from 'eslint-plugin-react-refresh';\n\nexport default [\n  { ignores: ['dist'] },\n  {\n    files: ['**/*.{js,jsx}'],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n      parserOptions: {\n        ecmaVersion: 'latest',\n        ecmaFeatures: { jsx: true },\n        sourceType: 'module',\n      },\n    },\n    plugins: {\n      'react-hooks': reactHooks,\n      'react-refresh': reactRefresh,\n    },\n    rules: {\n      ...js.configs.recommended.rules,\n      ...reactHooks.configs.recommended.rules,\n      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],\n    },\n  },\n];\n`,
    );
    await fs.writeFile(path.join(targetDir, ".prettierrc"), `{\n  "singleQuote": true,\n  "trailingComma": "all"\n}\n`);
    await fs.writeFile(path.join(targetDir, ".editorconfig"), `root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n`);
    await fs.writeFile(path.join(targetDir, ".env.example"), `VITE_API_URL=${apiUrl}\n`);
    await scaffoldGitignore(targetDir, "react");
  }

  getTemplateType() {
    return "react";
  }
}
