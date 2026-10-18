import { describe, expect, it } from 'vitest';
import { blankChart } from './model';
import { editionsIn, publishSong, unpublishSong, videoIds, type Song } from './library';

function fixture(): Song {
  const chart = blankChart('Sunlight');
  chart.videoHint = {
    assetId: 'aabbccdd-1234-1234-1234-aabbccddeeff',
    fileName: 'song.mp4',
    durationMs: 10000,
  };
  chart.notes = [{ id: 'note', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' }];
  return {
    id: '11223344-1234-1234-1234-aabbccddeeff',
    drafts: { hard: { chart, cover: 'cover', albumId: 'touhou', updatedAt: 1 } },
    released: {},
  };
}

describe('local drafts and released difficulties', () => {
  it('publishes an independent snapshot; later draft edits cannot change it', () => {
    const song = publishSong(fixture(), 'hard');
    song.drafts.hard!.chart.notes[0].timeMs = 2000;
    song.drafts.hard!.cover = 'new cover';
    expect(song.released.hard!.chart.notes[0].timeMs).toBe(1000);
    expect(song.released.hard!.cover).toBe('cover');
    expect(song.released.hard!.chart.difficulty).toBe('hard');
  });
  it('publishing a changed draft as Normal leaves Hard intact, including its offset', () => {
    const song = publishSong(fixture(), 'hard');
    const original = structuredClone(song.released.hard);
    song.drafts.normal = structuredClone(song.drafts.hard);
    song.drafts.normal!.chart.videoOffsetMs = 300;
    song.drafts.normal!.chart.notes[0].timeMs = 4000;
    const published = publishSong(song, 'normal');
    expect(published.released.hard).toEqual(original);
    expect(published.released.normal!.chart.difficulty).toBe('normal');
    expect(published.released.normal!.chart.videoOffsetMs).toBe(300);
    expect(editionsIn(published, 'all')).toEqual(['normal', 'hard']);
    expect(editionsIn(published, 'anime')).toEqual([]);
  });
  it('withdraws one difficulty while keeping its draft and the other release', () => {
    const song = publishSong(fixture(), 'hard');
    song.drafts.normal = structuredClone(song.drafts.hard);
    const both = publishSong(song, 'normal');
    const withdrawn = unpublishSong(both, 'hard');
    expect(editionsIn(withdrawn, 'touhou')).toEqual(['normal']);
    expect(withdrawn.drafts.hard).toEqual(song.drafts.hard);
    expect(editionsIn(unpublishSong(withdrawn, 'normal'), 'all')).toEqual([]);
    expect(videoIds(withdrawn)).toEqual(['aabbccdd-1234-1234-1234-aabbccddeeff']);
  });
  it('updates only the explicitly published difficulty and rejects an empty chart', () => {
    const song = publishSong(fixture(), 'hard');
    song.drafts.hard!.chart.notes[0].timeMs = 3000;
    expect(publishSong(song, 'hard').released.hard!.chart.notes[0].timeMs).toBe(3000);
    song.drafts.hard!.chart.notes = [];
    expect(() => publishSong(song, 'hard')).toThrow('空谱面');
  });
});
