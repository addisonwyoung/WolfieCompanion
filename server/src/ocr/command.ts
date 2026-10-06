import { open } from 'node:fs/promises';
import type { Layout, OcrProvider } from './types.js';
import { extractDocument, OcrError } from './vision.js';
import { parseSchedule } from './parser.js';
import { MAX_IMAGE_BYTES, validateImage } from './image.js';
export { MAX_IMAGE_BYTES } from './image.js';
export function argumentsFor(args: string[]): { image: string; layout: Layout } {
  const values = new Map<string,string>();
  for (let i=0;i<args.length;i+=2) {
    const flag=args[i], value=args[i+1];
    if (!flag || !['--image','--layout'].includes(flag) || !value || value.startsWith('--') || values.has(flag)) throw new OcrError('Usage: --image /path/schedule.png --layout class-list|weekly-calendar');
    values.set(flag,value);
  }
  const image=values.get('--image'), layout=values.get('--layout');
  if (!image || (layout!=='class-list' && layout!=='weekly-calendar') || /^[a-z][a-z0-9+.-]*:\/\//i.test(image)) throw new OcrError('Supply one local image path and --layout class-list or weekly-calendar. URLs are not supported.');
  return {image,layout};
}
export async function readImage(path: string): Promise<Buffer> {
  let file;
  try {
    file = await open(path,'r');
    const stat=await file.stat();
    if (!stat.isFile() || stat.size===0 || stat.size>MAX_IMAGE_BYTES) throw new OcrError('Image must be a nonempty regular PNG/JPEG file no larger than 10 MiB.');
    // Bound allocation and reads even if a file grows after stat.
    const bytes=Buffer.alloc(Math.min(stat.size+1,MAX_IMAGE_BYTES+1));
    let offset=0;
    while(offset<bytes.length) { const r=await file.read(bytes,offset,bytes.length-offset,offset); if(!r.bytesRead)break; offset+=r.bytesRead; }
    if (offset>MAX_IMAGE_BYTES) throw new OcrError('Image exceeds the 10 MiB limit.');
    const content=bytes.subarray(0,offset);
    validateImage(content);
    return content;
  } catch(error) {
    if(error instanceof OcrError)throw error;
    throw new OcrError('Unable to read the local image. Check its path and file permissions.');
  } finally { await file?.close(); }
}
export interface Output { stdout: (text: string)=>void; stderr: (text: string)=>void }
export async function runCommand(args: string[], output: Output, provider: OcrProvider=extractDocument): Promise<number> {
  try {
    const {image,layout}=argumentsFor(args);
    const bytes=await readImage(image);
    const doc=await provider(bytes);
    output.stdout(JSON.stringify(parseSchedule(doc,layout),null,2)+'\n');
    return 0;
  } catch(error) {
    output.stderr((error instanceof OcrError ? error.message : 'Schedule extraction failed. Check input and project setup.')+'\n');
    return 1;
  }
}
