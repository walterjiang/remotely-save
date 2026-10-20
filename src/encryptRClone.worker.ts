import { Cipher as CipherRCloneCryptPack } from "@fyears/rclone-crypt";
import { nanoid } from "nanoid";

const ctx: WorkerGlobalScope = self as any;

const workerNanoID = nanoid();
const cipher = new CipherRCloneCryptPack("base64");

// console.debug(`worker [${workerNanoID}]: cipher created`);

async function encryptNameStr(input: string) {
  const res = await cipher.encryptFileName(input);
  return res;
}

async function decryptNameStr(input: string) {
  return await cipher.decryptFileName(input);
}

async function encryptContentBuf(input: ArrayBuffer) {
  return (await cipher.encryptData(new Uint8Array(input), undefined)).buffer;
}

async function decryptContentBuf(input: ArrayBuffer) {
  return (await cipher.decryptData(new Uint8Array(input))).buffer;
}

ctx.addEventListener("message", async (event: any) => {
  const port: MessagePort = event.ports[0];
  const {
    action,
    dataKeyBuf,
    nameKeyBuf,
    nameTweakBuf,
    inputName,
    inputContent,
    password,
  } = event.data as {
    action:
      | "prepare"
      | "encryptContent"
      | "decryptContent"
      | "encryptName"
      | "decryptName";
    dataKeyBuf?: ArrayBuffer;
    nameKeyBuf?: ArrayBuffer;
    nameTweakBuf?: ArrayBuffer;
    inputName?: string;
    inputContent?: ArrayBuffer;
    password?: string;
  };

  // console.debug(`worker [${workerNanoID}]: receiving action=${action}`);

  if (action === "prepare") {
    // console.debug(`worker [${workerNanoID}]: prepare: start`);
    try {
      if (password !== undefined) {
        await cipher.key(password, "");
      } else {
        if (
          dataKeyBuf === undefined ||
          nameKeyBuf === undefined ||
          nameTweakBuf === undefined
        ) {
          throw Error("Encryption worker received incomplete keys");
        }
        cipher.updateInternalKey(
          new Uint8Array(dataKeyBuf),
          new Uint8Array(nameKeyBuf),
          new Uint8Array(nameTweakBuf)
        );
      }
      port.postMessage({
        status: "ok",
        ...(password !== undefined
          ? {
              dataKeyBuf: cipher.dataKey.buffer,
              nameKeyBuf: cipher.nameKey.buffer,
              nameTweakBuf: cipher.nameTweak.buffer,
            }
          : {}),
      });
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "encryptName") {
    try {
      if (inputName === undefined) {
        throw Error(
          `worker [${workerNanoID}]: encryptName: internal inputName not transferred to worker properly`
        );
      }
      const outputName = await encryptNameStr(inputName);
      // console.debug(
      //   `worker [${workerNanoID}]: after encryptNameStr, before postMessage`
      // );
      port.postMessage({
        status: "ok",
        outputName: outputName,
      });
    } catch (error) {
      console.error(`worker [${workerNanoID}]: encryptName=${inputName}`);
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "decryptName") {
    try {
      if (inputName === undefined) {
        throw Error(
          `worker [${workerNanoID}]: decryptName: internal inputName not transferred to worker properly`
        );
      }
      const outputName = await decryptNameStr(inputName);
      // console.debug(
      //   `worker [${workerNanoID}]: after decryptNameStr, before postMessage`
      // );
      port.postMessage({
        status: "ok",
        outputName: outputName,
      });
    } catch (error) {
      console.error(`worker [${workerNanoID}]: decryptName=${inputName}`);
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "encryptContent") {
    try {
      if (inputContent === undefined) {
        throw Error(
          `worker [${workerNanoID}]: encryptContent: internal inputContent not transferred to worker properly`
        );
      }
      const outputContent = await encryptContentBuf(inputContent);
      // console.debug(
      //   `worker [${workerNanoID}]: after encryptContentBuf, before postMessage`
      // );
      port.postMessage(
        {
          status: "ok",
          outputContent: outputContent,
        },
        [outputContent] // on worker side, we don't reuse anything so it's safe to transfer
      );
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "decryptContent") {
    try {
      if (inputContent === undefined) {
        throw Error(
          `worker [${workerNanoID}]: decryptContent: internal inputContent not transferred to worker properly`
        );
      }
      const outputContent = await decryptContentBuf(inputContent);
      // console.debug(
      //   `worker [${workerNanoID}]: after decryptContentBuf, before postMessage`
      // );
      port.postMessage(
        {
          status: "ok",
          outputContent: outputContent,
        },
        [outputContent] // on worker side, we don't reuse anything so it's safe to transfer
      );
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else {
    port.postMessage({
      status: "error",
      error: `worker [${workerNanoID}]: unknown action=${action}`,
    });
  }
});
