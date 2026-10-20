import { CipherRclone } from "../../src/encryptRClone.ts";

async function rejectsSoon(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise.then(
        () => false,
        (error) => error instanceof Error && message.test(error.message)
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function workerLifecycleChecks() {
  const initializing = new CipherRclone("disposable-lifecycle-test", 1);
  const preparation = initializing.prepareByCallingWorker();
  initializing.closeResources();
  const closeCancelsPending = await rejectsSoon(preparation, /closed/);
  const closedCallsReject = await rejectsSoon(
    initializing.encryptNameByCallingWorker("test.md"),
    /closed/
  );
  const running = new CipherRclone("disposable-lifecycle-test", 1);
  try {
    await running.prepareByCallingWorker();
    const pending = running.encryptContentByCallingWorker(
      new Uint8Array([1, 2, 3]).buffer
    );
    await Promise.resolve();
    // Reproduce a stopped worker's error notification without an uncaught page error.
    running.workers[0].terminate();
    running.workers[0].dispatchEvent(new Event("error"));
    const workerFailureRejects = await rejectsSoon(
      pending,
      /stopped unexpectedly/
    );
    return { closeCancelsPending, closedCallsReject, workerFailureRejects };
  } finally {
    running.closeResources();
  }
}
