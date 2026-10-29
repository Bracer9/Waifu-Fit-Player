import { expect, it } from 'vitest';
import { albumCoverDetail } from './album-cover-detail';
import sunset from './assets/albums-illustrations/animie_album.png';
import vinyl from './assets/albums-illustrations/vocaloid_album2.png';
import { readFileSync } from 'node:fs';

it('retains anime flare only when requested, and can disable it on an original', async () => {
  expect(await albumCoverDetail('anime', sunset)).toBe('sunset');
  expect(await albumCoverDetail('anime', sunset, 'none')).toBeUndefined();
  expect(await albumCoverDetail('anime', '/replacement.jpg')).toBeUndefined();
  expect(await albumCoverDetail('anime', '/replacement.jpg', 'anime-lens')).toBe('sunset-window');
  expect(await albumCoverDetail('anime', '', 'anime-lens')).toBeUndefined();
});

it('does not apply anime overrides or replacement masks to other albums', async () => {
  expect(await albumCoverDetail('vocaloid', vinyl, 'none')).toBe('vinyl-oil');
  for (const album of ['all', 'pop', 'vocaloid'])
    expect(await albumCoverDetail(album, '/replacement.jpg', 'anime-lens')).toBeUndefined();
});

it('recognizes the installed oil-paint covers saved as data URLs', async () => {
  for (const [album, file, kind] of [
    ['all', 'all_album.png', 'all-record-oil'],
    ['vocaloid', 'vocaloid_album2.png', 'vinyl-oil'],
    ['pop', 'pop_album.png', 'idol-stage'],
  ]) {
    const source = `data:image/png;base64,${readFileSync(new URL(`./assets/albums-illustrations/${file}`, import.meta.url)).toString('base64')}`;
    expect(await albumCoverDetail(album, source)).toBe(kind);
  }
});
