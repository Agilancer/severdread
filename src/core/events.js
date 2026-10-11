// Minimal pub/sub used to decouple gameplay from UI/audio.
const handlers = new Map();

export const events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => handlers.get(name).delete(fn);
  },
  emit(name, data) {
    const set = handlers.get(name);
    if (set) for (const fn of set) fn(data);
  },
};
