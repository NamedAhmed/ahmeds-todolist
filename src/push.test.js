// Tests for which notifications get scheduled (buildSchedule in push.js). Run with: npm test
import { beforeEach, describe, expect, it } from 'vitest';
import { commit, getState, resetAll } from './store.js';
import { buildSchedule } from './push.js';
import { addDays, todayStr } from './lib.js';

describe('buildSchedule', () => {
  const tomorrow = addDays(todayStr(), 1);
  beforeEach(() => resetAll());

  it('a task with a day and time: one notification at that time', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Call mum', due: tomorrow, due_time: '17:00' } }]);
    const [note, ...rest] = buildSchedule(getState(), '09:00');
    expect(rest).toEqual([]);
    expect(note.title).toBe('Call mum');
    expect(new Date(note.fire_at).getHours()).toBe(17);
    expect(note.body).toBe('Due at 5 PM');
  });

  it('a task with only a day uses the default time, or none without one', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Bins', due: tomorrow } }]);
    expect(new Date(buildSchedule(getState(), '09:00')[0].fire_at).getHours()).toBe(9);
    expect(buildSchedule(getState(), '')).toEqual([]);
  });

  it('finished tasks and tasks without a date are left out', () => {
    commit('add', [
      { t: 'tasks', id: 'a', patch: { title: 'Done already', due: tomorrow, done: true } },
      { t: 'tasks', id: 'b', patch: { title: 'Someday', due: null } },
    ]);
    expect(buildSchedule(getState(), '09:00')).toEqual([]);
  });

  it('"remind me before" adds an early warning, only for things with their own time', () => {
    commit('add', [
      { t: 'tasks', id: 'a', patch: { title: 'Dentist', due: tomorrow, due_time: '15:00' } },
      { t: 'tasks', id: 'b', patch: { title: 'Bins', due: tomorrow } },
    ]);
    const notes = buildSchedule(getState(), '09:00', new Date(), 60);
    const early = notes.filter((n) => n.key.startsWith('task-early:'));
    expect(early).toHaveLength(1);
    expect(early[0].body).toBe('In 1 hour: Due at 3 PM');
    expect(new Date(early[0].fire_at).getHours()).toBe(14);
  });

  it('nothing in the past', () => {
    commit('add', [{ t: 'tasks', id: 'a', patch: { title: 'Yesterday', due: addDays(todayStr(), -1), due_time: '10:00' } }]);
    expect(buildSchedule(getState(), '09:00')).toEqual([]);
  });

  it('a weekly reminder: once on each matching day ahead', () => {
    const today = todayStr();
    const weekday = new Date(tomorrow + 'T12:00').getDay();
    commit('add', [{ t: 'reminders', id: 'r', patch: { title: 'Gym', rule: { type: 'weekly', days: [weekday] }, time: '07:00', created: today } }]);
    const notes = buildSchedule(getState(), '09:00');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.title === 'Gym' && new Date(n.fire_at).getDay() === weekday)).toBe(true);
  });
});
