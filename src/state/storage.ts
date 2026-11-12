/** localStorage 래퍼. 차단된 환경(시크릿 모드 등)에서는 메모리로 대체한다. */
const memory = new Map<string, string>();
let available: boolean | undefined;

export function storageAvailable(): boolean {
  if (available !== undefined) return available;
  try {
    const k = '__va_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readItem(key: string): string | null {
  try {
    if (storageAvailable()) return localStorage.getItem(key);
  } catch {
    /* fall through */
  }
  return memory.get(key) ?? null;
}

export function writeItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (storageAvailable()) localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** 간단한 외부 스토어: useSyncExternalStore와 함께 쓴다. 다른 탭 변경도 반영. */
export function createStore<T>(key: string, parse: (raw: string | null) => T, serialize: (v: T) => string) {
  let value = parse(readItem(key));
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        value = parse(e.newValue);
        emit();
      }
    });
  }
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      writeItem(key, serialize(next));
      emit();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
