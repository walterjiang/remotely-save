import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CryptoProvider } from "@azure/msal-node";
import PQueue from "p-queue";
import { BoxClient } from "../../build/boxClient.mjs";
import { entries, isEqual } from "../../build/lodash.mjs";
import { CipherRclone } from "../../src/encryptRClone.ts";
import { exerciseBoxClient } from "./boxChecks.mjs";
import { msalAuthorizationChecks } from "./msalChecks.mjs";
import { pcloudCompatibilityChecks } from "./pcloudChecks.mjs";
import { workerLifecycleChecks } from "./workerLifecycleChecks.mjs";

export async function run({ crc64: crc64Vectors, rclone, box }) {
  const boxResult = await exerciseBoxClient(BoxClient);
  const lifecycle = await workerLifecycleChecks();
  const msal = await msalAuthorizationChecks();
  const pcloud = await pcloudCompatibilityChecks();
  const queue = new PQueue({ concurrency: 2 });
  const queued = await queue.addAll([async () => 1, async () => 2]);
  const requests = [];
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://example.invalid",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
    requestHandler: {
      async handle(request) {
        requests.push(request.headers["x-amz-checksum-crc64nvme"]);
        if (!request.headers.authorization?.startsWith("AWS4-HMAC-SHA256"))
          throw Error("Missing S3 request signature");
        return {
          response: { statusCode: 200, headers: {}, body: new Uint8Array() },
        };
      },
    },
  });
  try {
    for (const vector of crc64Vectors) {
      await client.send(
        new PutObjectCommand({
          Bucket: "disposable-test",
          Key: "中文.txt",
          Body: new Uint8Array(vector.bytes),
          ChecksumAlgorithm: "CRC64NVME",
        })
      );
    }
  } finally {
    client.destroy();
  }
  const { verifier, challenge } =
    await new CryptoProvider().generatePkceCodes();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const cipher = new CipherRclone("disposable-build-test-password", 5);
  try {
    // Exercise concurrent initialization and key sharing across every worker.
    const encryptedNames = await Promise.all(
      rclone.names.map((name) => cipher.encryptNameByCallingWorker(name))
    );
    await cipher.prepareByCallingWorker();
    const decodedReference = await cipher.decryptContentByCallingWorker(
      new Uint8Array(rclone.encrypted).buffer
    );
    const name = "中文文件名.md";
    const encryptedName = await cipher.encryptNameByCallingWorker(name);
    const decodedName = await cipher.decryptNameByCallingWorker(encryptedName);
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    const encrypted = await cipher.encryptContentByCallingWorker(bytes.buffer);
    const encryptedLength = encrypted.byteLength;
    const decoded = await cipher.decryptContentByCallingWorker(encrypted);
    let invalidContentRejected = false;
    try {
      await cipher.decryptContentByCallingWorker(new Uint8Array([1, 2]).buffer);
    } catch (error) {
      invalidContentRejected = error instanceof Error;
    }
    const recovered = await cipher.decryptContentByCallingWorker(
      new Uint8Array(rclone.encrypted).buffer
    );
    return {
      ...lifecycle,
      ...msal,
      ...pcloud,
      pkce: verifier.length >= 43 && challenge === expected,
      filenameRoundTrip: decodedName === name && encryptedName !== name,
      contentRoundTrip: isEqual([...new Uint8Array(decoded)], [...bytes]),
      lodashImports: isEqual(entries({ a: { b: 1 } }), [["a", { b: 1 }]]),
      queue: isEqual(queued, [1, 2]),
      s3Crc64: isEqual(
        requests,
        crc64Vectors.map((v) => v.checksum)
      ),
      rcloneCompatibility:
        isEqual(encryptedNames, rclone.encryptedNames) &&
        isEqual([...new Uint8Array(decodedReference)], rclone.plain),
      boxCompatibility: isEqual(boxResult, box),
      inputPreserved: encrypted.byteLength === encryptedLength,
      invalidContentRejected:
        invalidContentRejected &&
        isEqual([...new Uint8Array(recovered)], rclone.plain),
    };
  } finally {
    cipher.closeResources();
  }
}
