import { z } from 'zod';
export const stateSchema = z.object({ quantity: z.number().int().min(1).max(1_000_000_000).nullable(), binding: z.enum(['left','right','top','bottom']).nullable(), lotPot: z.enum(['title','inner']).nullable(), blankPages: z.enum(['end','before-back-cover','decline']).nullable() }).strict();
export const modelSchema = z.object({ reply: z.string(), updates: stateSchema, asking: z.enum(['blankPages','binding','lotPot','quantity']).nullable(), outOfScope: z.boolean() }).strict();
export const requestSchema = z.object({
  preflight: z.object({ fileName: z.string().max(255), pageCount: z.number().int().positive(), pageWidthIn: z.number().positive(), pageHeightIn: z.number().positive(), uniform: z.boolean(), colorMode: z.enum(['CMYK','RGB','Grayscale','Mixed','Unknown']) }).strict(),
  state: stateSchema,
  messages: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().transform(s => s.slice(0,2000)) }).strict()).transform(m => m.slice(-20)),
}).strict();
export type AssistantRequest = z.infer<typeof requestSchema>;
