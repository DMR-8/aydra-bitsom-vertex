import { isSupportedPageSize, classifyPamphletPaper, isPamphletPageCount } from '../../../lib/paper';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { modelSchema, requestSchema } from '../../../lib/assistant/schema';
import { systemPrompt } from '../../../lib/assistant/systemPrompt';
import { reconcile } from '../../../lib/assistant/reconcile';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let raw: unknown;
  try { const body = await request.text(); if (body.length > 100_000) return Response.json({ error: 'Request is too large.' }, { status: 413 }); raw = JSON.parse(body); }
  catch { return Response.json({ error: 'Invalid JSON request.' }, { status: 400 }); }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: 'Invalid preflight, state or chat history.' }, { status: 400 });
  const input = parsed.data;
  const pamphlet = isPamphletPageCount(input.preflight.pageCount);
  const width=input.preflight.pageWidthIn*72, height=input.preflight.pageHeightIn*72;
  const validSize = pamphlet ? !!classifyPamphletPaper(width,height) : isSupportedPageSize(width,height);
  if (!input.preflight.uniform || !validSize) return Response.json({ error: pamphlet ? 'Pamphlets require uniform A5, half-letter, A4 or Letter pages (±5 mm).' : 'Every page must be A4 portrait: 210 × 297 mm (±5 mm per dimension), with uniform page sizes.' }, { status: 400 });
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return Response.json({ error: 'The assistant is not configured. Use the choice buttons to continue.' }, { status: 503 });
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 0 });
    const result = await client.responses.create({ model: process.env.OPENAI_MODEL, store: false, instructions: systemPrompt(input), input: input.messages, text: { format: zodTextFormat(modelSchema, 'offset_book_choices') } });
    const output = modelSchema.parse(JSON.parse(result.output_text));
    return Response.json(reconcile(input, output));
  } catch {
    return Response.json({ error: 'The assistant is unavailable. Use the choice buttons to finish your job.' }, { status: 502 });
  }
}
