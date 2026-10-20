// Use the same hash/random implementations as crypto-browserify without pulling
// in unused signing, elliptic-curve and cipher APIs. MSAL uses these three APIs.
import createHash from "create-hash";
import randomBytes from "randombytes";
import { v4 as randomUUID } from "uuid";

export { createHash, randomBytes, randomUUID };
export default { createHash, randomBytes, randomUUID };
