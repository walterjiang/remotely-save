import { strict as assert } from "assert";
import { checkMsalUsage } from "../build/msalImports.mjs";

const fixture = `import { CryptoProvider, PublicClientApplication } from "@azure/msal-node";
const cryptoProvider = new CryptoProvider();
cryptoProvider.generatePkceCodes();
const client = new PublicClientApplication({auth: {clientId: id, authority}});
client.getAuthCodeUrl(params);`;

describe("MSAL browser integration boundary", () => {
  it("accepts PKCE and authorization URL generation", () => {
    checkMsalUsage(fixture);
  });
  it("rejects token acquisition that needs a new compatibility review", () => {
    assert.throws(
      () =>
        checkMsalUsage(fixture.replace("getAuthCodeUrl", "acquireTokenByCode")),
      /review browser crypto/
    );
  });
  it("rejects certificate or client assertion configuration", () => {
    assert.throws(
      () =>
        checkMsalUsage(
          fixture.replace(
            "clientId: id",
            "clientId: id, clientCertificate: certificate"
          )
        ),
      /review browser crypto/
    );
  });
  it("rejects client references escaping the checked integration", () => {
    assert.throws(
      () => checkMsalUsage(`${fixture}\nexternal(client);`),
      /review browser crypto/
    );
  });
});
