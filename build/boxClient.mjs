import { FilesManager } from "box-typescript-sdk-gen/lib/managers/files.generated";
import { FoldersManager } from "box-typescript-sdk-gen/lib/managers/folders.generated";
import { BaseUrls } from "box-typescript-sdk-gen/lib/networking/baseUrls.generated";
import { NetworkSession } from "box-typescript-sdk-gen/lib/networking/network.generated";

// Compose the official managers used by this plugin, sharing the same session
// as the full SDK client. Request handling and serialization stay in the SDK.
export class BoxClient {
  constructor({ auth, networkSession }) {
    this.auth = auth;
    this.networkSession =
      networkSession ?? new NetworkSession({ baseUrls: new BaseUrls({}) });
    const fields = { auth: this.auth, networkSession: this.networkSession };
    this.files = new FilesManager(fields);
    this.folders = new FoldersManager(fields);
  }
}
