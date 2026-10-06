export type Layout = 'class-list' | 'weekly-calendar';
export interface Point { x: number; y: number }
export interface Word { text: string; box: Point[]; confidence: number | null }
export interface Paragraph { words: Word[]; box: Point[] }
export interface Block { paragraphs: Paragraph[]; box: Point[] }
export interface Page { width: number; height: number; blocks: Block[] }
export interface OcrDocument { text: string; pages: Page[] }
export interface Warning { code: string; message: string }
export interface Term { semester: string; year: number }
export interface Section { label: string; component: string | null }
export interface Evidence { text: string; page: number | null; box: Point[]; confidence: number | null }
export interface DraftClass {
  department: string; courseNumber: string; code: string;
  title: string | null; term: Term | null; sections: Section[];
  evidence: Evidence[]; warnings: Warning[]; verification: 'unverified';
}
export interface ScheduleResult {
  schemaVersion: 1; provider: 'google-vision'; layout: Layout;
  rawText: string; classes: DraftClass[]; warnings: Warning[]; requiresReview: true;
}
export type OcrProvider = (bytes: Buffer) => Promise<OcrDocument>;
