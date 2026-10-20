import EncryptWorker from "./encryptRClone.worker?worker&inline";
export { getSizeFromOrigToEnc } from "./rcloneSize";

interface RecvMsg {
  status: "ok" | "error";
  outputName?: string;
  outputContent?: ArrayBuffer;
  error?: unknown;
  dataKeyBuf?: ArrayBuffer;
  nameKeyBuf?: ArrayBuffer;
  nameTweakBuf?: ArrayBuffer;
}

interface WorkerRequest {
  action:
    | "prepare"
    | "encryptName"
    | "decryptName"
    | "encryptContent"
    | "decryptContent";
  password?: string;
  dataKeyBuf?: ArrayBuffer;
  nameKeyBuf?: ArrayBuffer;
  nameTweakBuf?: ArrayBuffer;
  inputName?: string;
  inputContent?: ArrayBuffer;
}

export class CipherRclone {
  readonly password: string;
  readonly workers: Worker[] = [];
  private preparing?: Promise<void>;
  private failure?: Error;
  private pending = new Set<(error: Error) => void>();
  init = false;
  workerIdx = 0;

  constructor(password: string, workerNum: number) {
    if (!Number.isInteger(workerNum) || workerNum < 1)
      throw RangeError("Encryption requires a positive integer worker count");
    this.password = password;
    try {
      for (let i = 0; i < workerNum; i++) {
        const worker = new EncryptWorker();
        worker.addEventListener("error", () => {
          this.stop(Error("Encryption worker stopped unexpectedly"));
        });
        this.workers.push(worker);
      }
    } catch (error) {
      this.closeResources();
      throw error;
    }
  }

  closeResources() {
    this.stop(Error("Encryption workers closed"));
  }

  private stop(error: Error) {
    if (this.failure) return;
    this.failure = error;
    this.init = false;
    for (const cancel of [...this.pending]) cancel(error);
    for (const worker of this.workers) worker.terminate();
  }

  async prepareByCallingWorker(): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.init) return;
    this.preparing ??= this.prepareWorkers().catch((error) => {
      this.preparing = undefined;
      throw error;
    });
    await this.preparing;
  }

  private async prepareWorkers(): Promise<void> {
    // Derive once off the main thread, then share the same keys with all workers.
    const keys = await this.request(
      this.workers[0],
      {
        action: "prepare",
        password: this.password,
      },
      60000
    );
    if (!keys.dataKeyBuf || !keys.nameKeyBuf || !keys.nameTweakBuf)
      throw Error("Encryption worker returned incomplete keys");
    await Promise.all(
      this.workers.slice(1).map((worker) =>
        this.request(
          worker,
          {
            action: "prepare",
            dataKeyBuf: keys.dataKeyBuf,
            nameKeyBuf: keys.nameKeyBuf,
            nameTweakBuf: keys.nameTweakBuf,
          },
          60000
        )
      )
    );
    if (this.failure) throw this.failure;
    this.init = true;
  }

  private request(
    worker: Worker,
    payload: WorkerRequest,
    timeoutMs?: number
  ): Promise<RecvMsg> {
    return new Promise((resolve, reject) => {
      if (this.failure) {
        reject(this.failure);
        return;
      }
      const channel = new MessageChannel();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        this.pending.delete(cancel);
        channel.port1.close();
        channel.port2.close();
      };
      const cancel = (error: Error) => {
        cleanup();
        reject(error);
      };
      this.pending.add(cancel);
      if (timeoutMs !== undefined)
        timer = setTimeout(() => {
          cancel(Error("Encryption worker initialization timed out"));
        }, timeoutMs);
      channel.port2.onmessageerror = () =>
        cancel(Error("Encryption worker response could not be decoded"));
      channel.port2.onmessage = (event: MessageEvent<RecvMsg>) => {
        const reply = event.data;
        if (reply?.status !== "ok") {
          cancel(
            reply?.error instanceof Error
              ? reply.error
              : Error(`Encryption worker ${payload.action} failed`)
          );
          return;
        }
        cleanup();
        resolve(reply);
      };
      try {
        // Only transfer the port. The caller may reuse its input buffers.
        worker.postMessage(payload, [channel.port1]);
      } catch (error) {
        cancel(
          error instanceof Error
            ? error
            : Error("Encryption worker request failed")
        );
      }
    });
  }

  private async call(payload: WorkerRequest): Promise<RecvMsg> {
    await this.prepareByCallingWorker();
    this.workerIdx = (this.workerIdx + 1) % this.workers.length;
    return this.request(this.workers[this.workerIdx], payload);
  }

  async encryptNameByCallingWorker(inputName: string): Promise<string> {
    const reply = await this.call({ action: "encryptName", inputName });
    if (reply.outputName === undefined)
      throw Error("Encryption worker returned no filename");
    return reply.outputName;
  }

  async decryptNameByCallingWorker(inputName: string): Promise<string> {
    const reply = await this.call({ action: "decryptName", inputName });
    if (reply.outputName === undefined)
      throw Error("Encryption worker returned no filename");
    return reply.outputName;
  }

  async encryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const reply = await this.call({
      action: "encryptContent",
      inputContent: input,
    });
    if (reply.outputContent === undefined)
      throw Error("Encryption worker returned no content");
    return reply.outputContent;
  }

  async decryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const reply = await this.call({
      action: "decryptContent",
      inputContent: input,
    });
    if (reply.outputContent === undefined)
      throw Error("Encryption worker returned no content");
    return reply.outputContent;
  }
}
