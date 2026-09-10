export type QueryState = 'missing' | 'fresh' | 'stale';

export interface QueryPolicy {
  /** How long a value may be used without starting a refresh. */
  freshForMs: number;
  /** How long a retained value remains usable before it becomes a miss. */
  maxAgeMs: number;
}

export interface QuerySnapshot<T> {
  state: QueryState;
  value?: T;
  updatedAt?: number;
  promise?: Promise<T>;
}

interface QueryEntry<T> {
  value?: T;
  updatedAt: number;
  policy: QueryPolicy;
  promise?: Promise<T>;
}

/**
 * A private, tab-local cache for authenticated reads.
 *
 * It deliberately has no persistence or shared-cache integration.  Callers
 * own the query key and policy, while this class owns state transitions,
 * request deduplication, and scoped invalidation.
 */
export class QueryCache {
  private readonly entries = new Map<string, QueryEntry<unknown>>();

  read<T>(key: string, policy: QueryPolicy, now = Date.now()): QuerySnapshot<T> {
    const entry = this.entries.get(key) as QueryEntry<T> | undefined;
    if (!entry) return { state: 'missing' };
    if (entry.value === undefined && !entry.promise) {
      this.entries.delete(key);
      return { state: 'missing' };
    }
    if (entry.value !== undefined && now - entry.updatedAt > policy.maxAgeMs) {
      if (!entry.promise) this.entries.delete(key);
      return entry.promise ? { state: 'missing', promise: entry.promise } : { state: 'missing' };
    }
    if (entry.value === undefined) return { state: 'missing', promise: entry.promise };
    return {
      state: now - entry.updatedAt <= policy.freshForMs ? 'fresh' : 'stale',
      value: entry.value,
      updatedAt: entry.updatedAt,
      ...(entry.promise ? { promise: entry.promise } : {}),
    };
  }

  load<T>(key: string, policy: QueryPolicy, loader: () => Promise<T>): Promise<T> {
    const snapshot = this.read<T>(key, policy);
    if (snapshot.state === 'fresh' && snapshot.value !== undefined) return Promise.resolve(snapshot.value);
    if (snapshot.promise) return snapshot.promise;
    const entry: QueryEntry<T> = {
      ...(snapshot.value !== undefined ? { value: snapshot.value } : {}),
      updatedAt: snapshot.updatedAt ?? 0,
      policy,
    };
    const promise = loader().then(
      (value) => {
        // A mutation or a newer request may have replaced this entry while the
        // loader was in flight. Never let that late result overwrite the newer
        // value (or repopulate an explicitly invalidated key).
        const current = this.entries.get(key) as QueryEntry<T> | undefined;
        if (current?.promise === promise) this.entries.set(key, { value, updatedAt: Date.now(), policy });
        return value;
      },
      (error: unknown) => {
        const current = this.entries.get(key) as QueryEntry<T> | undefined;
        if (current?.promise === promise) {
          if (current.value === undefined) this.entries.delete(key);
          else this.entries.set(key, { ...current, promise: undefined });
        }
        throw error;
      },
    );
    entry.promise = promise;
    this.entries.set(key, entry);
    return promise;
  }

  revalidate<T>(key: string, policy: QueryPolicy, loader: () => Promise<T>): Promise<T> | undefined {
    const snapshot = this.read<T>(key, policy);
    if (snapshot.state === 'fresh') return undefined;
    if (snapshot.promise) return snapshot.promise;
    return this.load(key, policy, loader);
  }

  set<T>(key: string, value: T, policy: QueryPolicy, updatedAt = Date.now()): void {
    this.entries.set(key, { value, updatedAt, policy });
  }

  invalidate(keyOrPredicate: string | ((key: string) => boolean)): void {
    if (typeof keyOrPredicate === 'string') {
      this.entries.delete(keyOrPredicate);
      return;
    }
    for (const key of this.entries.keys()) {
      if (keyOrPredicate(key)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}
