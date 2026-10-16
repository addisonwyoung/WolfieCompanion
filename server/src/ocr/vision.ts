import type { protos } from '@google-cloud/vision';
import type { OcrDocument, Point } from './types.js';
type Annotation = protos.google.cloud.vision.v1.IAnnotateImageResponse;
export interface VisionClient {
  documentTextDetection(request: { image: { content: Buffer } }, options: { timeout: number; retry: null }): Promise<[Annotation, ...unknown[]]>;
}
export class OcrError extends Error {}
export function diagnostic(error: unknown): OcrError {
  if (error instanceof OcrError) return error;
  const record = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  const message = typeof record.message === 'string' ? record.message : '';
  const code = Number(record.code);
  if (code === 16 || /default credentials|could not load|authentication|invalid_grant/i.test(message))
    return new OcrError('Authentication failed. Run gcloud auth application-default login and set your quota project.');
  if (code === 7 || /billing|permission|disabled|serviceusage/i.test(message))
    return new OcrError('Access denied. Check project billing, enable vision.googleapis.com, and check your account permissions and ADC quota project.');
  if (code === 8) return new OcrError('Google Vision quota exceeded. Check project quotas and retry manually later.');
  if (code === 4 || /deadline|timed out/i.test(message)) return new OcrError('Google Vision timed out after 30 seconds. Retry manually; no automatic retry was sent.');
  if (code === 3) return new OcrError('Google Vision could not process the image. Use a readable PNG or JPEG screenshot.');
  return new OcrError('Google Vision request failed. Check connectivity and project setup, then retry manually.');
}
function box(poly: protos.google.cloud.vision.v1.IBoundingPoly | null | undefined): Point[] {
  return (poly?.vertices ?? []).map(v => ({ x: v.x ?? 0, y: v.y ?? 0 }));
}
export function convertAnnotation(response: Annotation): OcrDocument {
  if (response.error?.code) throw diagnostic(response.error);
  const full = response.fullTextAnnotation;
  return {
    text: full?.text ?? response.textAnnotations?.[0]?.description ?? '',
    pages: (full?.pages ?? []).map(page => ({
      width: page.width ?? 0, height: page.height ?? 0,
      blocks: (page.blocks ?? []).map(block => ({ box: box(block.boundingBox),
        paragraphs: (block.paragraphs ?? []).map(p => ({ box: box(p.boundingBox),
          words: (p.words ?? []).map(w => ({ text: (w.symbols ?? []).map(s => s.text ?? '').join(''), box: box(w.boundingBox), confidence: w.confidence ?? null }))
        }))
      }))
    }))
  };
}
export async function extractDocument(bytes: Buffer, client?: VisionClient): Promise<OcrDocument> {
  let owned: import('@google-cloud/vision').ImageAnnotatorClient | undefined;
  try {
    if (!client) {
      const { ImageAnnotatorClient } = await import('@google-cloud/vision');
      owned = new ImageAnnotatorClient();
      client = owned as unknown as VisionClient;
    }
    const [response] = await client.documentTextDetection({ image: { content: bytes } }, { timeout: 30_000, retry: null });
    return convertAnnotation(response);
  } catch (error) { throw diagnostic(error); }
  finally { if (owned) await owned.close(); }
}
