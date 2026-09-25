import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const levels = ['Empty', 'Low', 'Moderate', 'Busy', 'Full'] as const;
export type Level = typeof levels[number];
export const locations = ['North Reading Room', 'Central Reading Room', 'Second Floor Core', 'Main Stacks', 'Galleria', 'Music Library'].map(name => ({ id: name.toLowerCase().replaceAll(' ', '-'), name }));
export interface Report { id: string; locationId: string; level: Level; note: string; submittedAt: string }
export class ReportStore {
  private reports: Report[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string, private now = () => new Date().toISOString()) {}
  async load() {
    let raw: string;
    try { raw = await readFile(this.file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(r => r && typeof r.id === 'string' && locations.some(l => l.id === r.locationId) && levels.includes(r.level) && typeof r.note === 'string' && r.note.length <= 200 && typeof r.submittedAt === 'string' && Number.isFinite(Date.parse(r.submittedAt))) || new Set(data.map(r => r.id)).size !== data.length) throw new Error('Invalid crowd report storage');
    this.reports = data;
  }
  detail(id: string) {
    const location = locations.find(l => l.id === id);
    if (!location) return undefined;
    const reports = this.reports.filter(r => r.locationId === id).slice(-10).reverse();
    return { ...location, latestReport: reports[0] ?? null, reports };
  }
  list() { return locations.map(l => { const { reports: _, ...summary } = this.detail(l.id)!; return summary; }); }
  add(locationId: string, level: Level, note: string) {
    const operation = this.queue.then(async () => {
      const report: Report = { id: randomUUID(), locationId, level, note, submittedAt: this.now() };
      const next = [...this.reports, report];
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(next), 'utf8');
      await rename(this.file + '.tmp', this.file);
      this.reports = next;
      return report;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
