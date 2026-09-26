import { isPamphletPageCount } from '../paper';
import type { Binding, LotPot } from '../imposition/offsetBook';
export interface JobState { quantity: number | null; binding: Binding | null; lotPot: LotPot | null; blankPages: 'end' | 'before-back-cover' | 'decline' | null }
export type MissingField = 'blankPages' | 'binding' | 'lotPot' | 'quantity';
export const emptyState: JobState = { binding: null, lotPot: null, blankPages: null, quantity: null };
export function finalPageCount(state: JobState, count: number) {
  if (isPamphletPageCount(count)) return count;
  return count + (count % 4 && state.blankPages && state.blankPages !== 'decline' ? 4 - count % 4 : 0);
}
export function missingFields(state: JobState, count: number): MissingField[] {
  if (isPamphletPageCount(count)) return validQuantity(state.quantity) ? [] : ['quantity'];
  if (count % 4 && state.blankPages === 'decline') return [];
  const missing: MissingField[] = [];
  if (count % 4 && !state.blankPages) missing.push('blankPages');
  if (!state.binding) missing.push('binding');
  if (finalPageCount(state, count) % 8 === 4 && !state.lotPot) missing.push('lotPot');
  return missing;
}
export function isReady(state: JobState, count: number) {
  if (isPamphletPageCount(count)) return validQuantity(state.quantity);
  return count > 0 && finalPageCount(state, count) % 4 === 0 && missingFields(state, count).length === 0;
}
export function mergeState(state: JobState, updates: Partial<JobState>, count: number): JobState {
  if (isPamphletPageCount(count)) return { ...emptyState, quantity: validQuantity(updates.quantity) ? updates.quantity! : validQuantity(state.quantity) ? state.quantity : null };
  const next = { ...state, quantity: null };
  if (updates.binding) next.binding = updates.binding;
  if (count % 4 && updates.blankPages) next.blankPages = updates.blankPages;
  if (!(count % 4)) next.blankPages = null;
  if (finalPageCount(next, count) % 8 === 4) { if (updates.lotPot) next.lotPot = updates.lotPot; }
  else next.lotPot = null;
  return next;
}
export function cannedQuestion(field: MissingField, ctx: { state: JobState; pageCount: number }) {
  if (field === 'quantity') return { text: `This ${ctx.pageCount}-page PDF is a ${ctx.pageCount === 1 ? 'single-sided' : 'front/back'} pamphlet. How many finished copies do you need?`, options: [1000,2000,4000,5000].map(n=>({label:`${n.toLocaleString('en-US')} copies`,value:String(n)})) };
  const count = finalPageCount(ctx.state, ctx.pageCount);
  if (field === 'blankPages') return { text: `This PDF needs ${4 - ctx.pageCount % 4} blank pages to reach ${ctx.pageCount + 4 - ctx.pageCount % 4} pages. Where should they go?`, options: [{ label: 'At the end', value: 'end' }, { label: 'Before back cover', value: 'before-back-cover' }, { label: 'Re-upload instead', value: 'decline' }] };
  if (field === 'binding') return { text: 'Which edge should the book bind on?', options: ['left', 'right', 'top', 'bottom'].map(value => ({ label: value[0].toUpperCase() + value.slice(1), value })) };
  return { text: `Where should the Lot-Pot go? Title Lot-Pot: pages 1, 2, ${count - 1}, ${count} print first. Inner Lot-Pot: pages ${count / 2 - 1}–${count / 2 + 2} print last.`, options: [{ label: 'Title Lot-Pot', value: 'title' }, { label: 'Inner Lot-Pot', value: 'inner' }] };
}
export const declineMessage = 'Re-upload a PDF whose page count is a multiple of 4.';

export function validQuantity(quantity: unknown): quantity is number { return typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1_000_000_000; }
