const KEY = "pampa-crm-proto:v1";

export function loadPersisted<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function savePersisted<T>(value: T) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearPersisted() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

