// In-memory stand-in for expo-sqlite/kv-store (mapped in package.json's jest
// config): the real one imports native expo-sqlite, which can't run under Jest.
const items = new Map<string, string>();

export const Storage = {
  getItemSync: (key: string) => items.get(key) ?? null,
  setItemSync: (key: string, value: string) => {
    items.set(key, value);
  },
  clearSync: () => items.clear(),
};

export default Storage;
