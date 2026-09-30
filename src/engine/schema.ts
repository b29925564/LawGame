import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能用小寫英數與連字號');

export const appIds = ['mail', 'files', 'cctv', 'phone'] as const;
export type AppId = (typeof appIds)[number];

export const caseSchema = z.object({
  id,
  title: z.string(),
  incident: z.array(z.object({ speaker: z.string(), text: z.string() })).min(1),
  characters: z.array(z.object({ id, name: z.string(), role: z.string() })),
  evidence: z.array(z.object({ id, name: z.string(), description: z.string() })),
  documents: z.array(
    z.object({
      id,
      app: z.enum(appIds),
      title: z.string(),
      from: z.string().optional(),
      body: z.string(),
      evidence: z.array(id).default([]),
    }),
  ),
  trial: z.object({
    witness: id,
    persuasion: z.number().int().min(1),
    intro: z.string(),
    statements: z
      .array(
        z.object({
          id,
          text: z.string(),
          press: z.string(),
          contradiction: z.object({ evidence: id, rebuttal: z.string() }).optional(),
        }),
      )
      .min(1),
    wrongEvidence: z.string(),
    verdict: z.object({ win: z.string(), lose: z.string() }),
  }),
});

export type CaseData = z.infer<typeof caseSchema>;
export type Statement = CaseData['trial']['statements'][number];
