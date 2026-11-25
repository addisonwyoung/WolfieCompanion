export const libraryCatalog = [
  { id: 1, name: 'North Reading Room', capacity: 900 },
  { id: 2, name: 'Central Reading Room', capacity: 300 },
  { id: 3, name: 'Health Sciences Library', capacity: 350 },
  { id: 4, name: 'Music Library', capacity: 110 },
  { id: 5, name: '3rd Floor', capacity: 300 },
] as const;

/** Reference-week selections embedded in SBU's official occupancy widget. */
export const historyWeeks = { 1: '52', 2: '52', 3: '52', 4: '48,49,50', 5: '49,50,51' } as const;
type HistoryWeeks = typeof historyWeeks[keyof typeof historyWeeks];

const sourceUrl = 'https://library.stonybrook.edu/how-busy-are-the-libraries/';
const freshMs = 5 * 60_000;
const usableMs = 30 * 60_000;
const cooldownMs = 30_000;
type Library = typeof libraryCatalog[number];
type CachedReading = { population: number; retrievedAt: number };

export interface HistoricalBucket {
  hour: number;
  referenceDateTime: string;
  count: number | null;
  percentage: number | null;
}
export interface LibraryHistory {
  id: number;
  capacity: number;
  status: 'available' | 'unavailable';
  weeks: HistoryWeeks;
  bucketMinutes: 60;
  buckets: HistoricalBucket[];
  retrievedAt: string | null;
  expiresAt: string | null;
  sourceUrl: string;
}

function historicalBuckets(body: unknown, library: Library): HistoricalBucket[] {
  if (!body || typeof body !== 'object') throw new Error('Invalid histogram');
  const value = body as Record<string, unknown>;
  if (value.room_id !== library.id || value.day_offset !== 0 || value.weeks !== historyWeeks[library.id]
    || value.bucket_minutes !== 60 || value.bucket_count !== 24 || !Array.isArray(value.data) || value.data.length !== 24) {
    throw new Error('Invalid histogram metadata');
  }
  const buckets: HistoricalBucket[] = [];
  for (const item of value.data) {
    const date = item?.datetime;
    const hour = item?.hour_num;
    // Keep timezone-less reference strings intact; never reinterpret as UTC/local instants.
    if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):00:00$/.test(date)
      || !Number.isInteger(hour) || hour < 0 || hour > 23 || Number(date.slice(11, 13)) !== hour) {
      throw new Error('Invalid histogram hour');
    }
    const previous = buckets.at(-1);
    if (previous && (hour !== (previous.hour + 1) % 24 || date <= previous.referenceDateTime)) {
      throw new Error('Unordered histogram');
    }
    const count = typeof item.count === 'number' && Number.isFinite(item.count) && item.count >= 0 ? item.count : null;
    const percentage = count === null ? null : count / library.capacity * 100;
    buckets.push({ hour, referenceDateTime: date, count,
      percentage: percentage !== null && Number.isFinite(percentage) ? percentage : null });
  }
  if (!buckets.some(bucket => bucket.percentage !== null)) throw new Error('No usable histogram values');
  return buckets;
}

export interface LiveLibraryReading {
  id: number;
  name: string;
  capacity: number;
  population: number | null;
  percentage: number | null;
  crowdLevel: 'Low' | 'Moderate' | 'Busy' | null;
  estimatedRemainingCapacity: number | null;
  status: 'fresh' | 'stale' | 'unavailable';
  retrievedAt: string | null;
  freshUntil: string | null;
  usableUntil: string | null;
  sourceUrl: string;
}

