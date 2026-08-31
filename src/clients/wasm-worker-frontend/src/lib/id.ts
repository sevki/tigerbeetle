// Generates a random, non-zero u64-range decimal-string ID suitable for TigerBeetle account/
// transfer IDs (u128, but a u64-range value is plenty of entropy for a demo UI and stays
// comfortably inside Number.MAX_SAFE_INTEGER-adjacent BigInt arithmetic).
export function randomId(): string {
  const high = BigInt(Date.now());
  const low = BigInt(Math.floor(Math.random() * 0xffffffff));
  return (high * BigInt(0x100000000) + low).toString();
}
