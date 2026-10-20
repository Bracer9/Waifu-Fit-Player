export type ZipEntry = { name: string; blob: Blob };
const table = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

/** Store MP4/images unchanged. Read checksums in bounded chunks, keep payloads as Blob parts. */
export async function createZip(
  entries: ZipEntry[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  if (entries.length > 65535) throw new Error('曲包文件数量过多。');
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [],
    central: BlobPart[] = [];
  const names = new Set<string>();
  const total = entries.reduce((sum, entry) => sum + entry.blob.size, 0);
  let offset = 0,
    processed = 0,
    centralSize = 0;
  for (const entry of entries) {
    if (!entry.name || /(^\/|\\|(?:^|\/)\.\.(?:\/|$))/.test(entry.name) || names.has(entry.name))
      throw new Error('曲包文件名无效或重复。');
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const size = entry.blob.size;
    if (name.length > 65535 || size >= 0xffffffff || offset + size + name.length + 30 >= 0xffffffff)
      throw new Error('单个曲包需小于 4 GB，请拆分导出。');
    let crc = 0xffffffff;
    for (let at = 0; at < size; at += 1024 * 1024) {
      const chunk = new Uint8Array(await entry.blob.slice(at, at + 1024 * 1024).arrayBuffer());
      for (const byte of chunk) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      processed += chunk.length;
      onProgress?.(total ? processed / total : 1);
      // Yield so the progress UI and cancel/close events can paint during large exports.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30),
      h = new DataView(local.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);
    h.setUint32(22, size, true);
    h.setUint16(26, name.length, true);
    parts.push(local, name, entry.blob);
    const directory = new Uint8Array(46),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 0x21, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, size, true);
    d.setUint32(24, size, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    central.push(directory, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + size;
  }
  if (offset + centralSize + 22 >= 0xffffffff) throw new Error('曲包超过 4 GB。');
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  onProgress?.(1);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
