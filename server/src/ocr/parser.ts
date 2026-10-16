import type { OcrDocument, Layout, Point, Word, Evidence, Term, Section, ScheduleResult, Warning } from './types.js';
const warning = (code: string, message: string): Warning => ({ code, message });
const codePattern = () => /(?<![A-Za-z0-9])([A-Za-z]{2,4})[ \t-]*(\d{3})(?![A-Za-z0-9])/g;
const termPattern = () => /\b(Spring|Summer|Fall|Winter)\s+(20\d{2})\b/gi;
function codes(text: string) {
  return [...text.matchAll(codePattern())].filter(m => !['BLDG','ROOM','RM'].includes(m[1]!.toUpperCase()));
}
function terms(text: string): Term[] {
  const found = [...text.matchAll(termPattern())].map(m => ({ semester: m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase(), year: Number(m[2]) }));
  return [...new Map(found.map(t => [JSON.stringify(t), t])).values()];
}
function bounds(box: Point[]) {
  return { left: Math.min(...box.map(p => p.x)), right: Math.max(...box.map(p => p.x)), top: Math.min(...box.map(p => p.y)), bottom: Math.max(...box.map(p => p.y)) };
}
function enclosing(words: Word[]): Point[] {
  const points = words.flatMap(w => w.box);
  if (!points.length) return [];
  const b = bounds(points);
  return [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
}
interface Region { lines: string[]; evidence: Evidence; positioned: boolean }
function regions(doc: OcrDocument, layout: Layout): Region[] {
  const result: Region[] = [];
  doc.pages.forEach((page, pageIndex) => page.blocks.forEach(block => {
    const words = block.paragraphs.flatMap(p => p.words).filter(w => w.text && w.box.length);
    const rows: Word[][] = [];
    for (const word of [...words].sort((a, b) => bounds(a.box).top - bounds(b.box).top)) {
      const b = bounds(word.box);
      const row = rows.find(r => { const rb = bounds(r[0]!.box); return Math.abs((b.top + b.bottom) / 2 - (rb.top + rb.bottom) / 2) < Math.max(1, Math.min(b.bottom - b.top, rb.bottom - rb.top) * .6); });
      if (row) row.push(word); else rows.push([word]);
    }
    // Split widely separated columns rather than joining unrelated codes/labels.
    const segments: Word[][] = [];
    for (const row of rows) {
      let segment: Word[] = [];
      for (const word of row.sort((a,b) => bounds(a.box).left - bounds(b.box).left)) {
        const previous = segment.at(-1);
        if (previous) { const p = bounds(previous.box), w = bounds(word.box); if (w.left - p.right > Math.max(32, (p.bottom - p.top) * 4)) { segments.push(segment); segment = []; } }
        segment.push(word);
      }
      if (segment.length) segments.push(segment);
    }
    const make = (groups: Word[][]): Region => {
      const all = groups.flat(); const values = all.flatMap(w => w.confidence === null ? [] : [w.confidence]);
      const lines = groups.map(g => g.map(w => w.text).join(' '));
      return { lines, positioned: true, evidence: { text: lines.join('\n'), page: pageIndex, box: enclosing(all), confidence: values.length ? Math.min(...values) : null } };
    };
    // A calendar block can span multiple lines; never bundle multiple course occurrences.
    const blockCodes = segments.reduce((n, s) => n + codes(s.map(w => w.text).join(' ')).length, 0);
    if (layout === 'weekly-calendar' && blockCodes === 1 && rows.every(r => segments.filter(s => s.some(w => r.includes(w))).length === 1)) {
      result.push(make(segments));
    } else { for (const segment of segments) result.push(make([segment])); }
  }));
  if (!result.length) return doc.text.split(/\r?\n/).map(text => ({ lines: [text], positioned: false, evidence: { text, page: null, box: [], confidence: null } }));
  if (layout === 'weekly-calendar') {
    return result.map(region => {
      if (codes(region.evidence.text).length !== 1 || sections(region.evidence.text).length || !region.evidence.box.length) return region;
      const b = bounds(region.evidence.box);
      const height = Math.max(1, b.bottom - b.top);
      const nearby = result.filter(other => {
        if (other === region || other.evidence.page !== region.evidence.page || !other.evidence.box.length || codes(other.evidence.text).length) return false;
        if (!/^(LEC|LAB|REC|SEM|Lecture|Recitation|Section|Sec)\b/i.test(other.evidence.text)) return false;
        const ob = bounds(other.evidence.box);
        return ob.top >= b.bottom && ob.top - b.bottom <= height * 3 && Math.abs(ob.left - b.left) <= height * 2;
      }).sort((a,c) => bounds(a.evidence.box).top - bounds(c.evidence.box).top);
      const label = nearby[0];
      if (!label) return region;
      const lb = bounds(label.evidence.box);
      if (result.some(other => other !== region && codes(other.evidence.text).length && other.evidence.page === region.evidence.page && other.evidence.box.length && bounds(other.evidence.box).top > b.bottom && bounds(other.evidence.box).top < lb.top && Math.abs(bounds(other.evidence.box).left - b.left) <= height * 2)) return region;
      const text = region.evidence.text + '\n' + label.evidence.text;
      const merged = bounds([...region.evidence.box,...label.evidence.box]);
      return { ...region, lines: [...region.lines,...label.lines], evidence: { ...region.evidence, text, box: [{x:merged.left,y:merged.top},{x:merged.right,y:merged.top},{x:merged.right,y:merged.bottom},{x:merged.left,y:merged.bottom}], confidence: Math.min(region.evidence.confidence ?? 1, label.evidence.confidence ?? 1) } };
    });
  }
  return result;
}
function sections(text: string): Section[] {
  return [...text.matchAll(/\b(LEC|LAB|REC|SEM|Lecture|Recitation|Section|Sec)[ \t]*[:#-]?[ \t]*([A-Za-z]?\d{1,3})(?![\d:]|[ \t]*(?:AM|PM))\b/gi)].map(m => ({ label: m[2]!.toUpperCase(), component: /^sec/i.test(m[1]!) ? null : ({ lec: 'lecture', lecture: 'lecture', lab: 'lab', rec: 'recitation', recitation: 'recitation', sem: 'seminar' } as Record<string,string>)[m[1]!.toLowerCase()] ?? null }));
}
export function parseSchedule(doc: OcrDocument, layout: Layout): ScheduleResult {
  const result: ScheduleResult = { schemaVersion: 1, provider: 'google-vision', layout, rawText: doc.text, classes: [], warnings: [], requiresReview: true };
  const grouped = regions(doc, layout);
  const headings = grouped.filter(r => !codes(r.evidence.text).length).flatMap(r => terms(r.evidence.text));
  const globalTerms = [...new Map(headings.map(t => [JSON.stringify(t), t])).values()];
  if (grouped.some(r => !r.positioned)) result.warnings.push(warning('LAYOUT_UNAVAILABLE', 'No positioned text is available; uncertain metadata was omitted.'));
  if (globalTerms.length > 1) result.warnings.push(warning('AMBIGUOUS_TERM', 'Multiple term headings detected; review term association.'));
  for (const region of grouped) {
    const text = region.evidence.text;
    if (/\b[A-Za-z]{2,4}[ \t-]+(?=[0-9IlO]*[IlO])[0-9IlO]{3}\b/.test(text)) result.warnings.push(warning('AMBIGUOUS_CODE', 'A course-like code contains ambiguous letters/digits; review the raw text.'));
    if (/\b[A-Za-z]{2,4}[ \t-]*\d{3}[A-Za-z]\b/.test(text)) result.warnings.push(warning('UNSUPPORTED_CODE', 'A course-number suffix is unsupported; review the raw text.'));
    const matches = codes(text);
    for (const match of matches) {
      const localTerms = region.positioned && matches.length === 1 ? terms(text) : [];
      const term = localTerms.length === 1 ? localTerms[0]! : localTerms.length === 0 && globalTerms.length === 1 ? globalTerms[0]! : null;
      const code = `${match[1]!.toUpperCase()} ${match[2]!}`;
      const warnings: Warning[] = [];
      if (!term) warnings.push(warning('MISSING_TERM', 'No unambiguous semester and year; review required.'));
      if (localTerms.length > 1 || matches.length > 1) warnings.push(warning('AMBIGUOUS_METADATA', 'Multiple plausible associations; uncertain metadata was omitted.'));
      const associated = region.positioned && matches.length === 1;
      let sectionValues = associated ? sections(text) : [];
      const suffix = text.slice(match.index! + match[0].length).match(/^[ \t]*-[ \t]*([A-Za-z]?\d{1,3})(?![A-Za-z0-9:])/);
      if (suffix) {
        const label = suffix[1]!.toUpperCase();
        if (sectionValues.some(s => s.label !== label)) {
          sectionValues = []; warnings.push(warning('CONFLICTING_SECTION', 'Section evidence conflicts; review and enter the section.'));
        } else if (!sectionValues.length) {
          const component = associated && /\bLecture\b/i.test(text) ? 'lecture' : associated && /\bLab\b/i.test(text) ? 'lab' : null;
          sectionValues = [{ label, component }];
        }
      }
      const titleMatch = associated ? text.match(/\bTitle\s*:\s*([^\n|]+)/i) : null;
      const title = titleMatch?.[1]?.trim() ?? null;
      let candidate = result.classes.find(c => c.code === code && JSON.stringify(c.term) === JSON.stringify(term));
      if (!candidate) {
        candidate = { department: match[1]!.toUpperCase(), courseNumber: match[2]!, code, title, term, sections: [], evidence: [], warnings: [], verification: 'unverified' };
        result.classes.push(candidate);
      } else if (title && candidate.title && title !== candidate.title) {
        candidate.title = null; warnings.push(warning('CONFLICTING_TITLE', 'Conflicting titles detected; title omitted.'));
      } else if (title && !candidate.warnings.some(w => w.code === 'CONFLICTING_TITLE')) candidate.title = title;
      candidate.sections = [...new Map([...candidate.sections, ...sectionValues].map(s => [JSON.stringify(s), s])).values()];
      candidate.evidence.push(region.evidence);
      candidate.warnings = [...new Map([...candidate.warnings, ...warnings].map(w => [w.code, w])).values()];
    }
  }
  if (!doc.text.trim()) result.warnings.push(warning('NO_TEXT', 'No readable text detected. Try a clearer screenshot.'));
  else if (!result.classes.length) result.warnings.push(warning('NO_CLASSES', 'Text was read but no supported course codes were identified.'));
  return result;
}
