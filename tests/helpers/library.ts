import { expect, type Page } from '@playwright/test';
import type { Album, Song } from '../../src/library';
import type { MapLibrary } from '../../src/song-pack';

export async function readSongs(page: Page): Promise<Song[]> {
  const index = (await (await page.request.get('/__wfp/maps')).json()) as MapLibrary;
  return index.songs.filter(
    (song) =>
      !song.hidden && (Object.keys(song.drafts).length || Object.keys(song.released).length),
  );
}
/** Seed through the same filesystem API as the app, including copied songs' video associations. */
export async function putSongs(page: Page, songs: Song[]) {
  const index = (await (await page.request.get('/__wfp/maps')).json()) as MapLibrary;
  for (const song of songs) {
    const editions = [...Object.values(song.drafts), ...Object.values(song.released)];
    for (const assetId of new Set(editions.map((e) => e.chart.videoHint.assetId))) {
      const video = index.videos.find(
        (v) => v.id === assetId || v.aliases?.includes(assetId ?? ''),
      );
      if (!video) throw new Error('Missing fixture video');
      const attached = await page.request.post('/__wfp/workspace/attach', {
        headers: { 'X-WFP-Workspace': '1' },
        data: {
          id: song.id,
          title: editions[0].chart.title,
          assetId,
          source: video.url,
          folder: index.locations?.[song.id]?.folder,
        },
      });
      expect(attached.ok()).toBe(true);
    }
    const result = await page.request.post('/__wfp/workspace/song', {
      headers: { 'X-WFP-Workspace': '1' },
      data: { song },
    });
    expect(result.ok(), await result.text()).toBe(true);
  }
}
export async function putAlbums(page: Page, albums: Album[]) {
  for (const album of albums) {
    const response = await page.request.post('/__wfp/workspace/album', {
      headers: { 'X-WFP-Workspace': '1' },
      data: { album },
    });
    expect(response.ok()).toBe(true);
  }
}
