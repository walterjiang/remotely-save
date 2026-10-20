import { strict as assert } from "assert";
import { checkBoxClientUsage } from "../build/boxImports.mjs";

const importClient =
  'import { BoxClient as Client } from "box-typescript-sdk-gen/lib/client.generated";';

describe("Box SDK module selection", () => {
  it("accepts file/folder calls and renamed imports", () => {
    checkBoxClientUsage(`${importClient}
      const client = new Client({ auth: {} });
      client.files.getFileById("1");
      client.folders.getFolderItems("0");`);
  });

  it("rejects an additional manager until the facade is extended", () => {
    assert.throws(
      () =>
        checkBoxClientUsage(`${importClient}
      const client = new Client({ auth: {} });
      client.users.getUserMe();`),
      /extend the SDK facade/
    );
  });

  it("rejects escaping client references whose API use cannot be checked", () => {
    assert.throws(
      () =>
        checkBoxClientUsage(`${importClient}
      const client = new Client({ auth: {} });
      useClient(client);`),
      /extend the SDK facade/
    );
  });

  it("rejects constructor patterns that need another usage review", () => {
    assert.throws(
      () =>
        checkBoxClientUsage(`${importClient}
      new Client({ auth: {} }).files.getFileById("1");`),
      /construction changed/
    );
  });
});
