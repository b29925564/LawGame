import { z } from 'zod';
import { relations, tags } from '../schema';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能用小寫英數與連字號');
const time = z.string().regex(/^\d\d:\d\d$/, '時間格式是 HH:MM');

/** 手機畫面上的一則訊息。from 是 me 代表玩家（手機主人）送出的。 */
const message = z.object({ id: id.optional(), from: z.string(), text: z.string() });

/** 說話的一行。thought＝艾莉絲的內心獨白（提示的主要載體，企劃書 11）。 */
const line = z.object({
  who: z.string(),
  text: z.string(),
  mood: z.enum(['平', '緊', '暖', '硬']).default('平'),
  thought: z.boolean().default(false),
});

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

/** 對話場景：一行一行往下，遇到選擇就停。 */
const dialogueStep = z.discriminatedUnion('do', [
  line.extend({ do: z.literal('say') }),
  z.object({
    do: z.literal('choose'),
    prompt: z.string().optional(),
    options: z
      .array(z.object({ text: z.string(), then: z.array(line).default([]) }))
      .min(2)
      .max(4),
  }),
]);

/** 訪談（企劃書 6.3）：提問、出示、施壓、安撫，證人有一個戒心計量。 */
const topic = z.object({
  id,
  label: z.string(),
  /** 要先有這些卡片才會出現這個話題。 */
  needs: z.array(id).default([]),
  lines: z.array(line).min(1),
  gives: z.array(id).default([]),
  guard: z.number().int().default(0),
  /** 標記為關鍵的話題問完才能結束訪談。 */
  key: z.boolean().default(false),
});

const interviewScene = z.object({
  type: z.literal('interview'),
  id,
  act: z.string(),
  who: z.string(),
  role: z.string(),
  via: z.string(),
  meter: z.object({ label: z.string(), start: z.number().int().min(0), max: z.number().int() }),
  intro: z.array(line).default([]),
  topics: z.array(topic).min(1),
  press: z
    .array(
      z.object({
        id,
        label: z.string(),
        /** 手上有這張卡才問得動他；沒有就只是把他惹毛。 */
        needs: id,
        lines: z.array(line).min(1),
        gives: z.array(id).default([]),
        blank: z.array(line).min(1),
      }),
    )
    .default([]),
  calm: z.array(line).min(1),
  guarded: z.array(line).min(1),
  outro: z.array(line).default([]),
});

/** 卷宗裡的一句話；有 fact 的句子標記後生成事實卡。 */
const docLine = z.object({ text: z.string(), fact: id.optional() });

const card = z.object({
  id,
  name: z.string(),
  kind: z.enum(['事實', '陳述', '宣誓陳述', '論點']),
  time: time.optional(),
  text: z.string(),
  source: z.string(),
  /** 一開始就在手上（起訴資料附的）。 */
  held: z.boolean().default(false),
  admitted: z.boolean().default(false),
});

const question = z.object({
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
});

/** 第二幕的桌面（企劃書 6.1）：郵件、卷宗、證據庫、證據板、委託、行事曆。 */
const deskScene = z.object({
  type: z.literal('desk'),
  id,
  act: z.string(),
  hours: z.number().int().min(1),
  deadline: z.string(),
  cards: z.array(card),
  docs: z
    .array(z.object({ id, title: z.string(), from: z.string(), lines: z.array(docLine).min(1) }))
    .default([]),
  mail: z
    .array(
      z.object({
        id,
        from: z.string(),
        subject: z.string(),
        body: z.array(z.string()).min(1),
        /** 花掉這麼多工時之後才寄達（證據開示收件匣）。 */
        afterHours: z.number().int().default(0),
        gives: z.array(id).default([]),
      }),
    )
    .default([]),
  jobs: z
    .array(
      z.object({
        id,
        who: z.string(),
        label: z.string(),
        detail: z.string(),
        cost: z.number().int().min(1),
        needs: z.array(id).default([]),
        report: z.array(line).min(1),
        gives: z.array(id).default([]),
      }),
    )
    .default([]),
  questions: z.array(question).min(1),
  /** 確認這條推理鏈就能進入下一場。 */
  goal: id,
  goalLines: z.array(line).default([]),
});

/** 第四幕的一個開庭段落（企劃書 6.9）。 */
const trialScene = z.object({
  type: z.literal('trial'),
  id,
  act: z.string(),
  day: z.string(),
  threshold: z.number().int(),
  patience: z.number().int().min(1),
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
  witness: z.object({
    name: z.string(),
    role: z.string(),
    /** 檢方的直接詰問，玩家在每個問題後有一個異議窗。 */
    direct: z
      .array(
        z.object({
          id,
          q: z.string(),
          a: z.string(),
          /** 這個問題可以異議的正確理由；null 代表問題沒有毛病。 */
          objection: z
            .enum(['誘導', '傳聞', '推測', '無關', '已問已答', '缺乏基礎'])
            .nullable()
            .default(null),
          /** 沒異議的話，這句證詞往有罪方向推的力道。 */
          impact: z.number().int().min(0).default(0),
          tags: z.array(z.enum(tags)).default([]),
          sustained: z.string().optional(),
        }),
      )
      .min(1),
    /** 交互詰問要拆的說法，依鎖定、鋪陳、對質三步驟。 */
    claims: z
      .array(
        z.object({
          id,
          text: z.string(),
          argument: id,
          needs: id,
          lock: z.object({
            strong: z.object({ q: z.string(), a: z.string() }),
            weak: z.object({ q: z.string(), a: z.string() }),
          }),
          setup: z.object({ q: z.string(), a: z.string() }),
          confront: z.object({ strong: z.string(), weak: z.string() }),
        }),
      )
      .min(1),
    irrelevant: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    breakdown: z.string(),
  }),
  intro: z.array(line).default([]),
  outro: z.array(line).default([]),
});

const scene = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('phone'),
    id,
    act: z.string(),
    owner: z.string(),
    steps: z.array(phoneStep).min(1),
  }),
  z.object({
    type: z.literal('dialogue'),
    id,
    act: z.string(),
    place: z.string(),
    steps: z.array(dialogueStep).min(1),
  }),
  interviewScene,
  deskScene,
  trialScene,
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
export type DialogueScene = Extract<Scene, { type: 'dialogue' }>;
export type InterviewScene = Extract<Scene, { type: 'interview' }>;
export type DeskScene = Extract<Scene, { type: 'desk' }>;
export type TrialScene = Extract<Scene, { type: 'trial' }>;
export type Line = z.infer<typeof line>;
export type Card = z.infer<typeof card>;
export type Question = z.infer<typeof question>;
export type Topic = z.infer<typeof topic>;
export type Message = z.infer<typeof message>;
