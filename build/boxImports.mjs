import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "acorn";
import { transformSync } from "esbuild";

/** @param {string} source */
export function checkBoxClientUsage(source) {
  const { code } = transformSync(source, {
    loader: "ts",
    format: "esm",
    target: "esnext",
  });
  const tree = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const nodes = [];
  const visit = (node, parent) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string") nodes.push({ node, parent });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((item) => visit(item, node));
      else if (value && typeof value === "object") visit(value, node);
    }
  };
  visit(tree, null);
  const imports = nodes.filter(
    ({ node, parent }) =>
      node.type === "ImportSpecifier" &&
      node.imported.name === "BoxClient" &&
      parent.source.value === "box-typescript-sdk-gen/lib/client.generated"
  );
  if (imports.length !== 1)
    throw Error("Box client import changed; review the SDK facade.");
  const importedName = imports[0].node.local.name;
  const clients = new Set();
  for (const { node, parent } of nodes) {
    if (node.type !== "NewExpression" || node.callee.name !== importedName)
      continue;
    if (parent.type !== "VariableDeclarator" || parent.id.type !== "Identifier")
      throw Error("Box client construction changed; review the SDK facade.");
    clients.add(parent.id.name);
  }
  if (clients.size === 0)
    throw Error("No Box client construction found; review the SDK facade.");
  for (const { node, parent } of nodes) {
    if (node.type !== "Identifier" || !clients.has(node.name)) continue;
    if (parent.type === "VariableDeclarator" && parent.id === node) continue;
    if (
      parent.type === "MemberExpression" &&
      parent.object === node &&
      !parent.computed &&
      ["files", "folders"].includes(parent.property.name)
    )
      continue;
    throw Error(
      "Box client usage exceeds files/folders; extend the SDK facade before building."
    );
  }
}

/** @param {string} root */
export function boxImports(root) {
  const provider = resolve(root, "pro/src/fsBox.ts");
  return {
    name: "remotely-save-box-imports",
    enforce: "pre",
    buildStart() {
      this.addWatchFile(provider);
      checkBoxClientUsage(readFileSync(provider, "utf8"));
    },
    resolveId(source, importer) {
      if (
        source === "box-typescript-sdk-gen/lib/client.generated" &&
        importer === provider
      )
        return resolve(root, "build/boxClient.mjs");
    },
  };
}
