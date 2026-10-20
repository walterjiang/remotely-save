import { gzipSync } from "node:zlib";
import { build } from "vite";
import config from "../vite.config.mjs";

const options = config({ mode: "production" });
options.configFile = false;
options.logLevel = "error";
options.build.write = false;
const result = await build(options);
const results = Array.isArray(result) ? result : [result];
const chunk = results
  .flatMap((item) => item.output)
  .find((item) => item.type === "chunk" && item.fileName === "main.js");
if (!chunk) throw Error("Missing main.js bundle");
const groups = new Map();
for (const [id, info] of Object.entries(chunk.modules)) {
  const parts = id.split("node_modules/").at(-1).split("/");
  const name = id.includes("node_modules/")
    ? parts.slice(0, parts[0].startsWith("@") ? 2 : 1).join("/")
    : "application / bundler runtime";
  groups.set(name, (groups.get(name) ?? 0) + info.renderedLength);
}
console.log(
  `main.js: ${Buffer.byteLength(chunk.code).toLocaleString("en-US")} bytes`
);
console.log(
  `gzip (download comparison only): ${gzipSync(chunk.code).length.toLocaleString("en-US")} bytes`
);
console.log(
  "\nLargest module groups before minification (estimates, not final-byte shares):"
);
for (const [name, bytes] of [...groups]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15))
  console.log(`${(bytes / 1000).toFixed(1).padStart(8)} kB  ${name}`);
