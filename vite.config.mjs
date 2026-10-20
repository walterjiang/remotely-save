import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { boxImports } from "./build/boxImports.mjs";
import {
  bigintSyntax,
  compatibilityCheck,
  runtimeGuard,
} from "./build/compatibility.mjs";
import { cryptoImports } from "./build/cryptoImports.mjs";
import definitions from "./build/definitions.mjs";
import { msalImports } from "./build/msalImports.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const polyfills = () =>
  nodePolyfills({
    include: [
      "assert",
      "buffer",
      "crypto",
      "events",
      "path",
      "process",
      "stream",
      "url",
      "util",
    ],
    globals: { Buffer: true, global: true, process: true },
    overrides: { crypto: resolve(root, "build/crypto.mjs") },
  });

export default defineConfig(({ mode }) => ({
  publicDir: false,
  define: definitions,
  resolve: {
    alias: [
      {
        find: /^(?:node:)?(?:fs|http|https|net|tls|vm)$/,
        replacement: resolve(root, "build/browser-empty.cjs"),
      },
    ],
  },
  plugins: [
    boxImports(root),
    msalImports(root),
    cryptoImports(),
    bigintSyntax(),
    {
      name: "remotely-save-lodash-imports",
      enforce: "pre",
      resolveId(source, importer) {
        // Only redirect the application's known named imports, not SDK imports.
        if (
          source === "lodash" &&
          [
            resolve(root, "src/fsWebdis.ts"),
            resolve(root, "pro/src/fsGoogleDrive.ts"),
          ].includes(importer)
        ) {
          return resolve(root, "build/lodash.mjs");
        }
      },
    },
    polyfills(),
    compatibilityCheck(),
    {
      name: "remotely-save-plugin-files",
      buildStart() {
        for (const name of ["manifest.json", "styles.css"]) {
          this.addWatchFile(resolve(root, name));
        }
      },
      generateBundle(_options, bundle) {
        const chunks = Object.values(bundle).filter(
          (item) => item.type === "chunk"
        );
        if (chunks.length !== 1 || chunks[0].fileName !== "main.js") {
          throw Error("The plugin must be emitted as a single main.js bundle.");
        }
        const allowed = new Set(["obsidian", "electron"]);
        for (const external of chunks[0].imports) {
          if (!allowed.has(external))
            throw Error(`Unexpected external dependency: ${external}`);
        }
        const manifest = JSON.parse(
          readFileSync(resolve(root, "manifest.json"), "utf8")
        );
        const pkg = JSON.parse(
          readFileSync(resolve(root, "package.json"), "utf8")
        );
        if (manifest.version !== pkg.version)
          throw Error("Plugin/package versions differ.");
        for (const name of ["manifest.json", "styles.css"]) {
          this.emitFile({
            type: "asset",
            fileName: name,
            source: readFileSync(resolve(root, name)),
          });
        }
      },
    },
  ],
  worker: {
    format: "iife",
    plugins: () => [
      bigintSyntax(),
      cryptoImports(),
      polyfills(),
      compatibilityCheck(),
    ],
    rolldownOptions: { output: { banner: runtimeGuard } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2016",
    minify: mode !== "development",
    sourcemap: mode === "development" ? "inline" : false,
    reportCompressedSize: false,
    lib: {
      entry: resolve(root, "src/main.ts"),
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    rolldownOptions: {
      external: ["obsidian", "electron"],
      output: {
        exports: "default",
        codeSplitting: false,
        banner: runtimeGuard,
      },
    },
  },
}));
