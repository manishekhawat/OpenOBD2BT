/**
 * PID support discovery.
 *
 * A vehicle advertises which Mode 01 PIDs it answers through a chain of 4-byte
 * bitmaps: 0100 covers PIDs 0x01-0x20, and if 0x20 itself is set, 0120 covers
 * the next block, and so on. Polling an unsupported PID wastes a round trip and
 * returns NO DATA, so the app asks first and only ever polls what is supported.
 */

/** The bitmap PIDs, in the order they must be walked. */
export const SUPPORT_BLOCK_PIDS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0] as const;

/**
 * Expand one 4-byte support bitmap into the PID numbers it reports.
 *
 * The high bit of the first byte is the lowest PID in the block, counting up.
 */
export function decodeSupportBitmap(basePid: number, data: number[]): number[] {
  const supported: number[] = [];
  for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
    const byte = data[byteIndex];
    if (byte === undefined) break;
    for (let bit = 0; bit < 8; bit += 1) {
      const isSet = (byte & (0x80 >> bit)) !== 0;
      if (isSet) supported.push(basePid + byteIndex * 8 + bit + 1);
    }
  }
  return supported;
}

/** Whether a bitmap block reports that the next block is available. */
export function reportsNextBlock(basePid: number, supported: number[]): boolean {
  return supported.includes(basePid + 0x20);
}
