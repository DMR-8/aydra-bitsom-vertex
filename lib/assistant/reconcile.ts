import { isPamphletPageCount } from '../paper';
import type { z } from 'zod';
import type { modelSchema, AssistantRequest } from './schema';
import { cannedQuestion, declineMessage, finalPageCount, isReady, mergeState, missingFields } from './jobState';
export function reconcile(input: AssistantRequest, output: z.infer<typeof modelSchema>) {
  const pamphlet = isPamphletPageCount(input.preflight.pageCount);
  const updates = { ...output.updates };
  // A schema proves shape, not intent. Never accept an invented Lot-Pot choice.
  const latest = input.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
  if (updates.lotPot && !new RegExp(`\\b${updates.lotPot}\\b`, 'i').test(latest)) updates.lotPot = null;
  const state = output.outOfScope ? input.state : mergeState(input.state, updates, input.preflight.pageCount);
  const missing = missingFields(state, input.preflight.pageCount);
  const first = missing[0];
  const question = first ? cannedQuestion(first, { state, pageCount: input.preflight.pageCount }) : undefined;
  let reply = output.reply;
  // Replace, rather than append to, a reply that asks the wrong question.
  if (question && (output.asking !== first || !reply.includes('?'))) reply = question.text;
  if (output.outOfScope && pamphlet) reply = `This PDF is a pamphlet: one page is single-sided and two pages are front/back. Choose a quantity to use the fixed shop layout. ${question?.text ?? 'Your current quantity is unchanged.'}`;
  if (output.outOfScope && !pamphlet) reply = `This app only makes Center Pin Offset Books on a 4-page plate on 530 × 664 mm plates (landscape for top/bottom binding), with the fixed shop markers and gripper setup. ${question?.text ?? 'Your current choices are unchanged.'}`;
  if (!pamphlet && updates.lotPot && finalPageCount(state, input.preflight.pageCount) % 8 !== 4) reply = `No Lot-Pot is needed for this page count. ${question?.text ?? 'Review the plan below.'}`;
  if (!pamphlet && input.preflight.pageCount % 4 && state.blankPages === 'decline') reply = declineMessage;
  return { reply, state, missing, question: question && { field: first, options: question.options }, ready: isReady(state, input.preflight.pageCount), outOfScope: output.outOfScope };
}
