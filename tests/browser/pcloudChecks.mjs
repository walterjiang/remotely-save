import pcloud from "pcloud-sdk-js";

export async function pcloudCompatibilityChecks() {
  const client = pcloud.createClient("disposable-test-token");
  const calls = [];
  const folder = { folderid: 123, name: "测试目录", isfolder: true };
  client.api = async (method, options) => {
    calls.push([method, options]);
    return method === "userinfo" ? { userid: 1 } : { metadata: folder };
  };
  const listed = await client.listfolder(0, { recursive: true });
  const created = await client.createfolder(folder.name, 0);
  const user = await client.userinfo();
  return {
    pcloudCompatibility:
      listed === folder &&
      created === folder &&
      user.userid === 1 &&
      JSON.stringify(calls) ===
        JSON.stringify([
          ["listfolder", { params: { folderid: 0, recursive: true } }],
          ["createfolder", { params: { name: folder.name, folderid: 0 } }],
          ["userinfo", undefined],
        ]),
  };
}
