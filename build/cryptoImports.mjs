import { parse } from "acorn";
import { transformSync } from "esbuild";

const supported = new Set(["createHash", "randomBytes", "randomUUID"]);
const isCrypto = (value) => value === "crypto" || value === "node:crypto";

/** @param {string} source */
export function checkCryptoUsage(source) {
  const { code } = transformSync(source, {
    loader: "ts",
    target: "esnext",
    format: "esm",
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
  const bindings = new Set();
  const fail = () => {
    throw Error(
      "Node crypto usage exceeds the browser adapter; review SDK compatibility."
    );
  };
  for (const { node, parent } of nodes) {
    if (node.type === "ImportDeclaration" && isCrypto(node.source.value)) {
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportSpecifier") {
          if (!supported.has(specifier.imported.name)) fail();
        } else bindings.add(specifier.local.name);
      }
    }
    if (
      node.type === "CallExpression" &&
      node.callee.name === "require" &&
      isCrypto(node.arguments[0]?.value)
    ) {
      if (
        parent.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      )
        bindings.add(parent.id.name);
      else if (
        parent.type !== "MemberExpression" ||
        parent.computed ||
        !supported.has(parent.property.name)
      )
        fail();
    }
  }
  for (const { node, parent } of nodes) {
    if (node.type !== "Identifier" || !bindings.has(node.name)) continue;
    if (
      ["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(
        parent.type
      )
    )
      continue;
    if (parent.type === "VariableDeclarator" && parent.id === node) continue;
    if (
      parent.type === "MemberExpression" &&
      parent.object === node &&
      !parent.computed &&
      supported.has(parent.property.name)
    )
      continue;
    fail();
  }
}

export function cryptoImports() {
  const candidates = new Map();
  return {
    name: "remotely-save-crypto-imports",
    enforce: "pre",
    transform(code, id) {
      if (/['"](?:node:)?crypto['"]/.test(code)) candidates.set(id, code);
      else candidates.delete(id);
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const [id, module] of Object.entries(chunk.modules)) {
          // MSAL's shared base class retains these dormant certificate/JWT
          // dependencies. The separate integration guard restricts the actual
          // app to PKCE/authorization URLs with no client assertions.
          if (/[/\\]node_modules[/\\](?:jwa|jsonwebtoken)[/\\]/.test(id))
            continue;
          if (module.renderedLength > 0 && candidates.has(id)) {
            try {
              checkCryptoUsage(candidates.get(id));
            } catch (error) {
              this.error(`${id}: ${error.message}`);
            }
          }
        }
      }
    },
  };
}
