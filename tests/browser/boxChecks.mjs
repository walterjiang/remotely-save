// Run the same operations against the original Node client and browser facade.
// The session records requests and returns synthetic responses; no HTTP is sent.
export async function exerciseBoxClient(BoxClient) {
  const auth = { testAuth: true };
  const requests = [];
  const session = {
    baseUrls: { baseUrl: "https://api.box.com" },
    networkClient: {
      async fetch(options) {
        if (options.url.endsWith("/denied"))
          throw Error("Mock permission denied");
        requests.push({
          url: options.url,
          method: options.method,
          params: options.params,
          headers: options.headers,
          data: options.data,
          responseFormat: options.responseFormat,
          authForwarded: options.auth === auth,
          sessionForwarded: options.networkSession === session,
        });
        const folder = { id: "10", type: "folder", name: "测试目录" };
        const file = {
          id: "20",
          type: "file",
          name: "中文.md",
          size: 6,
          content_modified_at: "2024-01-02T03:04:05Z",
        };
        return {
          status: 200,
          data: options.url.endsWith("/items")
            ? { total_count: 1, entries: [file], offset: 0, limit: 1000 }
            : options.url.includes("/files/")
              ? file
              : folder,
        };
      },
    },
  };
  const client = new BoxClient({ auth, networkSession: session });
  const results = [
    await client.folders.getFolderItems("10", {
      queryParams: { fields: ["id", "name", "size"], offset: 0, limit: 1000 },
    }),
    await client.folders.createFolder({
      name: "测试目录",
      parent: { id: "0" },
    }),
    await client.folders.getFolderById("10"),
    await client.files.getFileById("20"),
    await client.folders.deleteFolderById("10", {
      queryParams: { recursive: true },
    }),
    await client.files.deleteFileById("20"),
  ];
  let error;
  try {
    await client.files.getFileById("denied");
  } catch (caught) {
    error = caught.message;
  }
  const defaults = new BoxClient({ auth });
  return JSON.parse(
    JSON.stringify({
      requests,
      results,
      error,
      sharedDefaults:
        defaults.files.networkSession === defaults.networkSession &&
        defaults.folders.networkSession === defaults.networkSession &&
        defaults.files.auth === auth &&
        defaults.folders.auth === auth,
      baseUrl: defaults.networkSession.baseUrls.baseUrl,
    })
  );
}
