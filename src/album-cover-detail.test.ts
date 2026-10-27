import { expect, it } from 'vitest';
import { albumCoverDetail } from './album-cover-detail';
import sunset from './assets/albums-illustrations/animie_album.png';
import vinyl from './assets/albums-illustrations/vocaloid_album2.png';

it('retains anime flare only when requested, and can disable it on an original', async () => {
  expect(await albumCoverDetail('anime', sunset)).toBe('sunset');
  expect(await albumCoverDetail('anime', sunset, 'none')).toBeUndefined();
  expect(await albumCoverDetail('anime', '/replacement.jpg')).toBeUndefined();
  expect(await albumCoverDetail('anime', '/replacement.jpg', 'anime-lens')).toBe('sunset-window');
  expect(await albumCoverDetail('anime', '', 'anime-lens')).toBeUndefined();
});

it('does not apply anime overrides or replacement masks to other albums', async () => {
  expect(await albumCoverDetail('vocaloid', vinyl, 'none')).toBe('vinyl');
  for (const album of ['all', 'pop', 'vocaloid'])
    expect(await albumCoverDetail(album, '/replacement.jpg', 'anime-lens')).toBeUndefined();
});
