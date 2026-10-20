import { CryptoProvider, PublicClientApplication } from "@azure/msal-node";

export async function msalAuthorizationChecks() {
  const authority = "https://login.microsoftonline.com/consumers";
  const clientId = "00000000-0000-4000-8000-000000000001";
  const crypto = new CryptoProvider();
  const { challenge } = await crypto.generatePkceCodes();
  const offlineNetwork = async () => {
    throw Error("Unexpected MSAL network request");
  };
  const client = new PublicClientApplication({
    auth: {
      clientId,
      authority,
    },
    system: {
      networkClient: {
        sendGetRequestAsync: offlineNetwork,
        sendPostRequestAsync: offlineNetwork,
      },
    },
  });
  const checks = [];
  for (const scope of ["Files.ReadWrite.AppFolder", "Files.ReadWrite"]) {
    const redirectUri = `obsidian://remotely-save-cb-${scope.endsWith("AppFolder") ? "onedrive" : "onedrivefull"}`;
    const result = new URL(
      await client.getAuthCodeUrl({
        redirectUri,
        scopes: ["User.Read", scope, "offline_access"],
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
      })
    );
    const params = result.searchParams;
    const scopes = new Set(params.get("scope").split(" "));
    checks.push(
      result.origin + result.pathname ===
        `${authority}/oauth2/v2.0/authorize` &&
        params.get("client_id") === clientId &&
        params.get("response_type") === "code" &&
        params.get("redirect_uri") === redirectUri &&
        params.get("code_challenge") === challenge &&
        params.get("code_challenge_method") === "S256" &&
        ["User.Read", scope, "offline_access"].every((value) =>
          scopes.has(value)
        )
    );
  }
  const ids = Array.from({ length: 20 }, () => crypto.createNewGuid());
  return {
    authorizationUrl: checks.every(Boolean),
    uuidGeneration:
      new Set(ids).size === ids.length &&
      ids.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id
        )
      ),
  };
}
