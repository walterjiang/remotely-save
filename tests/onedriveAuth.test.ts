import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { resolve } from "path";
import { transformSync } from "esbuild";

// Execute the real modules with an Obsidian boundary stub. No network or vault I/O.
function loadSource(file: string, dependencies: Record<string, any>) {
  const code = transformSync(readFileSync(resolve(file), "utf8"), {
    loader: "ts",
    format: "cjs",
    target: "es2020",
  }).code;
  const module = { exports: {} as any };
  new Function("require", "module", "exports", code)(
    (name: string) => dependencies[name] ?? {},
    module,
    module.exports
  );
  return module.exports;
}

describe("OneDrive authentication regressions", () => {
  let api: any;
  let Plugin: any;
  let request: (options: any) => Promise<string>;
  let requestUrl: (options: any) => Promise<any>;
  let notices: string[];

  beforeEach(() => {
    notices = [];
    request = async () => {
      throw Error("Unexpected request");
    };
    requestUrl = async () => {
      throw Error("Unexpected requestUrl");
    };
    const obsidian = {
      request: (options: any) => request(options),
      requestUrl: (options: any) => requestUrl(options),
      Plugin: class {},
      Notice: class {
        constructor(text: string) {
          notices.push(text);
        }
      },
    };
    api = loadSource("src/fsOnedrive.ts", {
      obsidian,
      "./baseTypes": { OAUTH2_FORCE_EXPIRE_MILLISECONDS: 80 * 86400000 },
      "./baseTypesObs": { VALID_REQURL: true },
      "./fsAll": { FakeFs: class {} },
    });
    Plugin = loadSource("src/main.ts", {
      obsidian,
      "./fsOnedrive": api,
    }).default;
  });

  function config() {
    return {
      ...api.DEFAULT_ONEDRIVE_CONFIG,
      clientID: "test-client",
      authority: "https://example.invalid",
      accessToken: "test-access",
      refreshToken: "test-refresh",
      accessTokenExpiresAtTime: Date.now() + 3600000,
    };
  }

  function client() {
    return new api.FakeFsOnedrive(config(), "test-vault", async () => {});
  }

  const tokenResponse = {
    access_token: "test-access",
    refresh_token: "test-refresh",
    expires_in: 3600,
    token_type: "Bearer",
  };

  it("keeps a newly authorized token valid and awaits persistence", async () => {
    const c = config();
    const before = Date.now();
    await api.setConfigBySuccessfullAuthInplace(
      c,
      tokenResponse,
      async () => {}
    );
    assert.ok(c.accessTokenExpiresAtTime >= before + 3300000);
    assert.ok(c.accessTokenExpiresAtTime <= Date.now() + 3300000);
    await assert.rejects(
      api.setConfigBySuccessfullAuthInplace(c, tokenResponse, async () => {
        throw Error("save failed");
      }),
      /save failed/
    );
  });

  it("propagates a failed token request instead of returning undefined", async () => {
    await assert.rejects(
      api.sendAuthReq(
        "client",
        "authority",
        "code",
        "verifier",
        async () => {}
      ),
      /Unexpected request/
    );
  });

  function stubFolderRequests(existing: boolean) {
    request = async ({ url }) => {
      if (url.endsWith("/special/approot")) return '{"id":"app-id"}';
      if (url.endsWith("/items/app-id/children")) {
        return JSON.stringify({
          value: existing ? [{ name: "test-vault", folder: {} }] : [],
        });
      }
      if (url.endsWith("/me?$select=displayName")) {
        return '{"displayName":"Test user"}';
      }
      throw Error(`Unexpected endpoint: ${url}`);
    };
  }

  it("reuses an existing folder without writing", async () => {
    stubFolderRequests(true);
    assert.equal(await client().getUserDisplayName(), "Test user");
  });

  it("creates the exact folder through its parent ID without replacing data", async () => {
    stubFolderRequests(false);
    let posts = 0;
    requestUrl = async (options) => {
      posts++;
      assert.ok(options.url.endsWith("/me/drive/items/app-id/children"));
      assert.equal(options.throw, false);
      assert.deepEqual(JSON.parse(options.body), {
        name: "test-vault",
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      });
      return { status: 201, json: { name: "test-vault", folder: {} } };
    };
    assert.equal(await client().getUserDisplayName(), "Test user");
    assert.equal(posts, 1);
  });

  it("preserves Graph error details without including token values", async () => {
    stubFolderRequests(false);
    requestUrl = async () => ({
      status: 400,
      json: { error: { code: "invalidRequest", message: "Invalid argument" } },
    });
    await assert.rejects(client().getUserDisplayName(), (error: any) => {
      assert.match(error.message, /HTTP 400; invalidRequest: Invalid argument/);
      assert.ok(!error.message.includes("test-access"));
      assert.ok(!error.message.includes("test-refresh"));
      return true;
    });
  });

  it("reports non-JSON failures with their HTTP status", async () => {
    requestUrl = async () => ({
      status: 502,
      get json() {
        throw Error("Invalid JSON");
      },
    });
    await assert.rejects(client()._postJson("/test", {}), /HTTP 502/);
  });

  function pluginFixture() {
    // Only exercise the callback; plugin startup timers are outside this test.
    const plugin = Object.create(Plugin.prototype);
    const lines: string[] = [];
    let closed = false;
    plugin.settings = { onedrive: config() };
    plugin.app = { vault: { getName: () => "test-vault" } };
    plugin.i18n = { t: (key: string) => key };
    plugin.saveSettings = async () => {};
    plugin.oauth2Info = {
      verifier: "test-verifier",
      helperModal: {
        contentEl: {
          empty: () => {
            lines.length = 0;
          },
          createEl: (_tag: string, options: any) => lines.push(options.text),
        },
        close: () => {
          closed = true;
        },
      },
    };
    return { plugin, lines, isClosed: () => closed };
  }

  it("finishes authorization and closes the modal after persistence", async () => {
    const { plugin, isClosed } = pluginFixture();
    stubFolderRequests(true);
    const readRequest = request;
    request = (options) =>
      options.method === "POST"
        ? Promise.resolve(JSON.stringify(tokenResponse))
        : readRequest(options);
    await plugin.handleOnedriveCallback({ code: "test-code" });
    assert.equal(plugin.settings.onedrive.username, "Test user");
    assert.equal(isClosed(), true);
    assert.equal(plugin.oauth2Info.verifier, "");
    assert.equal(notices.length, 0);
  });

  it("replaces the waiting screen with the directory error and clears auth state", async () => {
    const { plugin, lines, isClosed } = pluginFixture();
    stubFolderRequests(false);
    const readRequest = request;
    request = (options) =>
      options.method === "POST"
        ? Promise.resolve(JSON.stringify(tokenResponse))
        : readRequest(options);
    requestUrl = async () => ({
      status: 400,
      json: { error: { code: "invalidRequest", message: "Invalid argument" } },
    });
    await plugin.handleOnedriveCallback({ code: "test-code" });
    assert.ok(lines.some((line) => line.includes("HTTP 400")));
    assert.ok(!lines.includes("protocol_onedrive_connecting"));
    assert.equal(isClosed(), false);
    assert.equal(plugin.oauth2Info.verifier, "");
    assert.equal(plugin.oauth2Info.helperModal, undefined);
    assert.equal(notices.length, 1);
  });

  it("shows persistence failures instead of continuing initialization", async () => {
    const { plugin, lines } = pluginFixture();
    request = async () => JSON.stringify(tokenResponse);
    plugin.saveSettings = async () => {
      throw Error("save failed");
    };
    await plugin.handleOnedriveCallback({ code: "test-code" });
    assert.ok(lines.includes("save failed"));
    assert.equal(plugin.oauth2Info.verifier, "");
  });

  it("handles missing or denied callbacks without revealing their parameters", async () => {
    const { plugin, lines } = pluginFixture();
    await plugin.handleOnedriveCallback({
      error: "access_denied",
      secret: "secret-code",
    });
    assert.ok(lines.includes("protocol_onedrive_connect_fail"));
    assert.ok(!notices.join().includes("secret-code"));
    assert.equal(plugin.oauth2Info.verifier, "");
  });
});

