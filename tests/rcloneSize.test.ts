import { strict as assert } from "assert";
import { encryptedSize } from "@fyears/rclone-crypt";
import { getSizeFromOrigToEnc } from "../src/rcloneSize";

describe("RClone encrypted file size", () => {
  it("matches the upstream format at block boundaries", () => {
    for (const size of [0, 1, 65535, 65536, 65537, 131072, 14787203]) {
      assert.equal(getSizeFromOrigToEnc(size), encryptedSize(size));
    }
  });
});
