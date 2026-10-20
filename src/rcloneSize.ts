// RClone Crypt format: 32-byte file header and a 16-byte tag per 64 KiB block.
// Equivalent to encryptedSize in @fyears/rclone-crypt (MIT).
export function getSizeFromOrigToEnc(size: number): number {
  const blocks = Math.floor(size / 65536);
  const residue = size % 65536;
  return 32 + blocks * (65536 + 16) + (residue === 0 ? 0 : 16 + residue);
}
