import { z } from "zod";
export const joinSchema = z.object({ name: z.string().trim().min(1).max(40), participantId: z.string().min(8).max(80).optional() });
export const signalSchema = z.object({ from: z.string().min(8), to: z.string().min(8).optional(), type: z.enum(["offer", "answer", "ice"]), payload: z.unknown() });
export type JoinInput = z.infer<typeof joinSchema>;
export const roomInputSchema = z.object({ name: z.string().trim().min(3).max(80), description: z.string().max(300).default(""), color: z.enum(["violet", "cyan", "amber", "rose"]).default("violet") });
