declare module "*?worker&inline" {
  export default class InlineWorker extends Worker {
    constructor(options?: WorkerOptions);
  }
}
