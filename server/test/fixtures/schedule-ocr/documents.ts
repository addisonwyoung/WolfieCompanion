import type { OcrDocument, Point } from '../../../src/ocr/types.js';
export const box = (x: number, y: number, w = 80, h = 20): Point[] => [{ x,y }, { x:x+w,y }, { x:x+w,y:y+h }, { x,y:y+h }];
export function document(blocks: string[][]): OcrDocument {
  return { text: blocks.map(lines => lines.join('\n')).join('\n'), pages: [{ width: 1200, height: 1000, blocks: blocks.map((lines, i) => ({ box: box(20, i*120, 600, 100), paragraphs: lines.map((text,j) => ({ box: box(20,i*120+j*25,600), words: text.split(' ').map((word,k) => ({ text:word, box:box(20+k*95,i*120+j*25,90), confidence: .95 })) })) })) }] };
}
export const classList = document([['Fall 2026'], ['CSE 416 LEC 01'], ['CSE 416 LAB L02'], ['AMS-210 LEC 02']]);
export const calendar = document([['Fall 2026'], ['CSE416', 'LEC 01'], ['CSE416', 'LEC 01'], ['AMS 210', 'LEC 02']]);
export const calendarRegression = document([
  ['CSE 310-01', 'Lecture', '8:00 AM - 9:20 AM'],
  ['COM 120-30', 'Lecture', '8:00 AM - 9:20 AM'],
  ['CSE 351-01', 'Lecture', '11:00 AM - 12:20 PM'],
  ['CSE 416-03', 'Lecture'],
  ['AMS 315-01', 'Lecture', '2:00 PM - 3:20 PM'],
  ['Science Bldg 120'], ['Room 143'], ['RM 120'],
  ['CSE 310-01', 'Lecture', '8:00 AM']
]);
