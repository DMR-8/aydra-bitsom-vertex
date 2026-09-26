import type { PageSize } from './types';
import { PDFDocument } from 'pdf-lib';
export async function insertBlankPages(bytes: Uint8Array, count: number, position: 'end' | 'before-back-cover', pageSize?: PageSize): Promise<Uint8Array> {
  if (!Number.isInteger(count) || count < 0 || count > 3) throw new Error('Expected 0–3 blank pages.');
  const doc = await PDFDocument.load(bytes);
  const first = doc.getPage(0);
  const quarterTurn = Math.abs(first.getRotation().angle) % 180 === 90;
  const size = pageSize ?? (quarterTurn ? { width: first.getHeight(), height: first.getWidth() } : first.getSize());
  const index = position === 'end' ? doc.getPageCount() : doc.getPageCount() - 1;
  for (let i = 0; i < count; i++) doc.insertPage(index + i, [size.width, size.height]);
  return doc.save();
}
