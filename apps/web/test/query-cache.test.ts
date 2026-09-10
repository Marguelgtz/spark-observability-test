import { describe, expect, it, vi } from 'vitest';
import { QueryCache, type QueryPolicy } from '../src/query-cache';

const policy: QueryPolicy = { freshForMs: 100, maxAgeMs: 1_000 };

describe('QueryCache', () => {
  it('tracks missing, fresh, stale, and expired values', () => {
    const cache = new QueryCache();
    expect(cache.read('activity:key', policy, 0).state).toBe('missing');
    cache.set('activity:key', { total: 1 }, policy, 0);
    expect(cache.read('activity:key', policy, 99).state).toBe('fresh');
    expect(cache.read('activity:key', policy, 101).state).toBe('stale');
    expect(cache.read('activity:key', policy, 1_001).state).toBe('missing');
  });

  it('deduplicates concurrent loads and retains the resolved value', async () => {
    const cache = new QueryCache();
    let resolve!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const first = cache.load('dashboard:key', policy, loader);
    const second = cache.load('dashboard:key', policy, loader);
    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
    resolve('ready');
    await expect(first).resolves.toBe('ready');
    await expect(cache.load('dashboard:key', policy, loader)).resolves.toBe('ready');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('revalidates stale data once while callers keep the old value', async () => {
    const cache = new QueryCache();
    cache.set('overview:key', 'old', policy, 0);
    let resolve!: (value: string) => void;
    const refresh = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const stale = cache.read<string>('overview:key', policy, 101);
    expect(stale).toMatchObject({ state: 'stale', value: 'old' });
    const first = cache.revalidate('overview:key', policy, refresh);
    const second = cache.revalidate('overview:key', policy, refresh);
    expect(first).toBe(second);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve('new');
    await expect(first).resolves.toBe('new');
    expect(cache.read('overview:key', policy, 101).value).toBe('new');
  });

  it('supports scoped invalidation without touching sibling keys', () => {
    const cache = new QueryCache();
    cache.set('activity:a', 1, policy);
    cache.set('overview:a', 2, policy);
    cache.invalidate((key) => key.startsWith('activity:'));
    expect(cache.has('activity:a')).toBe(false);
    expect(cache.has('overview:a')).toBe(true);
  });

  it('does not let an invalidated in-flight result overwrite a mutation value', async () => {
    const cache = new QueryCache();
    let resolve!: (value: string) => void;
    const pending = cache.load('settings', policy, () => new Promise<string>((done) => { resolve = done; }));
    cache.invalidate('settings');
    cache.set('settings', 'saved', policy);
    resolve('old');
    await expect(pending).resolves.toBe('old');
    expect(cache.read('settings', policy).value).toBe('saved');
  });
});
