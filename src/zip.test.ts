import { expect, it } from 'vitest';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipEnd, zipHeaders } from './zip';

const name = new TextEncoder().encode('video.mp4');
const max = 0xffffffff;
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

it('uses ZIP64 size fields at the 32-bit sentinel and preserves 64-bit values without truncation', () => {
  for (const size of [max, max + 1, 5 * 1024 ** 3]) {
    const { local, directory, zip64 } = zipHeaders(name, size, 123, 0);
    expect(zip64).toBe(true);
    const h = view(local),
      d = view(directory);
    expect(h.getUint16(4, true)).toBe(45);
    expect(h.getUint32(18, true)).toBe(max);
    expect(h.getUint32(22, true)).toBe(max);
    expect(h.getUint16(28, true)).toBe(20);
    expect(h.getUint16(30 + name.length, true)).toBe(1);
    expect(h.getBigUint64(34 + name.length, true)).toBe(BigInt(size));
    expect(h.getBigUint64(42 + name.length, true)).toBe(BigInt(size));
    expect(d.getUint16(30, true)).toBe(20);
    expect(d.getBigUint64(50 + name.length, true)).toBe(BigInt(size));
    expect(d.getBigUint64(58 + name.length, true)).toBe(BigInt(size));
  }
  expect(zipHeaders(name, max - 1, 0, 0).zip64).toBe(false);
});

it('writes offset-only extensions, combined extensions and the correct ZIP64 end/locator', () => {
  const offset = 5 * 1024 ** 3;
  const small = zipHeaders(name, 9, 0, offset);
  expect(view(small.local).getUint16(28, true)).toBe(0);
  expect(view(small.directory).getUint32(20, true)).toBe(9);
  expect(view(small.directory).getUint32(42, true)).toBe(max);
  expect(view(small.directory).getUint16(30, true)).toBe(12);
  expect(view(small.directory).getBigUint64(50 + name.length, true)).toBe(BigInt(offset));
  const combined = zipHeaders(name, max + 3, 0, offset);
  expect(view(combined.directory).getUint16(30, true)).toBe(28);
  expect(view(combined.directory).getBigUint64(66 + name.length, true)).toBe(BigInt(offset));
  const end = view(zipEnd(2, 1000, offset));
  expect(end.byteLength).toBe(98);
  expect(end.getUint32(0, true)).toBe(0x06064b50);
  expect(end.getBigUint64(4, true)).toBe(44n);
  expect(end.getBigUint64(32, true)).toBe(2n);
  expect(end.getBigUint64(40, true)).toBe(1000n);
  expect(end.getBigUint64(48, true)).toBe(BigInt(offset));
  expect(end.getUint32(56, true)).toBe(0x07064b50);
  expect(end.getBigUint64(64, true)).toBe(BigInt(offset + 1000));
  expect(end.getUint32(76, true)).toBe(0x06054b50);
  expect(end.getUint32(92, true)).toBe(max);
  expect(view(zipEnd(65534, 1000, 1000)).byteLength).toBe(22);
  const count = view(zipEnd(65535, 1000, 1000));
  expect(count.getBigUint64(32, true)).toBe(65535n);
  expect(count.getUint16(86, true)).toBe(65535);
});

it('a standard ZIP reader seeks and extracts a file beyond 4GB from a sparse ZIP64 archive', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wfp-zip64-'));
  try {
    const largeSize = 2 ** 32 + 17;
    const first = zipHeaders(name, largeSize, 0, 0);
    const secondOffset = first.local.length + largeSize;
    const second = zipHeaders(new TextEncoder().encode('check.txt'), 9, 0xcbf43926, secondOffset);
    const directoryOffset = secondOffset + second.local.length + 9;
    const end = zipEnd(2, first.directory.length + second.directory.length, directoryOffset, true);
    const zipPath = path.join(root, 'large.zip');
    const file = await open(zipPath, 'w+');
    try {
      if (process.platform === 'win32')
        execFileSync('fsutil', ['sparse', 'setflag', zipPath], { timeout: 10000 });
      await file.write(first.local, 0, first.local.length, 0);
      await file.write(second.local, 0, second.local.length, secondOffset);
      await file.write(Buffer.from('123456789'), 0, 9, secondOffset + second.local.length);
      const tail = Buffer.concat([first.directory, second.directory, end]);
      await file.write(tail, 0, tail.length, directoryOffset);
    } finally {
      await file.close();
    }
    // libarchive reads metadata + the tiny trailing file, never extracts the 4GB gap.
    const options = { encoding: 'utf8' as const, timeout: 10000 };
    expect(execFileSync('tar', ['-tvf', zipPath], options)).toContain(String(largeSize));
    expect(execFileSync('tar', ['-xOf', zipPath, 'check.txt'], options)).toBe('123456789');
  } finally {
    if (!path.resolve(root).startsWith(path.join(path.resolve(tmpdir()), 'wfp-zip64-')))
      throw new Error('Unexpected ZIP64 test path');
    await rm(root, { recursive: true, force: true });
  }
});
