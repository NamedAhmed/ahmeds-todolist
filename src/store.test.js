// Tests for the data store: undo, redo and restoring a backup. Run with: npm test
import { beforeEach, describe, expect, it } from 'vitest';
import { all, commit, exportJson, getState, importJson, redo, resetAll, undo } from './store.js';

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
