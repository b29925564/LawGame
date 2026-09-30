import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能用小寫英數與連字號');
const time = z.string().regex(/^\d\d:\d\d$/, '時間格式是 HH:MM');

/** 手機畫面上的一則訊息。from 是 me 代表玩家（手機主人）送出的。 */
const message = z.object({ id: id.optional(), from: z.string(), text: z.string() });

/**
 * 冷開場的手機劇本：一步一步往下走，每一步切換手機上的畫面。
 * 除了 choose、ride、badge、door 要玩家做特定操作，其餘步驟點「繼續」往下。
 */
const phoneStep = z.discriminatedUnion('do', [
  z.object({ do: z.literal('caption'), time: time.optional(), text: z.string() }),
  z.object({ do: z.literal('notify'), time: time.optional(), message }),
  z.object({ do: z.literal('say'), time: time.optional(), message }),
  z.object({
    do: z.literal('choose'),
    /** chat：選項是要送出的訊息；talk：選項是要說出口的話。 */
    mode: z.enum(['chat', 'talk']),
    options: z
      .array(
        z.object({
          text: z.string(),
          /** 選了之後對方的回應。 */
          then: z.array(z.object({ who: z.string(), text: z.string() })).default([]),
        }),
      )
      .min(1),
  }),
  z.object({ do: z.literal('talk'), time: time.optional(), who: z.string(), text: z.string() }),
  z.object({
    do: z.literal('ride'),
    time: time.optional(),
    from: z.string(),
    to: z.string(),
    driver: z.string(),
  }),
  z.object({ do: z.literal('badge'), time: time.optional(), place: z.string() }),
  z.object({ do: z.literal('door'), text: z.string(), action: z.string() }),
  /** 把先前的訊息改成「此訊息已被收回」。 */
  z.object({ do: z.literal('retract'), time: time.optional(), target: id }),
]);

const scene = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('phone'),
    id,
    act: z.string(),
    owner: z.string(),
    steps: z.array(phoneStep).min(1),
  }),
  /** 片頭或幕與幕之間的標題卡。 */
  z.object({
    type: z.literal('card'),
    id,
    act: z.string(),
    title: z.string(),
    lines: z.array(z.string()).default([]),
  }),
]);

export const episodeSchema = z.object({
  id,
  number: z.number().int().min(1),
  title: z.string(),
  scenes: z.array(scene).min(1),
});

export type Episode = z.infer<typeof episodeSchema>;
export type Scene = Episode['scenes'][number];
export type PhoneScene = Extract<Scene, { type: 'phone' }>;
export type PhoneStep = PhoneScene['steps'][number];
export type Message = z.infer<typeof message>;
