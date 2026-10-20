import { strict as assert } from "assert";
import { checkCryptoUsage } from "../build/cryptoImports.mjs";

describe("Browser crypto boundary", () => {
  it("accepts the SDK hashing, randomness and UUID APIs", () => {
    checkCryptoUsage(
      'import crypto from "crypto"; crypto.createHash("sha256"); crypto.randomBytes(16);'
    );
    checkCryptoUsage(
      'import { randomUUID as uuid } from "node:crypto"; uuid();'
    );
  });
  it("rejects newly required signing APIs", () => {
    assert.throws(
      () =>
        checkCryptoUsage(
          'import crypto from "crypto"; crypto.createSign("RSA-SHA256");'
        ),
      /review SDK compatibility/
    );
    assert.throws(
      () =>
        checkCryptoUsage(
          'import { createHmac } from "node:crypto"; createHmac("sha256", "key");'
        ),
      /review SDK compatibility/
    );
  });
  it("rejects escaping crypto objects that cannot be checked", () => {
    assert.throws(
      () => checkCryptoUsage('import crypto from "crypto"; external(crypto);'),
      /review SDK compatibility/
    );
  });
  it("checks CommonJS crypto imports too", () => {
    checkCryptoUsage('const crypto = require("crypto"); crypto.randomUUID();');
    assert.throws(
      () =>
        checkCryptoUsage(
          'const crypto = require("crypto"); crypto.sign("sha256", data, key);'
        ),
      /review SDK compatibility/
    );
  });
});
