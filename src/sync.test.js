// Tests for uploading changes (push in sync.js) when two devices edit the same item.
// Run with: npm test
//
// The Supabase table is replaced by a small stand-in kept in memory (fakeTable below). It understands just the calls
// push() makes, and stamps updated_at itself like the real server does.
import { beforeEach, describe, expect, it } from 'vitest';
import { all, commit, getState, resetAll, undo } from './store.js';
import { push } from './sync.js';

const USER = 'user-1';

function fakeTable() {
  const rows = new Map(); // 'tbl:id' -> row
  let clock = 0;
  const stamp = () => `2026-10-29T10:00:00.${String(++clock).padStart(6, '0')}+00:00`;

  // A query: filters build up with .eq/.in, and awaiting it runs it.
  function query(run) {
    const filters = [];
    const q = {
      eq: (column, value) => (filters.push((row) => row[column] === value), q),
      in: (column, values) => (filters.push((row) => values.includes(row[column])), q),
      select: () => q,
      then: (resolve, reject) => Promise.resolve(run((row) => filters.every((f) => f(row)))).then(resolve, reject),
    };
    return q;
  }

  return {
    rows,
    // What another device does: change a row on the server directly.
    serverEdit(tbl, id, change) {
      const row = rows.get(tbl + ':' + id);
      rows.set(tbl + ':' + id, { ...row, ...change, updated_at: stamp() });
    },
    from: () => ({
      upsert: (list) =>
        query(() => {
          const data = list.map((row) => {
            const saved = { ...row, updated_at: stamp() };
            rows.set(row.tbl + ':' + row.id, saved);
            return saved;
          });
          return { data, error: null };
        }),
      update: (fields) =>
        query((matches) => {
          const data = [];
          for (const [key, row] of rows) {
            if (!matches(row)) continue;
            const saved = { ...row, ...fields, updated_at: stamp() };
            rows.set(key, saved);
            data.push(saved);
          }
          return { data, error: null };
        }),
      select: () => query((matches) => ({ data: [...rows.values()].filter(matches), error: null })),
    }),
  };
}

const task = (id) => getState().tasks[id];

describe('push', () => {
  let server;
  beforeEach(() => {
    resetAll();
    server = fakeTable();
  });

  it('uploads a new item and remembers the server stamp', async () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Buy milk' } }]);
    expect(await push(server, USER)).toBe(0);
    expect(task('a')._dirty).toBeUndefined();
    expect(task('a')._base).toBe(server.rows.get('tasks:a').updated_at);
  });

  it('updates an item the server still has in the same version', async () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Buy milk' } }]);
    await push(server, USER);
    commit('edit', [{ t: 'tasks', id: 'a', patch: { title: 'Buy oat milk' } }]);

    expect(await push(server, USER)).toBe(0);
    expect(server.rows.get('tasks:a').data.title).toBe('Buy oat milk');
    expect(all(getState(), 'tasks')).toHaveLength(1);
  });

  it('never overwrites a newer edit from another device: keeps both', async () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Buy milk' } }]);
    await push(server, USER);

    server.serverEdit('tasks', 'a', { data: { title: 'Buy milk and eggs' } }); // the phone, meanwhile
    commit('edit', [{ t: 'tasks', id: 'a', patch: { title: 'Buy oat milk' } }]); // this device, offline

    expect(await push(server, USER)).toBe(1);
    expect(server.rows.get('tasks:a').data.title).toBe('Buy milk and eggs'); // the server copy is untouched
    expect(task('a').title).toBe('Buy milk and eggs');
    const titles = all(getState(), 'tasks').map((t) => t.title).sort();
    expect(titles).toEqual(['Buy milk and eggs', 'Buy oat milk (conflicted copy)']);

    await push(server, USER); // the copy uploads on the next sync
    expect([...server.rows.values()].map((row) => row.data.title).sort()).toEqual(titles);
  });

  it('takes the server version of a daily without making a copy', async () => {
    commit('add', [{ t: 'dailies', id: 'd', patch: { name: 'Read' } }]);
    await push(server, USER);
    server.serverEdit('dailies', 'd', { data: { name: 'Read 20 min' } });
    commit('edit', [{ t: 'dailies', id: 'd', patch: { name: 'Read 10 min' } }]);

    expect(await push(server, USER)).toBe(0);
    expect(all(getState(), 'dailies').map((d) => d.name)).toEqual(['Read 20 min']);
  });

  it('brings back an item deleted here but edited on another device', async () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Call mum' } }]);
    await push(server, USER);
    server.serverEdit('tasks', 'a', { data: { title: 'Call mum friday' } });
    commit('delete', [{ t: 'tasks', id: 'a', set: null }]);

    await push(server, USER);
    expect(task('a').title).toBe('Call mum friday');
    expect(server.rows.get('tasks:a').deleted).toBe(false);
  });

  it('does not see a conflict after undoing an edit that was already uploaded', async () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'One' } }]);
    await push(server, USER);
    commit('edit', [{ t: 'tasks', id: 'a', patch: { title: 'Two' } }]);
    await push(server, USER);
    undo(); // back to "One": the undo carries an old copy of the item, with the old stamp

    expect(await push(server, USER)).toBe(0);
    expect(server.rows.get('tasks:a').data.title).toBe('One');
  });

  it('a setting made on a new device before signing in is merged into the account, not replacing it', async () => {
    server.rows.set('settings:appearance', { user_id: USER, tbl: 'settings', id: 'appearance', data: { theme: 'paper', wallpaper: 'lively:rain' }, deleted: false, updated_at: 'x' });
    commit('set', [{ t: 'settings', id: 'appearance', patch: { sassy: false } }]); // this device has never synced

    await push(server, USER);
    expect(server.rows.get('settings:appearance').data).toEqual({ theme: 'paper', wallpaper: 'lively:rain', sassy: false });
  });

  it('settings: the last change wins', async () => {
    commit('set', [{ t: 'settings', id: 'appearance', patch: { theme: 'light' } }]);
    await push(server, USER);
    server.serverEdit('settings', 'appearance', { data: { theme: 'paper' } });
    commit('set', [{ t: 'settings', id: 'appearance', patch: { theme: 'ember' } }]);

    expect(await push(server, USER)).toBe(0);
    expect(server.rows.get('settings:appearance').data.theme).toBe('ember');
  });
});
