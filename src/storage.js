// storage.js = localStorage that never throws. A browser can refuse it (a private window, "block site data", a full disk),
// and a refused read or write must not take the whole app down: reads then give null and writes are simply not kept.

export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // not kept
    }
  },
};
