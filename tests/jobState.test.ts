import { expect, it } from 'vitest';
import { emptyState, missingFields, finalPageCount, isReady, mergeState, cannedQuestion } from '../lib/assistant/jobState';
it('asks blanks before binding, and Lot-Pot only on the final count', () => {
  expect(missingFields(emptyState,18)).toEqual(['blankPages','binding']);
  const padded = mergeState(emptyState,{blankPages:'end'},18);
  expect(finalPageCount(padded,18)).toBe(20);
  expect(missingFields(padded,18)).toEqual(['binding','lotPot']);
  expect(missingFields({...padded,binding:'top'},18)).toEqual(['lotPot']);
  expect(missingFields(padded,14)).toEqual(['binding']);
});
it('only asks Lot-Pot at 4 modulo 8', () => {
  for (const count of [4,8,12,16,20,24,28]) expect(missingFields({...emptyState,binding:'left'},count)).toEqual(count%8===4 ? ['lotPot'] : []);
});
it('decline blocks readiness and irrelevant values are removed', () => {
  expect(isReady({...emptyState,binding:'top',blankPages:'decline'},18)).toBe(false);
  expect(mergeState({...emptyState,lotPot:'inner',blankPages:'end'},{},16)).toEqual(emptyState);
});
it('explains actual page numbers', () => {
  const q=cannedQuestion('lotPot',{state:emptyState,pageCount:20});
  expect(q.text).toContain('1, 2, 19, 20'); expect(q.text).toContain('9–12');
  expect(cannedQuestion('binding',{state:emptyState,pageCount:20}).options).toHaveLength(4);
});
