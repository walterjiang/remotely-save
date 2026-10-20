import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import { chromium } from "playwright-core";
import { build } from "vite";
import { exerciseBoxClient } from "../tests/browser/boxChecks.mjs";
import { ftpCompatibilityCheck } from "../tests/node/ftpCompatibility.mjs";
import config from "../vite.config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await ftpCompatibilityCheck();
const output = resolve(root, "dist");
assert.deepEqual(readdirSync(output).sort(), [
  "main.js",
  "manifest.json",
  "styles.css",
]);
for (const file of ["manifest.json", "styles.css"]) {
  assert.deepEqual(
    readFileSync(resolve(output, file)),
    readFileSync(resolve(root, file))
  );
}
const pluginCode = readFileSync(resolve(output, "main.js"), "utf8");
assert.ok(
  Buffer.byteLength(pluginCode) <= 3_800_000,
  "main.js exceeds the 3.8 MB budget; run pnpm analyze before changing the budget"
);
const ast = parse(pluginCode, { ecmaVersion: 2016, sourceType: "script" });
function inspect(node) {
  if (!node || typeof node !== "object") return;
  assert.notEqual(
    node.type,
    "ImportExpression",
    "Plugin contains a dynamic import"
  );
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object") inspect(value);
  }
}
inspect(ast);

const probeConfig = config({ mode: "production" });
probeConfig.plugins = probeConfig.plugins.filter(
  (p) => p.name !== "remotely-save-plugin-files"
);
// The probe never needs actual OAuth application settings.
for (const key of Object.keys(probeConfig.define)) {
  if (key.startsWith("global.DEFAULT_")) probeConfig.define[key] = '""';
}
probeConfig.configFile = false;
probeConfig.logLevel = "error";
probeConfig.build = {
  ...probeConfig.build,
  write: false,
  lib: {
    entry: resolve(root, "tests/browser/viteSmokeEntry.mjs"),
    formats: ["iife"],
    name: "ViteSmoke",
    fileName: () => "probe.js",
  },
  rolldownOptions: {
    ...probeConfig.build.rolldownOptions,
    output: { exports: "named", codeSplitting: false },
  },
};
const result = await build(probeConfig);
const results = Array.isArray(result) ? result : [result];
const chunks = results
  .flatMap((item) => item.output)
  .filter((item) => item.type === "chunk");
assert.equal(chunks.length, 1, "Probe must be a single browser bundle");
const probe = chunks[0];
assert.ok(probe, "Missing browser probe bundle");
// Compare browser bundling/transforms with the unchanged Node SDK.
const require = createRequire(import.meta.url);
const { BoxClient } = require("box-typescript-sdk-gen/lib/client.generated");
const box = await exerciseBoxClient(BoxClient);
const sdkRequire = createRequire(require.resolve("@aws-sdk/client-s3"));
const { Crc64NvmeJs } = sdkRequire("@aws-sdk/checksums/crc");
const inputs = [
  new TextEncoder().encode("123456789"),
  ...[0, 1, 7, 8, 9, 255, 256, 257, 8193].map((length) =>
    Uint8Array.from({ length }, (_, i) => (i * 97) % 256)
  ),
];
const vectors = [];
for (const bytes of inputs) {
  const crc = new Crc64NvmeJs();
  crc.update(bytes);
  vectors.push({
    bytes: [...bytes],
    checksum: Buffer.from(await crc.digest()).toString("base64"),
  });
}
assert.equal(vectors[0].checksum, "rosUhgp5mIg=", "CRC64-NVME check vector");
const { Cipher } = require("@fyears/rclone-crypt");
const referenceCipher = new Cipher("base64");
await referenceCipher.key("disposable-build-test-password", "");
const names = Array.from({ length: 7 }, (_, i) => `中文文件${i}.md`);
const plain = new Uint8Array([0, 1, 127, 128, 254, 255]);
const rclone = {
  names,
  encryptedNames: await Promise.all(
    names.map((name) => referenceCipher.encryptFileName(name))
  ),
  plain: [...plain],
  encrypted: [
    ...(await referenceCipher.encryptData(plain, new Uint8Array(24))),
  ],
};
const routes = new Map([
  [
    "/",
    {
      type: "text/html",
      body: readFileSync(resolve(root, "tests/browser/viteSmoke.html")),
    },
  ],
  ["/probe.js", { type: "text/javascript", body: probe.code }],
  ["/plugin.js", { type: "text/javascript", body: pluginCode }],
  [
    "/vectors.json",
    {
      type: "application/json",
      body: JSON.stringify({ crc64: vectors, rclone, box }),
    },
  ],
]);
const server = createServer((request, response) => {
  const resource = routes.get(request.url);
  if (!resource) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": resource.type,
    "Cache-Control": "no-store",
  });
  response.end(resource.body);
});
let browser;
try {
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  for (const withoutBigInt of [false, true]) {
    const context = await browser.newContext();
    if (withoutBigInt) {
      await context.addInitScript(() => {
        globalThis.BigInt = undefined;
      });
    }
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(`${origin}/`))
        return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.smokeResult !== null, null, {
      timeout: 30000,
    });
    const checks = await page.evaluate(() => window.smokeResult);
    if (withoutBigInt) {
      assert.match(checks.error, /NATIVE_BIGINT_REQUIRED/);
      assert.deepEqual(
        errors,
        [],
        "Unsupported runtime should fail with a clear diagnostic"
      );
      console.log("Unsupported runtime diagnostic passed (BigInt disabled)");
      await context.close();
      continue;
    }
    assert.equal(checks.error, undefined, JSON.stringify(checks));
    assert.deepEqual(
      Object.keys(checks).sort(),
      [
        "pluginExport",
        "pluginLoadMethod",
        "pkce",
        "filenameRoundTrip",
        "contentRoundTrip",
        "lodashImports",
        "queue",
        "s3Crc64",
        "rcloneCompatibility",
        "boxCompatibility",
        "inputPreserved",
        "closeCancelsPending",
        "closedCallsReject",
        "workerFailureRejects",
        "invalidContentRejected",
        "authorizationUrl",
        "uuidGeneration",
        "pcloudCompatibility",
      ].sort()
    );
    for (const [name, passed] of Object.entries(checks))
      assert.equal(passed, true, name);
    assert.deepEqual(errors, [], "Browser reported uncaught errors");
    console.log(
      `Build checks passed (BigInt ${withoutBigInt ? "disabled" : "enabled"}):`,
      JSON.stringify(checks)
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
