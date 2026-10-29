// Tests for the date maths in lib.js: when a repeating daily or reminder happens. Run with: npm test
import { describe, expect, it } from 'vitest';
import { occursOn, reminderOccursOn } from './lib.js';

describe('occursOn', () => {
  it('once: only on its date', () => {
    expect(occursOn({ type: 'once', date: '2026-11-03' }, '2026-11-03')).toBe(true);
    expect(occursOn({ type: 'once', date: '2026-11-03' }, '2026-11-04')).toBe(false);
  });

  it('weekly: on the chosen weekdays (0 = Sunday)', () => {
    const rule = { type: 'weekly', days: [1, 3] }; // Monday and Wednesday
    expect(occursOn(rule, '2026-11-02')).toBe(true); // a Monday
    expect(occursOn(rule, '2026-11-04')).toBe(true); // a Wednesday
    expect(occursOn(rule, '2026-11-03')).toBe(false); // a Tuesday
  });

  it('monthly on the 31st: falls on the last day of shorter months', () => {
    const rule = { type: 'monthly', day: 31 };
    expect(occursOn(rule, '2026-10-31')).toBe(true);
    expect(occursOn(rule, '2026-11-30')).toBe(true);
    expect(occursOn(rule, '2026-11-29')).toBe(false);
    expect(occursOn(rule, '2027-02-28')).toBe(true);
    expect(occursOn(rule, '2028-02-29')).toBe(true); // leap year
    expect(occursOn(rule, '2028-02-28')).toBe(false);
  });

  it('yearly: the right day in the right month (month 0 = January)', () => {
    const rule = { type: 'yearly', day: 29, month: 1 }; // 29 February
    expect(occursOn(rule, '2028-02-29')).toBe(true);
    expect(occursOn(rule, '2027-02-28')).toBe(true); // no 29th that year: the last day instead
    expect(occursOn(rule, '2027-03-29')).toBe(false);
  });
});

describe('reminderOccursOn', () => {
  const reminder = { rule: { type: 'weekly', days: [1] }, created: '2026-11-05' };

  it('never before the day it was made', () => {
    expect(reminderOccursOn(reminder, '2026-11-02')).toBe(false); // a Monday, before it existed
    expect(reminderOccursOn(reminder, '2026-11-09')).toBe(true); // the next Monday
  });

  it('a one-off reminder ignores when it was made', () => {
    expect(reminderOccursOn({ rule: { type: 'once', date: '2026-11-01' }, created: '2026-11-05' }, '2026-11-01')).toBe(true);
  });
});
