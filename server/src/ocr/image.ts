import { OcrError } from './vision.js';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function validateImage(bytes: Buffer): 'image/png' | 'image/jpeg' {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new OcrError('Image must be nonempty and no larger than 10 MiB.');
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  throw new OcrError('Unsupported image contents. Use a PNG or JPEG screenshot.');
}
