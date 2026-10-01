import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能用小寫英數與連字號');

import { relations, tags } from './constants';

export { relations, tags, type Relation, type Tag } from './constants';

const line = z.object({ q: z.string(), a: z.string() });

export const caseSchema = z.object({
  id,
  title: z.string(),
  intro: z.array(z.string()).min(1),
  hours: z.number().int().min(1),
  cards: z.array(
    z.object({
      id,
      name: z.string(),
      kind: z.enum(['事實', '陳述']),
      time: z
        .string()
        .regex(/^\d\d:\d\d$/)
        .optional(),
      text: z.string(),
      /** 開庭時已被法庭採納（檢方提出或雙方不爭執）。 */
      admitted: z.boolean().default(false),
    }),
  ),
  questions: z.array(
    z.object({
      id,
      text: z.string(),
      answer: z.array(id).min(2).max(3),
      relation: z.enum(relations),
      argument: z.object({
        id,
        name: z.string(),
        text: z.string(),
        strength: z.number().int().min(5).max(25),
        tags: z.array(z.enum(tags)).min(1),
      }),
    }),
  ),
  jurors: z
    .array(
      z.object({
        id,
        label: z.string(),
        leans: z.array(z.enum(tags)).min(1).max(2),
        start: z.number().int().min(0).max(100),
        foreperson: z.boolean().default(false),
      }),
    )
    .length(12),
  threshold: z.number().int(),
  patience: z.number().int().min(1),
  /** 先上場的專家證人：可以在這裡替之後的對質鋪陳。 */
  expert: z.object({
    name: z.string(),
    role: z.string(),
    questions: z.array(
      line.extend({
        id,
        admits: id.optional(),
        irrelevant: z.boolean().default(false),
      }),
    ),
  }),
  witness: z.object({
    name: z.string(),
    role: z.string(),
    irrelevant: z.array(line),
    claims: z.array(
      z.object({
        id,
        text: z.string(),
        argument: id,
        needs: id,
        lock: z.object({ strong: line, weak: line }),
        setup: line,
        /** 對質後的反應：strong＝鎖定確實（彈劾成功），weak＝鎖得不夠死，證人圓了過去。 */
        confront: z.object({ strong: z.string(), weak: z.string() }),
      }),
    ),
    breakdown: z.string(),
  }),
  closing: z.object({ max: z.number().int().min(1) }),
});

export type CaseData = z.infer<typeof caseSchema>;
export type Card = CaseData['cards'][number];
export type Question = CaseData['questions'][number];
export type Argument = Question['argument'];
export type Juror = CaseData['jurors'][number];
export type Claim = CaseData['witness']['claims'][number];
