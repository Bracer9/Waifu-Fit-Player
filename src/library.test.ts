import { describe, expect, it } from 'vitest';
import { blankChart, parseChart, serializeChart } from './model';
import {
  editionsIn,
  publishSong,
  unpublishSong,
  videoIds,
  saveNamedDraft,
  overwriteActiveDraft,
  updateWorkingDraft,
  selectNamedDraft,
  selectedDraftId,
  type Song,
} from './library';

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
    drafts: { dance: { chart, cover: 'cover', albumId: 'anime', updatedAt: 1 } },
    released: {},
  };
}

describe('local drafts and released chart types', () => {
  it('ordinary save overwrites only the active version without creating a name or mutating other snapshots', () => {
    const unnamed = fixture();
    expect(overwriteActiveDraft(unnamed, 'dance')).toBe(unnamed);
    let song = saveNamedDraft(publishSong(unnamed, 'dance'), 'dance', '初版');
    const firstId = song.activeDrafts!.dance!;
    song = saveNamedDraft(song, 'dance', '副本');
    const before = structuredClone(song);
    const edition = structuredClone(song.drafts.dance!);
    edition.chart.notes[0].timeMs = 5000;
    const saved = overwriteActiveDraft(
      updateWorkingDraft(song, 'dance', edition, firstId),
      'dance',
    );
    expect(saved.namedDrafts).toHaveLength(2);
    expect(saved.namedDrafts!.find((d) => d.id === firstId)!.chart.notes[0].timeMs).toBe(5000);
    expect(saved.namedDrafts!.find((d) => d.id !== firstId)).toEqual(
      before.namedDrafts!.find((d) => d.id !== firstId),
    );
    expect(saved.released).toEqual(before.released);
    expect(song).toEqual(before);
  });
  it('keeps named versions independent from autosave, updates by name and preserves the other type and releases', () => {
    const original = publishSong(fixture(), 'dance');
    let s = saveNamedDraft(original, 'dance', ' 初版 ');
    const a = structuredClone(s.namedDrafts![0]),
      released = structuredClone(s.released);
    const edited = structuredClone(s.drafts.dance!);
    edited.chart.notes[0].timeMs = 2200;
    s = updateWorkingDraft(s, 'dance', edited, a.id);
    expect(s.namedDrafts![0]).toEqual(a);
    expect(selectedDraftId(s, 'dance')).toBe('');
    s = saveNamedDraft(s, 'dance', '修订版');
    expect(s.namedDrafts).toHaveLength(2);
    expect(s.namedDrafts!.find((d) => d.id === a.id)).toEqual(a);
    const b = structuredClone(s.namedDrafts!.find((d) => d.name === '修订版')!);
    s = selectNamedDraft(s, 'dance', a.id);
    expect(s.drafts.dance!.chart.notes[0].timeMs).toBe(1000);
    const again = structuredClone(s.drafts.dance!);
    again.chart.notes[0].timeMs = 3300;
    s = saveNamedDraft(updateWorkingDraft(s, 'dance', again, a.id), 'dance', '初版');
    expect(s.namedDrafts).toHaveLength(2);
    expect(s.namedDrafts!.find((d) => d.id === a.id)!.chart.notes[0].timeMs).toBe(3300);
    expect(s.namedDrafts!.find((d) => d.id === b.id)).toEqual(b);
    expect(s.released).toEqual(released);
    expect(original.namedDrafts).toBeUndefined();
  });
  it('preserves modified working notes before loading another version and validates draft names', () => {
    let s = saveNamedDraft(fixture(), 'dance', '原版');
    const id = s.namedDrafts![0].id;
    const edited = structuredClone(s.drafts.dance!);
    edited.chart.notes[0].timeMs = 4400;
    s = updateWorkingDraft(s, 'dance', edited, id);
    s = selectNamedDraft(s, 'dance', id);
    expect(s.drafts.dance!.chart.notes[0].timeMs).toBe(1000);
    expect(s.namedDrafts!.find((d) => d.name === '未命名草稿')!.chart.notes[0].timeMs).toBe(4400);
    expect(() => saveNamedDraft(s, 'dance', ' ')).toThrow(/名称/);
    expect(() => saveNamedDraft(s, 'dance', 'a'.repeat(61))).toThrow(/名称/);
    expect(() => selectNamedDraft(s, 'fitness', id)).toThrow(/未找到/);
  });
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
    expect(editionsIn(published, 'pop')).toEqual([]);
  });
  it('withdraws one chartType while keeping its draft and the other release', () => {
    const song = publishSong(fixture(), 'dance');
    song.drafts.fitness = structuredClone(song.drafts.dance);
    const both = publishSong(song, 'fitness');
    const withdrawn = unpublishSong(both, 'dance');
    expect(editionsIn(withdrawn, 'anime')).toEqual(['fitness']);
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
