import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";

// Exercise the actual transitive get-uri/basic-ftp pair using disposable data.
export async function ftpCompatibilityCheck() {
  let require = createRequire(import.meta.url);
  for (const name of [
    "box-typescript-sdk-gen",
    "proxy-agent",
    "pac-proxy-agent",
    "get-uri",
  ]) {
    require = createRequire(require.resolve(name));
  }
  const { getUri } = require("./index.js");
  assert.equal(require("basic-ftp/package.json").version, "6.2.1");
  const content = 'function FindProxyForURL() { return "DIRECT"; }';
  const sockets = new Set();
  const dataServers = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setTimeout(10000, () => socket.destroy());
    let buffer = "";
    let dataConnection;
    socket.write("220 Local compatibility fixture\r\n");
    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const command = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const verb = command.split(" ")[0];
        if (verb === "USER") socket.write("331 Password required\r\n");
        else if (verb === "PASS") socket.write("230 Logged in\r\n");
        else if (verb === "FEAT") socket.write("211 No extensions\r\n");
        else if (verb === "MDTM") {
          socket.write(
            command.endsWith("/missing.pac")
              ? "550 Missing file\r\n"
              : "213 20261020000000\r\n"
          );
        } else if (verb === "EPSV") {
          const dataServer = createServer();
          dataServers.add(dataServer);
          dataConnection = once(dataServer, "connection").then(([data]) => {
            sockets.add(data);
            data.on("close", () => sockets.delete(data));
            data.on("error", () => {});
            return data;
          });
          dataServer.listen(0, "127.0.0.1");
          await once(dataServer, "listening");
          socket.write(
            `229 Entering Extended Passive Mode (|||${dataServer.address().port}|)\r\n`
          );
        } else if (verb === "RETR") {
          socket.write("150 Opening data connection\r\n");
          const data = await dataConnection;
          data.end(content, () => socket.write("226 Transfer complete\r\n"));
        } else if (verb === "QUIT") socket.end("221 Goodbye\r\n");
        else socket.write("200 OK\r\n");
      }
    });
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `ftp://127.0.0.1:${server.address().port}`;
    const stream = await getUri(`${base}/proxy.pac`, { timeout: 5000 });
    let actual = "";
    for await (const chunk of stream) actual += chunk.toString();
    assert.equal(actual, content);
    assert.equal(stream.lastModified.toISOString(), "2026-10-20T00:00:00.000Z");
    await assert.rejects(
      getUri(`${base}/proxy.pac`, { cache: stream, timeout: 5000 }),
      { code: "ENOTMODIFIED" }
    );
    await assert.rejects(getUri(`${base}/missing.pac`, { timeout: 5000 }), {
      code: "ENOTFOUND",
    });
    console.log("FTP compatibility passed: download, cache and missing file");
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      [...dataServers, server].map(
        (item) => new Promise((done) => item.close(done))
      )
    );
  }
}
