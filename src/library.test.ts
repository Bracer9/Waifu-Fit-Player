import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart } from './model';
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
    drafts: { dance: { chart, cover: 'cover', albumId: 'touhou', updatedAt: 1 } },
    released: {},
  };
}

describe('local drafts and released chart types', () => {
  it('publishes an independent snapshot; later draft edits cannot change it', () => {
    const draft = fixture();
    draft.drafts.dance!.chart.danceDifficulty = 8.5;
    const song = publishSong(draft, 'dance');
    song.drafts.dance!.chart.notes[0].timeMs = 2000;
    song.drafts.dance!.chart.danceDifficulty = 5;
    song.drafts.dance!.cover = 'new cover';
    expect(song.released.dance!.chart.notes[0].timeMs).toBe(1000);
    expect(song.released.dance!.cover).toBe('cover');
    expect(song.released.dance!.chart.chartType).toBe('dance');
    expect(song.released.dance!.chart.danceDifficulty).toBe(8.5);
    expect(parseChart(JSON.parse(serializeChart(song.released.dance!.chart))).danceDifficulty).toBe(
      8.5,
    );
  });
  it('accepts older charts without a rating and rejects invalid ratings', () => {
    const chart = fixture().drafts.dance!.chart;
    expect(parseChart(chart).danceDifficulty).toBeUndefined();
    for (const danceDifficulty of [-1, NaN, Infinity, '8.5'])
      expect(() => parseChart({ ...chart, danceDifficulty })).toThrow('舞蹈难度');
  });
  it('publishing a fitness draft leaves dance intact, including its offset', () => {
    const song = publishSong(fixture(), 'dance');
    const original = structuredClone(song.released.dance);
    song.drafts.fitness = structuredClone(song.drafts.dance);
    song.drafts.fitness!.chart.videoOffsetMs = 300;
    song.drafts.fitness!.chart.notes[0].timeMs = 4000;
    song.drafts.fitness!.chart.intensity = 'high';
    const published = publishSong(song, 'fitness');
    expect(published.released.dance).toEqual(original);
    expect(published.released.fitness!.chart.chartType).toBe('fitness');
    expect(published.released.fitness!.chart.videoOffsetMs).toBe(300);
    expect(published.released.fitness!.chart.intensity).toBe('high');
    expect(editionsIn(published, 'all')).toEqual(['fitness', 'dance']);
    expect(editionsIn(published, 'anime')).toEqual([]);
  });
  it('withdraws one chartType while keeping its draft and the other release', () => {
    const song = publishSong(fixture(), 'dance');
    song.drafts.fitness = structuredClone(song.drafts.dance);
    const both = publishSong(song, 'fitness');
    const withdrawn = unpublishSong(both, 'dance');
    expect(editionsIn(withdrawn, 'touhou')).toEqual(['fitness']);
    expect(withdrawn.drafts.dance).toEqual(song.drafts.dance);
    expect(editionsIn(unpublishSong(withdrawn, 'fitness'), 'all')).toEqual([]);
    expect(videoIds(withdrawn)).toEqual(['aabbccdd-1234-1234-1234-aabbccddeeff']);
  });
  it('updates only the explicitly published chartType and rejects an empty chart', () => {
    const song = publishSong(fixture(), 'dance');
    song.drafts.dance!.chart.notes[0].timeMs = 3000;
    expect(publishSong(song, 'dance').released.dance!.chart.notes[0].timeMs).toBe(3000);
    song.drafts.dance!.chart.notes = [];
    expect(() => publishSong(song, 'dance')).toThrow('空谱面');
  });
});
