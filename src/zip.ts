const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

function safeSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('曲包资源大小或位置无效。');
}

/** APPNOTE 4.5.3: ZIP64 fields appear only for corresponding sentinel values. */
export function zipHeaders(name: Uint8Array, size: number, crc: number, offset: number) {
  safeSize(size);
  safeSize(offset);
  if (name.length > MAX16) throw new Error('曲包文件名过长。');
  const largeSize = size >= MAX32;
  const largeOffset = offset >= MAX32;
  const zip64 = largeSize || largeOffset;
  const localExtra = largeSize ? 20 : 0;
  const centralExtra = zip64 ? 4 + (largeSize ? 16 : 0) + (largeOffset ? 8 : 0) : 0;
  const local = new Uint8Array(30 + name.length + localExtra);
  const h = new DataView(local.buffer);
  h.setUint32(0, 0x04034b50, true);
  h.setUint16(4, zip64 ? 45 : 20, true);
  h.setUint16(6, 0x800, true);
  h.setUint16(12, 0x21, true);
  h.setUint32(14, crc, true);
  h.setUint32(18, largeSize ? MAX32 : size, true);
  h.setUint32(22, largeSize ? MAX32 : size, true);
  h.setUint16(26, name.length, true);
  h.setUint16(28, localExtra, true);
  local.set(name, 30);
  if (largeSize) {
    const at = 30 + name.length;
    h.setUint16(at, 1, true);
    h.setUint16(at + 2, 16, true);
    h.setBigUint64(at + 4, BigInt(size), true);
    h.setBigUint64(at + 12, BigInt(size), true);
  }
  const directory = new Uint8Array(46 + name.length + centralExtra);
  const d = new DataView(directory.buffer);
  d.setUint32(0, 0x02014b50, true);
  d.setUint16(4, zip64 ? 45 : 20, true);
  d.setUint16(6, zip64 ? 45 : 20, true);
  d.setUint16(8, 0x800, true);
  d.setUint16(14, 0x21, true);
  d.setUint32(16, crc, true);
  d.setUint32(20, largeSize ? MAX32 : size, true);
  d.setUint32(24, largeSize ? MAX32 : size, true);
  d.setUint16(28, name.length, true);
  d.setUint16(30, centralExtra, true);
  d.setUint32(42, largeOffset ? MAX32 : offset, true);
  directory.set(name, 46);
  if (zip64) {
    let at = 46 + name.length;
    d.setUint16(at, 1, true);
    d.setUint16(at + 2, centralExtra - 4, true);
    at += 4;
    if (largeSize) {
      d.setBigUint64(at, BigInt(size), true);
      d.setBigUint64(at + 8, BigInt(size), true);
      at += 16;
    }
    if (largeOffset) d.setBigUint64(at, BigInt(offset), true);
  }
  return { local, directory, zip64 };
}

/** Standard end record, preceded by ZIP64 end + locator when needed. */
export function zipEnd(count: number, centralSize: number, offset: number, zip64 = false) {
  [count, centralSize, offset, centralSize + offset].forEach(safeSize);
  zip64 ||= count >= MAX16 || centralSize >= MAX32 || offset + centralSize >= MAX32;
  const result = new Uint8Array((zip64 ? 76 : 0) + 22);
  const view = new DataView(result.buffer);
  if (zip64) {
    view.setUint32(0, 0x06064b50, true);
    view.setBigUint64(4, 44n, true);
    view.setUint16(12, 45, true);
    view.setUint16(14, 45, true);
    view.setBigUint64(24, BigInt(count), true);
    view.setBigUint64(32, BigInt(count), true);
    view.setBigUint64(40, BigInt(centralSize), true);
    view.setBigUint64(48, BigInt(offset), true);
    view.setUint32(56, 0x07064b50, true);
    view.setBigUint64(64, BigInt(offset + centralSize), true);
    view.setUint32(72, 1, true);
  }
  const at = zip64 ? 76 : 0;
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, Math.min(count, MAX16), true);
  view.setUint16(at + 10, Math.min(count, MAX16), true);
  view.setUint32(at + 12, Math.min(centralSize, MAX32), true);
  view.setUint32(at + 16, Math.min(offset, MAX32), true);
  return result;
}

export type ZipEntry = { name: string; blob: Blob };
const table = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
/** Small in-memory ZIP utility; local song exports use the server's file stream. */
export async function createZip(
  entries: ZipEntry[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const parts: BlobPart[] = [],
    central: BlobPart[] = [],
    names = new Set<string>();
  const total = entries.reduce((sum, entry) => sum + entry.blob.size, 0);
  let offset = 0,
    processed = 0,
    centralSize = 0,
    needsZip64 = false;
  for (const entry of entries) {
    if (!entry.name || /(^\/|\\|(?:^|\/)\.\.(?:\/|$))/.test(entry.name) || names.has(entry.name))
      throw new Error('曲包文件名无效或重复。');
    names.add(entry.name);
    let crc = 0xffffffff;
    for (let at = 0; at < entry.blob.size; at += 1024 * 1024) {
      const chunk = new Uint8Array(await entry.blob.slice(at, at + 1024 * 1024).arrayBuffer());
      for (const byte of chunk) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      processed += chunk.length;
      onProgress?.(total ? processed / total : 1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const h = zipHeaders(
      new TextEncoder().encode(entry.name),
      entry.blob.size,
      (crc ^ 0xffffffff) >>> 0,
      offset,
    );
    parts.push(h.local, entry.blob);
    central.push(h.directory);
    needsZip64 ||= h.zip64;
    centralSize += h.directory.length;
    offset += h.local.length + entry.blob.size;
  }
  onProgress?.(1);
  return new Blob([...parts, ...central, zipEnd(entries.length, centralSize, offset, needsZip64)], {
    type: 'application/zip',
  });
}
