import type { Binding, LotPot } from '../imposition/offsetBook';
export interface JobState { binding: Binding | null; lotPot: LotPot | null; blankPages: 'end' | 'before-back-cover' | 'decline' | null }
export type MissingField = 'blankPages' | 'binding' | 'lotPot';
export const emptyState: JobState = { binding: null, lotPot: null, blankPages: null };
export function finalPageCount(state: JobState, count: number) {
  return count + (count % 4 && state.blankPages && state.blankPages !== 'decline' ? 4 - count % 4 : 0);
}
export function missingFields(state: JobState, count: number): MissingField[] {
  if (count % 4 && state.blankPages === 'decline') return [];
  const missing: MissingField[] = [];
  if (count % 4 && !state.blankPages) missing.push('blankPages');
  if (!state.binding) missing.push('binding');
  if (finalPageCount(state, count) % 8 === 4 && !state.lotPot) missing.push('lotPot');
  return missing;
}
export function isReady(state: JobState, count: number) {
  return count > 0 && finalPageCount(state, count) % 4 === 0 && missingFields(state, count).length === 0;
}
export function mergeState(state: JobState, updates: Partial<JobState>, count: number): JobState {
  const next = { ...state };
  if (updates.binding) next.binding = updates.binding;
  if (count % 4 && updates.blankPages) next.blankPages = updates.blankPages;
  if (!(count % 4)) next.blankPages = null;
  if (finalPageCount(next, count) % 8 === 4) { if (updates.lotPot) next.lotPot = updates.lotPot; }
  else next.lotPot = null;
  return next;
}
export function cannedQuestion(field: MissingField, ctx: { state: JobState; pageCount: number }) {
  const count = finalPageCount(ctx.state, ctx.pageCount);
  if (field === 'blankPages') return { text: `This PDF needs ${4 - ctx.pageCount % 4} blank pages to reach ${ctx.pageCount + 4 - ctx.pageCount % 4} pages. Where should they go?`, options: [{ label: 'At the end', value: 'end' }, { label: 'Before back cover', value: 'before-back-cover' }, { label: 'Re-upload instead', value: 'decline' }] };
  if (field === 'binding') return { text: 'Which edge should the book bind on?', options: ['left', 'right', 'top', 'bottom'].map(value => ({ label: value[0].toUpperCase() + value.slice(1), value })) };
  return { text: `Where should the Lot-Pot go? Title Lot-Pot: pages 1, 2, ${count - 1}, ${count} print first. Inner Lot-Pot: pages ${count / 2 - 1}–${count / 2 + 2} print last.`, options: [{ label: 'Title Lot-Pot', value: 'title' }, { label: 'Inner Lot-Pot', value: 'inner' }] };
}
export const declineMessage = 'Re-upload a PDF whose page count is a multiple of 4.';
