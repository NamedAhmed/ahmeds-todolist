// Tests for the data store: undo, redo and restoring a backup. Run with: npm test
import { beforeEach, describe, expect, it } from 'vitest';
import { dailiesOn } from './lib.js';
import { all, allIncludingTrashed, commit, exportJson, getState, importJson, purgeExpiredTrash, redo, resetAll, TRASH_RETENTION_MS, undo } from './store.js';

const titles = () => all(getState(), 'tasks').map((t) => t.title).sort();

describe('undo and redo', () => {
  beforeEach(() => resetAll());

  it('undoes and redoes a group of changes as one step', () => {
    commit('add two', [
      { t: 'tasks', id: 'a', patch: { title: 'A' } },
      { t: 'tasks', id: 'b', patch: { title: 'B' } },
    ]);
    expect(undo()).toBe('add two');
    expect(titles()).toEqual([]);
    expect(redo()).toBe('add two');
    expect(titles()).toEqual(['A', 'B']);
  });

  it('brings back a deleted item with everything it had', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'A', due: '2026-11-01', done: false } }]);
    commit('delete', [{ t: 'tasks', id: 'a', set: null }]);
    expect(titles()).toEqual([]);
    undo();
    expect(getState().tasks.a).toMatchObject({ title: 'A', due: '2026-11-01', done: false });
  });

  it('a new change clears what could be redone', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'A' } }]);
    undo();
    commit('other', [{ t: 'tasks', id: 'b', patch: { title: 'B' } }]);
    expect(redo()).toBeNull();
  });

  it('says so when there is nothing to undo', () => {
    expect(undo()).toBeNull();
  });
});

describe('Recently Deleted', () => {
  beforeEach(() => resetAll());

  it('hides trashed items from active lists while keeping them recoverable and backed up', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'A' } }]);
    commit('trash', [{ t: 'tasks', id: 'a', patch: { trashed: Date.now() } }]);

    expect(all(getState(), 'tasks')).toEqual([]);
    expect(allIncludingTrashed(getState(), 'tasks')).toMatchObject([{ id: 'a', title: 'A' }]);
    expect(JSON.parse(exportJson()).tasks).toMatchObject([{ id: 'a', title: 'A' }]);
  });

  it('restores an item without losing its saved content', () => {
    commit('add', [{ t: 'notes', id: 'n', patch: { title: 'Plan', body: 'Keep this' } }]);
    commit('trash', [{ t: 'notes', id: 'n', patch: { trashed: Date.now() } }]);
    commit('restore', [{ t: 'notes', id: 'n', patch: { trashed: null } }]);

    expect(all(getState(), 'notes')).toMatchObject([{ id: 'n', title: 'Plan', body: 'Keep this' }]);
  });

  it('expires dailies from Recently Deleted without erasing their history', () => {
    const now = new Date(2026, 10, 15, 12).getTime();
    const trashed = now - TRASH_RETENTION_MS - 1;
    commit('add', [
      { t: 'dailies', id: 'old', patch: { name: 'Old daily', created: '2026-01-01', trashed } },
      { t: 'completions', id: 'old:2026-10-15', patch: { ref: 'old', date: '2026-10-15', kind: 'daily' } },
      { t: 'tasks', id: 'recent', patch: { title: 'Recent task', trashed: now - TRASH_RETENTION_MS + 1 } },
    ]);

    expect(purgeExpiredTrash(now)).toBe(1);
    expect(allIncludingTrashed(getState(), 'dailies')).toMatchObject([{ id: 'old', trashed: null, archived: '2026-10-16' }]);
    expect(dailiesOn(getState(), '2026-10-15').map((daily) => daily.id)).toEqual(['old']);
    expect(dailiesOn(getState(), '2026-10-16')).toEqual([]);
    expect(allIncludingTrashed(getState(), 'completions')).toMatchObject([{ id: 'old:2026-10-15' }]);
    expect(allIncludingTrashed(getState(), 'tasks')).toMatchObject([{ id: 'recent' }]);
    expect(undo()).toBe('add');
    expect(allIncludingTrashed(getState(), 'dailies')).toMatchObject([{ id: 'old', archived: '2026-10-16', trashed: null }]);
    expect(allIncludingTrashed(getState(), 'tasks')).toEqual([]);
  });
});

describe('backups', () => {
  beforeEach(() => resetAll());

  it('a backup restores the same items, without internal markers', () => {
    commit('add', [
      { t: 'tasks', id: 'a', patch: { title: 'A' } },
      { t: 'dailies', id: 'd', patch: { name: 'Read' } },
    ]);
    const backup = exportJson();
    expect(backup).not.toContain('_dirty');

    resetAll();
    expect(importJson(backup)).toEqual({ added: 2, replaced: 0 });
    expect(titles()).toEqual(['A']);
    expect(all(getState(), 'dailies').map((d) => d.name)).toEqual(['Read']);
  });

  it('restoring replaces items with the same id, and one Undo takes the whole restore back', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Old' } }]);
    expect(importJson(JSON.stringify({ tasks: [{ id: 'a', title: 'New' }] }))).toEqual({ added: 0, replaced: 1 });
    expect(titles()).toEqual(['New']);
    undo();
    expect(titles()).toEqual(['Old']);
  });

  it('refuses files that are not backups', () => {
    expect(() => importJson('not json')).toThrow(/not valid JSON/);
    expect(() => importJson('[]')).toThrow(/not a backup/);
    expect(() => importJson('{"hello": 1}')).toThrow(/no tasks/);
    expect(() => importJson('{"tasks": []}')).toThrow(/empty/);
  });
});
