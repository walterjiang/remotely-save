import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "acorn";
import { transformSync } from "esbuild";

/** @param {string} source */
export function checkMsalUsage(source) {
  const { code } = transformSync(source, {
    loader: "ts",
    format: "esm",
    target: "esnext",
  });
  const tree = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const nodes = [];
  function visit(node, parent) {
    if (!node || typeof node !== "object") return;
    if (node.type) nodes.push({ node, parent });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value && typeof value === "object") visit(value, node);
    }
  }
  visit(tree, null);
  const fail = () => {
    throw Error(
      "MSAL usage exceeds PKCE authorization URL generation; review browser crypto support."
    );
  };
  const classes = new Map();
  for (const { node } of nodes) {
    if (
      node.type !== "ImportDeclaration" ||
      node.source.value !== "@azure/msal-node"
    )
      continue;
    for (const specifier of node.specifiers) {
      if (
        specifier.type !== "ImportSpecifier" ||
        !["CryptoProvider", "PublicClientApplication"].includes(
          specifier.imported.name
        )
      )
        fail();
      classes.set(specifier.local.name, specifier.imported.name);
    }
  }
  if (classes.size !== 2) fail();
  const instances = new Map();
  for (const { node, parent } of nodes) {
    if (node.type !== "NewExpression" || !classes.has(node.callee.name))
      continue;
    if (parent.type !== "VariableDeclarator" || parent.id.type !== "Identifier")
      fail();
    const type = classes.get(node.callee.name);
    if (type === "PublicClientApplication") {
      const config = node.arguments[0];
      if (config?.type !== "ObjectExpression" || config.properties.length !== 1)
        fail();
      const auth = config.properties[0];
      if (
        auth.key?.name !== "auth" ||
        auth.value.type !== "ObjectExpression" ||
        auth.value.properties.some(
          (p) =>
            p.type !== "Property" ||
            p.computed ||
            !["clientId", "authority"].includes(p.key?.name)
        )
      )
        fail();
    } else if (node.arguments.length !== 0) fail();
    instances.set(parent.id.name, type);
  }
  if (instances.size !== 2) fail();
  for (const { node, parent } of nodes) {
    if (node.type !== "Identifier") continue;
    if (classes.has(node.name)) {
      if (
        parent.type === "ImportSpecifier" ||
        (parent.type === "NewExpression" && parent.callee === node)
      )
        continue;
      fail();
    }
    if (!instances.has(node.name)) continue;
    if (parent.type === "VariableDeclarator" && parent.id === node) continue;
    const method =
      instances.get(node.name) === "CryptoProvider"
        ? "generatePkceCodes"
        : "getAuthCodeUrl";
    if (
      parent.type !== "MemberExpression" ||
      parent.object !== node ||
      parent.computed ||
      parent.property.name !== method
    )
      fail();
  }
}

/** @param {string} root */
export function msalImports(root) {
  const files = ["src/fsOnedrive.ts", "pro/src/fsOnedriveFull.ts"].map((name) =>
    resolve(root, name)
  );
  return {
    name: "remotely-save-msal-api-boundary",
    enforce: "pre",
    buildStart() {
      for (const file of files) {
        this.addWatchFile(file);
        checkMsalUsage(readFileSync(file, "utf8"));
      }
    },
    transform(code, id) {
      if (
        (id.startsWith(resolve(root, "src")) ||
          id.startsWith(resolve(root, "pro/src"))) &&
        !files.includes(id) &&
        /['"]@azure\/msal-node['"]/.test(code)
      ) {
        const js = transformSync(code, { loader: "ts", target: "esnext" }).code;
        if (/['"]@azure\/msal-node['"]/.test(js))
          this.error(
            "New MSAL integration needs a browser compatibility review."
          );
      }
    },
  };
}