describe("OneDrive drive item path parsing", () => {
  function loadApi(appFolderName?: string) {
    return loadSource("src/fsOnedrive.ts", {
      obsidian: {
        request: async () => {
          throw Error("Unexpected request");
        },
        requestUrl: async () => {
          throw Error("Unexpected requestUrl");
        },
      },
      "./baseTypes": {
        OAUTH2_FORCE_EXPIRE_MILLISECONDS: 80 * 86400000,
        ONEDRIVE_APP_FOLDER_NAME: appFolderName,
      },
      "./baseTypesObs": { VALID_REQURL: true },
      "./fsAll": { FakeFs: class {} },
    });
  }

  function item(path: string, name: string, folder = false): any {
    return {
      parentReference: { path },
      name,
      ...(folder ? { folder: {} } : {}),
      fileSystemInfo: { lastModifiedDateTime: "2026-01-01T00:00:00Z" },
    };
  }

  it("parses the configured app folder name with localized Apps dir", () => {
    const api = loadApi("obsidan_save");
    const entity = api.fromDriveItemToEntity(
      item("/drive/root:/应用/obsidan_save/my_obsidan/sub", "note.md"),
      "my_obsidan"
    );
    assert.equal(entity.key, "sub/note.md");
  });

  it("falls back to the official folder name when not configured", () => {
    const api = loadApi();
    const entity = api.fromDriveItemToEntity(
      item("/drive/root:/Apps/remotely-save/my_obsidan", "note.md"),
      "my_obsidan"
    );
    assert.equal(entity.key, "note.md");
  });

  it("rejects paths outside the configured app folder", () => {
    const api = loadApi("obsidan_save");
    assert.throws(() =>
      api.fromDriveItemToEntity(
        item("/drive/root:/应用/remotely-save/my_obsidan", "note.md"),
        "my_obsidan"
      )
    );
  });

  it("keeps the trailing slash for folders", () => {
    const api = loadApi("obsidan_save");
    const entity = api.fromDriveItemToEntity(
      item("/drive/root:/应用/obsidan_save/my_obsidan", "sub", true),
      "my_obsidan"
    );
    assert.equal(entity.key, "sub/");
  });
});
