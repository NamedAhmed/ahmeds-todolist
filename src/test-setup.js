// test-setup.js = the little bit of "browser" the app's data files expect, for the tests (they run in Node, not a page).
// localStorage is kept in memory, and window/document events are accepted and ignored.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
  key: (i) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
};
const events = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.window = Object.assign(globalThis, events);
globalThis.document = { ...events, hidden: false, documentElement: { style: {} } };
