import { parse } from "acorn";
import { transform } from "esbuild";

// ES2016 parsers reject BigInt literals even in unused SDK functions. Preserve
// their precision as BigInt("...") calls; native BigInt is still required.
export function bigintSyntax() {
  return {
    name: "remotely-save-bigint-syntax",
    enforce: "pre",
    async transform(code, id) {
      if (
        !/\.[cm]?js$/.test(id) ||
        !/\b(?:0[xob][\da-f_]+|\d[\d_]*)n\b/i.test(code)
      )
        return null;
      const result = await transform(code, {
        loader: "js",
        target: "esnext",
        supported: { bigint: false },
        sourcefile: id,
        sourcemap: true,
      });
      return { code: result.code, map: result.map };
    },
  };
}

export const runtimeGuard = `if (typeof BigInt !== "function") {
  throw new Error("NATIVE_BIGINT_REQUIRED: Remotely Save needs native BigInt. Upgrade Obsidian, Android System WebView, or iOS/iPadOS (14+).");
}`;

// Check the emitted code, including inline workers, rather than only source.
export function compatibilityCheck() {
  return {
    name: "remotely-save-es2016",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        try {
          parse(item.code, { ecmaVersion: 2016, sourceType: "script" });
        } catch (error) {
          this.error(
            `${item.fileName} exceeds ES2016 syntax: ${error.message}`
          );
        }
      }
    },
  };
}