/** One instance per process; requests are initiated only by list(), never by timers. */
export class LibraryOccupancy {
  private readonly readings = new Map<number, CachedReading>();
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly retryAt = new Map<number, number>();
  private readonly histories = new Map<string, LibraryHistory>();
  private readonly historyInFlight = new Map<string, Promise<LibraryHistory>>();
  private readonly historyRetryAt = new Map<string, number>();
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(options: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async list(): Promise<LiveLibraryReading[]> {
    await Promise.all(libraryCatalog.map(library => this.ensureReading(library)));
    // Evaluate age after all requests settle, including time spent awaiting other rooms.
    const now = this.now();
    return libraryCatalog.map(library => this.snapshot(library, now));
  }

  history(id: number): Promise<LibraryHistory | undefined> {
    const library = libraryCatalog.find(item => item.id === id);
    if (!library) return Promise.resolve(undefined);
    const key = `${id}:${historyWeeks[library.id]}`;
    const cached = this.histories.get(key);
    if (cached?.expiresAt && this.now() < Date.parse(cached.expiresAt)) return Promise.resolve(cached);
    const pending = this.historyInFlight.get(key);
    if (pending) return pending;
    if (this.now() < (this.historyRetryAt.get(key) ?? 0)) return Promise.resolve(this.unavailableHistory(library));
    const operation = this.fetchHistory(library).finally(() => this.historyInFlight.delete(key));
    this.historyInFlight.set(key, operation);
    return operation;
  }

  private unavailableHistory(library: Library): LibraryHistory {
    return { id: library.id, capacity: library.capacity, status: 'unavailable', weeks: historyWeeks[library.id], bucketMinutes: 60,
      buckets: [], retrievedAt: null, expiresAt: null, sourceUrl };
  }

  private async fetchHistory(library: Library): Promise<LibraryHistory> {
    const weeks = historyWeeks[library.id];
    const key = `${library.id}:${weeks}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL('https://library.stonybrook.edu/api/proxy.php');
      for (const [key, value] of Object.entries({ endpoint: 'histogram', id: String(library.id), dayOffset: '0',
        bucketMinutes: '60', bucketCount: '24', weeks })) url.searchParams.set(key, value);
      const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('Histogram provider request failed');
      const body: unknown = await response.json();
      if (controller.signal.aborted) throw new Error('Histogram timeout');
      const buckets = historicalBuckets(body, library);
      const retrievedAt = this.now();
      const result: LibraryHistory = { id: library.id, capacity: library.capacity, status: 'available', weeks, bucketMinutes: 60,
        buckets, retrievedAt: new Date(retrievedAt).toISOString(), expiresAt: new Date(retrievedAt + 3_600_000).toISOString(), sourceUrl };
      this.histories.set(key, result);
      this.historyRetryAt.delete(key);
      return result;
    } catch {
      // History never reads or changes the live cache, timestamps or cooldown.
      this.historyRetryAt.set(key, this.now() + cooldownMs);
      return this.unavailableHistory(library);
    } finally { clearTimeout(timer); }
  }

  private ensureReading(library: Library): Promise<void> {
    const cached = this.readings.get(library.id);
    const now = this.now();
    if (cached && now - cached.retrievedAt < freshMs) return Promise.resolve();
    const pending = this.inFlight.get(library.id);
    if (pending) return pending;
    if (now < (this.retryAt.get(library.id) ?? 0)) return Promise.resolve();
    const operation = this.fetchReading(library).finally(() => this.inFlight.delete(library.id));
    this.inFlight.set(library.id, operation);
    return operation;
  }

  private async fetchReading(library: Library): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL('https://library.stonybrook.edu/api/proxy.php');
      url.searchParams.set('endpoint', 'population');
      url.searchParams.set('id', String(library.id));
      const response = await this.fetcher(url, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Occupancy provider request failed');
      const body: unknown = await response.json();
      const population = body && typeof body === 'object' && 'population' in body ? body.population : undefined;
      // SBU fetchPopulation rejects raw > cap * 1.5. Unlike its zero fallback,
      // preserve our last good reading or expose unavailable for invalid sensor data.
      if (controller.signal.aborted || typeof population !== 'number' || !Number.isFinite(population)
        || population < 0 || population > library.capacity * 1.5) {
        throw new Error('Invalid occupancy provider response');
      }
      this.readings.set(library.id, { population, retrievedAt: this.now() });
      this.retryAt.delete(library.id);
    } catch {
      this.retryAt.set(library.id, this.now() + cooldownMs);
    } finally {
      clearTimeout(timer);
    }
  }

  private snapshot(library: Library, now: number): LiveLibraryReading {
    const cached = this.readings.get(library.id);
    if (!cached || now - cached.retrievedAt > usableMs) {
      return { ...library, population: null, percentage: null, crowdLevel: null,
        estimatedRemainingCapacity: null, status: 'unavailable', retrievedAt: null,
        freshUntil: null, usableUntil: null, sourceUrl };
    }
    const percentage = Math.min(100, Math.round(cached.population / library.capacity * 100));
    return { ...library, population: cached.population, percentage,
      crowdLevel: percentage > 80 ? 'Busy' : percentage > 50 ? 'Moderate' : 'Low',
      estimatedRemainingCapacity: Math.max(0, library.capacity - cached.population),
      status: now - cached.retrievedAt < freshMs ? 'fresh' : 'stale',
      retrievedAt: new Date(cached.retrievedAt).toISOString(),
      freshUntil: new Date(cached.retrievedAt + freshMs).toISOString(),
      usableUntil: new Date(cached.retrievedAt + usableMs).toISOString(), sourceUrl };
  }
}

export const libraryOccupancy = new LibraryOccupancy();
