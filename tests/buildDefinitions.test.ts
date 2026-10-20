import { strict as assert } from "assert";
import { createDefinitions } from "../build/definitions.mjs";

describe("Build application settings", () => {
  it("encodes quotes, backslashes and newlines as a JavaScript string literal", () => {
    const value = 'a"b\\c\n中文';
    const definitions = createDefinitions({ ONEDRIVE_CLIENT_ID: value });
    assert.equal(
      JSON.parse(definitions["global.DEFAULT_ONEDRIVE_CLIENT_ID"]),
      value
    );
  });

  it("only embeds allowlisted application settings", () => {
    const definitions = createDefinitions({
      PRIVATE_VALUE: "not-an-app-setting",
    });
    assert.equal(definitions["global.DEFAULT_ONEDRIVE_CLIENT_ID"], '""');
    assert.ok(!JSON.stringify(definitions).includes("not-an-app-setting"));
  });
});
