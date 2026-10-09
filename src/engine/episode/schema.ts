import { z } from 'zod';
import { relations, tags } from '../schema';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能用小寫英數與連字號');
const time = z.string().regex(/^\d\d:\d\d$/, '時間格式是 HH:MM');

/** 手機畫面上的一則訊息。from 是 me 代表玩家（手機主人）送出的。 */
const message = z.object({ id: id.optional(), from: z.string(), text: z.string() });

/**
 * 介面記號（設計稿 inner-voice 2）：盧卡斯沒說出口的話不進對白框，改由她的手留在畫面上。
 * text 是記號上顯示的字；word 是螢光筆或結論卡來源要標的那個詞；on 是記號貼在哪張卡或哪個元件上。
 */
export const markKinds = [
  'sticky',
  'highlight',
  'gap',
  'sync',
  'conclusion',
  'stamp',
  'confirm',
  'iou',
  'anchored',
  'window',
  'tally',
] as const;
const mark = z.object({
  kind: z.enum(markKinds),
  text: z.string().optional(),
  word: z.string().optional(),
  on: z.string().optional(),
});

/**
 * 說話的一行。
 * thought＝舊的內心獨白，轉換期保留；新內容改用 voice 或 mark（設計稿 inner-voice）。
 * voice:'off'＝畫外字幕：不掛名字框，置中於畫面 46%，text 裡的「｜」是唯一可斷行處。
 * beats＝多拍字幕，每拍一段；hush 的那一拍前面先全靜 1200ms。
 */
/** 立繪表情。慌、默對應立繪包的 panic、silent。 */
export const moods = ['平', '緊', '暖', '硬', '慌', '默'] as const;

const line = z.object({
  who: z.string(),
  text: z.string(),
  mood: z.enum(moods).default('平'),
  thought: z.boolean().default(false),
  voice: z.literal('off').optional(),
  beats: z.array(z.object({ text: z.string(), hush: z.boolean().default(false) })).optional(),
  /** 音效建議的 key，播放端沒有對應音效就略過。 */
  sfx: z.string().optional(),
  mark: mark.optional(),
});

/**
 * 分支條件：結局與尾聲依判決、案件理論、對話旗標、倫理帳本分開寫。
 * 每一項都要成立才算符合；沒寫的項目不限制。
 */
const when = z.object({
  verdict: z.array(z.enum(['無罪', '有罪', '有責', '無責', '陪審團僵局'])).optional(),
  theory: z.array(id).optional(),
  /** 這些旗標全部都要有。 */
  flags: z.array(z.string()).optional(),
  /** 這些旗標一個都不能有。 */
  notFlags: z.array(z.string()).optional(),
  /** 這些旗標至少要有一個（例如群組截圖照實交出，或硬藏後被揭穿：對方手上都有）。 */
  anyFlags: z.array(z.string()).optional(),
  /** 這一集怎麼收場：deal＝接受認罪協商（E4），dismissed＝證人援引緘默權後撤回起訴（E1）。 */
  outcome: z.array(z.enum(['deal', 'dismissed'])).optional(),
  /** 協商成交的是哪個條件（offer id）。 */
  deal: z.array(id).optional(),
  /** 這些卡片或論點全部都要在手上。 */
  cards: z.array(id).optional(),
  /** 這些卡片或論點一張都不能在手上。 */
  notCards: z.array(id).optional(),
  /** 倫理帳本裡至少有其中一筆。 */
  ethics: z.array(z.string()).optional(),
  /** 倫理帳本裡這些一筆都不能有。 */
  notEthics: z.array(z.string()).optional(),
  /** 這些論點全部都在庭上出示過（對質或逼出緘默權）或結辯用過。 */
  presented: z.array(id).optional(),
  /** 懲罰性賠償成立（true）或沒有成立（false，包括根本沒進入那一輪）。 */
  punitive: z.boolean().optional(),
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

/** 案卷登錄表的一行。 */
const docketRow = z.object({
  date: z.string().regex(/^\d\d\/\d\d\/\d{4}$/, '登錄表日期格式是 MM/DD/YYYY'),
  entry: z.string(),
});

/** 對話場景：一行一行往下，遇到選擇就停。 */
const dialogueStep = z.discriminatedUnion('do', [
  line.extend({ do: z.literal('say') }),
  z.object({
    do: z.literal('choose'),
    prompt: z.string().optional(),
    options: z
      .array(
        z.object({
          text: z.string(),
          then: z.array(line).default([]),
          /** 選了就記下的旗標，之後的場景與集數可以查（例如草稿交給誰）。 */
          flags: z.array(z.string()).default([]),
          /** 選了就記進倫理紀錄的項目；玩家看不到，第一季季終的懲戒聽證會翻出來（企劃書 6.12）。 */
          ethics: z.array(z.string()).default([]),
          /** 條件不符就不出現這個選項（例如沒見過潔德就不能交給她）。 */
          when: when.optional(),
        }),
      )
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
  /** 整場訪談能安撫幾次；不設上限的話，每問一題都可以安撫掉。 */
  calms: z.number().int().min(1).default(2),
  guarded: z.array(line).min(1),
  outro: z.array(line).default([]),
});

/** 卷宗裡的一句話；有 fact 的句子標記後生成事實卡。 */
const docLine = z.object({ text: z.string(), fact: id.optional() });

/** 卷宗紀錄上的時間，月／日加 24 小時制（設定集第 9 章 PhotoLog、EvidenceBag）。 */
const stamp = z.string().regex(/^\d\d\/\d\d \d\d:\d\d$/, '紀錄時間格式是 MM/DD HH:MM');

/** 照片紀錄表的四欄。案號是拍照機關自己的號碼，不是法院案號。 */
/** 文件交出方的 Bates（設定集第 9 章 :11）：前綴是交出的一方，錄影加 -V-，後接六位數。 */
const batesNo = z
  .string()
  .regex(
    /^(CALDER|CPD|DA|ME|WH|OKF)(-V)?-\d{6}$/,
    'Bates 格式是 CALDER／CPD／DA／ME／WH／OKF 加六位數',
  );

const photoLog = z
  .object({
    caseNo: z.string(),
    /** 沖印本的 Bates（法醫 ME-、警方 CPD-）。 */
    bates: batesNo.optional(),
    no: z.number().int().min(1),
    of: z.number().int().min(1),
    at: stamp,
    by: z.string(),
  })
  .refine((p) => p.no <= p.of, '照片序號不能大於總張數');

/** 證物袋：袋上印的表頭，加上手寫的保管鏈（每經手一次一行，不斷手、時間遞增）。 */
const bag = z
  .object({
    caseNo: z.string(),
    item: z.string(),
    acquiredBy: z.string(),
    from: z.string(),
    desc: z.string(),
    /**
     * 每經手一次一行。寫了 when 的那一行要等條件成立（例如做了那件工作、拿到那張卡）才算發生；
     * 還沒發生的那一行和之後的每一行都畫成「尚未發生」（見 custody.ts）。
     */
    custody: z
      .array(
        z.object({
          at: stamp,
          from: z.string(),
          to: z.string(),
          purpose: z.string(),
          when: when.optional(),
        }),
      )
      .min(1),
  })
  .refine(
    (b) =>
      b.custody.every(
        (c, i) => i === 0 || (b.custody[i - 1].at < c.at && b.custody[i - 1].to === c.from),
      ),
    '保管鏈要時間遞增，而且上一手的收受人就是下一手的交出人',
  );

const card = z.object({
  id,
  name: z.string(),
  /** 物品／文件／陳述（設計稿 board-redesign）。 */
  kind: z.enum(['物品', '文件', '陳述', '宣誓陳述', '論點']),
  /** 物品卡的實物縮圖（public/ 底下的路徑）；沒有就畫剪影。 */
  image: z.string().optional(),
  /** 哪一天，例如「週五」。時間線上沒有日期就分不出先後。 */
  date: z.string().optional(),
  time: time.optional(),
  /** 抵達時間（例如叫車收據的下車時間），時間線的間距標記讀它，不讀 time。 */
  arrivesAt: time.optional(),
  text: z.string(),
  source: z.string(),
  /** 一開始就在手上（起訴資料附的）。 */
  held: z.boolean().default(false),
  admitted: z.boolean().default(false),
  /** 這份文件或物品紀錄交出時蓋的 Bates（首頁）。照片卡寫在 photo.bates；陳述、筆錄、法院裁定不蓋。 */
  bates: batesNo.optional(),
  /** 依分支換交出方的 Bates：第一筆符合 when 的取代 bates（例如硬藏後由原告交出的群組截圖）。 */
  batesIf: z.array(z.object({ when, bates: batesNo })).optional(),
  /** 陳述的出處：記錄的時間與製作人。 */
  taken: z.object({ at: stamp, by: z.string() }).optional(),
  /** 法院裁定與訴狀的出處：案號與收文章日期（MM/DD/YYYY）。 */
  filed: z
    .object({
      caseNo: z.string(),
      date: z.string().regex(/^\d\d\/\d\d\/\d{4}$/, '收文章日期格式是 MM/DD/YYYY'),
    })
    .optional(),
  /** 筆錄與勘誤表的出處：頁:行。 */
  cite: z
    .string()
    .regex(/^\d+:\d+$/, '筆錄頁行格式是 頁:行')
    .optional(),
  /** 照片類卡片的照片紀錄表。 */
  photo: photoLog.optional(),
  /** 扣押物或傳票調閱回來的實物，裝在證物袋裡。 */
  bag: bag.optional(),
});

/**
 * 推理第一步：連線（企劃書 6.5）。兩張卡加一種關係，成立就得到一條「發現」。
 * 卡片可以是證據，也可以是已經確認的論點。
 */
const link = z.object({
  id,
  cards: z.array(id).length(2),
  /** 說得通的替代卡：cards 裡某張卡 → 同樣能連出這條發現的其他卡。 */
  accept: z.record(id, z.array(id)).default({}),
  relation: z.enum(relations),
  /** 連線成立後顯示的發現。 */
  text: z.string(),
  /**
   * 推理結論卡（設計稿 inner-voice 2b）：回報先在證據原文螢光 word，
   * 這條連線成立時才在索引卡上寫出 text；沒成立就只留螢光。
   */
  conclusion: z.object({ word: z.string(), text: z.string() }).optional(),
});

/** 推理第二步：拿發現（或已確認的論點）回答疑問，全對才產生論點卡。 */
const question = z.object({
  id,
  text: z.string(),
  answer: z.array(id).min(1).max(3),
  /** 說得通的替代：answer 裡某條發現 → 同樣能回答這個疑問的其他發現或論點。 */
  accept: z.record(id, z.array(id)).default({}),
  /** 這些全部到手才出現在證據板：卡片、連出的發現或確認過的論點。不填＝一開始就看得到。 */
  unlock: z.array(id).default([]),
  argument: z.object({
    id,
    name: z.string(),
    text: z.string(),
    strength: z.number().int().min(5).max(25),
    tags: z.array(z.enum(tags)).min(1),
    /** 只用於聲請的程序論點（例如相關性、取證違法），不拿去對陪審團講，結辯選單排除。 */
    motionOnly: z.boolean().default(false),
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
        /** 委託完成就記下的旗標（例如請證人更正筆錄）。 */
        flags: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  /** 法院系統：動議與傳票（企劃書 6.6）。三樣都選對才成立。 */
  motions: z
    .array(
      z.object({
        id,
        label: z.string(),
        detail: z.string(),
        cost: z.number().int().min(1),
        /** 要先有這些卡片或論點才提得出來。 */
        needs: z.array(id).default([]),
        bases: z.array(z.string()).min(2),
        basis: z.string(),
        /** 支撐：剛好要選這幾張卡（順序不拘）。 */
        support: z.array(id).min(1).max(2),
        /** 說得通的替代卡：support 裡某張卡 → 同樣能撐起聲請的其他卡。 */
        accept: z.record(id, z.array(id)).default({}),
        /**
         * 誘答：同一件事附近、看起來撐得起但其實不行的卡或論點。
         * 證物格只列正解、替代卡和這些，不列整個證據庫（見 desk.supportPool）。
         */
        lures: z.array(id).default([]),
        requests: z.array(z.string()).min(2),
        request: z.string(),
        granted: z.array(line).min(1),
        denied: z.array(line).min(1),
        gives: z.array(id).default([]),
        /** 核准後記下的旗標（例如排除對方專家：那場庭審用 when.notFlags 跳過）。 */
        flags: z.array(z.string()).default([]),
        /** 核准後陪審團起始傾向降幾點（例如對方專家被排除，只剩一般證詞）。 */
        jury: z.number().int().min(0).default(0),
        /** 對方反擊：核准後卡爾德聲請撤銷，事務所要你收手（企劃書 10.7 中段反轉）。 */
        twist: z
          .object({
            lines: z.array(line).min(1),
            options: z
              .array(
                z.object({
                  text: z.string(),
                  /** 後續換了時間地點就寫，例如答辯庭當晚在事務所走廊（設定集第 3 章第 12 格）。 */
                  place: z.string().optional(),
                  then: z.array(line).min(1),
                  gives: z.array(id).default([]),
                  flags: z.array(z.string()).default([]),
                  /** 選了就記進倫理帳本（例如為了客戶撤回傳票），第一季懲戒聽證會讀得到（企劃書 6.12）。 */
                  ethics: z.array(z.string()).default([]),
                }),
              )
              .length(2),
          })
          .optional(),
      }),
    )
    .default([]),
  links: z.array(link).default([]),
  /**
   * 證據開示（被動方，第 2 集）：對方的請求清單，每項回應一次——交出、主張特權、主張範圍過廣。
   * privilege：valid 站得住；weak 法官勉強准了但記一筆；none 沒有理由，等於硬藏（之後會被揭穿）。
   * overbroad：主張範圍過廣站不站得住；站不住就被裁定照交，法官也記一筆。
   */
  discovery: z
    .array(
      z.object({
        id,
        text: z.string(),
        /** 這項請求涵蓋的文件（卡片 id）。 */
        cards: z.array(id).min(1),
        /** 這些卡片或發現全部到手，請求才出現（免得文件名稱先爆了推理鏈的轉折）。 */
        unlock: z.array(id).default([]),
        privilege: z.enum(['valid', 'weak', 'none']).default('none'),
        /** 條件成立時特權已被放棄（例如證人在錄取時說出了意見內容）：valid 降成 weak。 */
        waived: when.optional(),
        overbroad: z.boolean().default(false),
        /** 交出（或被裁定照交）時，這些論點對方也知道了：標成已揭露，庭上衝擊減半。 */
        exposes: z.array(id).default([]),
        /** 回應之後的旁白或對白（依結果），沒寫就不播。 */
        lines: z
          .object({
            produced: z.array(line),
            withheld: z.array(line),
            strained: z.array(line),
            concealed: z.array(line),
            narrowed: z.array(line),
            compelled: z.array(line),
          })
          .partial()
          .default({}),
      }),
    )
    .default([]),
  /**
   * 時間線上的手的記號（設計稿 inner-voice 2d）。
   * gap：兩張卡的時間先後正確時，在較晚那張上方標出間距。sync：兩列同時亮起，when 的旗標有了才播。
   */
  timelineMarks: z
    .array(
      z.object({
        kind: z.enum(['gap', 'sync']),
        cards: z.array(id).length(2),
        when: z.string().optional(),
      }),
    )
    .default([]),
  questions: z.array(question).min(1),
  /** 確認這條推理鏈，才能結束這一幕。 */
  goal: id,
  goalLines: z.array(line).default([]),
});

/** 第四幕的一個開庭段落（企劃書 6.9）。 */
const trialScene = z.object({
  type: z.literal('trial'),
  id,
  act: z.string(),
  day: z.string(),
  /** 條件不符就整場跳過（例如對方專家被 Daubert 排除）。 */
  when: when.optional(),
  /** 對方發問的律師；不填用這一集的 counsel。 */
  examiner: z.string().optional(),
  threshold: z.number().int(),
  /** 舉證門檻：刑事（預設）或民事。民事的門檻通常是 50，由原告負責把量表推過線。 */
  burden: z.enum(['criminal', 'civil']).default('criminal'),
  /** 判決需要幾位陪審員同一邊；不填＝全體一致。 */
  quorum: z.number().int().min(1).optional(),
  patience: z.number().int().min(1),
  jurors: z
    .array(
      z.object({
        id,
        label: z.string(),
        /** 只有姓名（評議句子的主詞用）；label 可能帶職業。 */
        name: z.string().optional(),
        leans: z.array(z.enum(tags)).min(1).max(2),
        start: z.number().int().min(0).max(100),
        foreperson: z.boolean().default(false),
      }),
    )
    // 刑事 12 人；民事可以更少（第 2 集 6 人）。有陪審團遴選時人數要等於 seats（驗證器檢查）。
    .min(1),
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
            .enum(['誘導', '傳聞', '推測', '無關', '品格證據', '已問已答', '缺乏基礎', '違反裁定'])
            .nullable()
            .default(null),
          /** 條件不符就不問（例如沒有排除裁定時才問）。條件要在開庭前就確定，庭審中途不能變。 */
          when: when.optional(),
          /**
           * 審前裁定排除了這題要帶出的證據：條件成立時檢方照問，正確的異議變成「違反裁定」，
           * sustained 不填就用法官的預設台詞。
           */
          barred: z.object({ when, sustained: z.string().optional() }).optional(),
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
          /** 證詞錄取時已經定錨的說法：這一步視同完成鎖定（企劃書 6.9.4）。 */
          anchor: id.optional(),
          /** 對方的底牌反擊：論點先洩漏出去，檢方就備好了這一手（企劃書 6.8）。 */
          counter: z
            .object({
              argument: id,
              text: z.string(),
              /** 證人回答再主詰問的那一句；有寫才插在盧卡斯回應之前。 */
              answer: z.string().optional(),
              /** 破解要出示的卡片。 */
              needs: id,
              broken: z.string(),
              failed: z.string(),
            })
            .optional(),
        }),
      )
      .min(1),
    irrelevant: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    breakdown: z.string(),
  }),
  intro: z.array(line).default([]),
  outro: z.array(line).default([]),
  /** 彈劾到一定程度又出示那個論點，證人當庭援引緘默權（企劃書 10.9 的 E1）。 */
  fifth: z
    .object({
      needs: z.number().int().min(1),
      argument: id,
      lines: z.array(line).min(1),
      /** 只有選了這個理論才撤回起訴（E1）；其他理論改成刪除證詞、審判繼續。不填＝一律撤訴。 */
      theory: id.optional(),
      /** 刪除證詞時法官對陪審團的指示；不填用預設台詞。 */
      struck: z.array(line).optional(),
    })
    .optional(),
});

/**
 * 證詞錄取（企劃書 6.7）：庭外、宣誓、12 個提問額度。
 * 每個問題可以定錨（把說法講死，開庭時直接跳過鎖定）或探路（問出新資訊），
 * 而標了 tip 的問題會洩漏方向，對應論點被標成「已揭露」。
 */
const depositionScene = z.object({
  type: z.literal('deposition'),
  id,
  act: z.string(),
  place: z.string(),
  /** ours：我方發問（預設）。theirs：對方主導，玩家只能替自己的證人異議。 */
  side: z.enum(['ours', 'theirs']).default('ours'),
  budget: z.number().int().min(1).default(1),
  witness: z.object({ name: z.string(), role: z.string() }),
  /** 錄影畫面疊在介面層的出處：錄影那一方的 Bates 與時間碼（HH:MM:SS;FF）。 */
  video: z
    .object({
      bates: batesNo.refine((b) => b.includes('-V-'), '錄影 Bates 要有 -V-'),
      timecode: z.string().regex(/^\d\d:\d\d:\d\d;\d\d$/, '時間碼格式是 HH:MM:SS;FF'),
    })
    .optional(),
  /** 對方主導時發問的律師。 */
  examiner: z.string().default('對造律師'),
  intro: z.array(line).default([]),
  outro: z.array(line).default([]),
  /**
   * 對方主導的問題，依序問。objection 是這題真正的毛病（null＝沒毛病）：
   * 異議對了，答案留下異議紀錄（旗標 depo:<場景>:<題>:preserved，庭上用不了）；
   * 「特權」異議對了，證人不回答，gives 也不會出現。異議錯了，法官讀筆錄時記一筆。
   */
  script: z
    .array(
      z.object({
        id,
        q: z.string(),
        a: z.string(),
        objection: z
          .enum(['誘導', '傳聞', '推測', '無關', '已問已答', '缺乏基礎', '特權'])
          .nullable()
          .default(null),
        /** 這個回答讓雙方都看到的新卡片。 */
        gives: z.array(id).default([]),
        /** 答了就把這個說法鎖成宣誓陳述（假話是對方問出來的，但是我們的證人說的）。 */
        anchors: id.optional(),
        /** 劇本別處引用這一句的筆錄頁行（頁:行），例如勘誤表的「第 42 頁第 7 行」。 */
        cite: z
          .string()
          .regex(/^\d+:\d+$/, '筆錄頁行格式是 頁:行')
          .optional(),
        /** 這題有毛病、玩家卻沒用對異議時才生效：對方多拿到的卡片與留下的旗標。 */
        missed: z
          .object({ gives: z.array(id).default([]), flags: z.array(z.string()).default([]) })
          .default({ gives: [], flags: [] }),
      }),
    )
    .default([]),
  topics: z
    .array(
      z.object({
        id,
        label: z.string(),
        questions: z
          .array(
            z.object({
              id,
              q: z.string(),
              a: z.string(),
              /** 問完就把這個說法鎖成宣誓陳述，開庭時可以跳過鎖定那一步。 */
              anchors: id.optional(),
              /** 問出來的新卡片。 */
              gives: z.array(id).default([]),
              /** 底牌話題：問了就洩漏方向，對應論點被標成已揭露。 */
              tips: z.array(id).default([]),
              /** 對方律師的異議，但證人照樣要回答。 */
              objection: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .default([]),
});

/**
 * 談判：認罪協商（企劃書 6.8）。對方有信心與看不見的底線，
 * 攤牌會洩漏論點，虛張聲勢要看證據清單撐不撐得住。
 */
const negotiationScene = z.object({
  type: z.literal('negotiation'),
  id,
  act: z.string(),
  place: z.string(),
  opponent: z.object({ name: z.string(), role: z.string() }),
  client: z.object({ name: z.string(), trust: z.number().int().min(0).max(5) }),
  confidence: z.number().int().min(0).max(100),
  rounds: z.number().int().min(1),
  intro: z.array(line).default([]),
  /** 信心落在 min 以上時，對方開的條件。由高到低寫。 */
  offers: z
    .array(
      z.object({
        id,
        min: z.number().int().min(0).max(100),
        label: z.string(),
        lines: z.array(line).min(1),
        /** 委託人問「妳覺得我該接受嗎」的那一句。 */
        asks: z.array(line).default([]),
        /** 金額（民事和解）；超過授權上限就要先請示委託人。 */
        amount: z.number().int().min(0).optional(),
        /** 附帶非金錢條款（例如修改演算法），要委託人另外點頭。 */
        terms: z.boolean().default(false),
      }),
    )
    .min(2),
  /** 虛張聲勢時可以聲稱的論點：對方會核對證據清單。 */
  bluffs: z
    .array(
      z.object({
        id,
        label: z.string(),
        /** 撐得起這個說法的證據；有一張不在開示清單上就被識破。 */
        needs: z.array(id).min(1),
        strength: z.number().int().min(1),
        believed: z.array(line).min(1),
        caught: z.array(line).min(1),
      }),
    )
    .default([]),
  /**
   * 和解授權（第 2 集）：替公司談，金額超過上限要打電話請示。
   * 每通電話用掉一回合，上限提高 raise，委託人對你的評價下降（旗標 call:<場景 id>:<第幾通>）。
   */
  authority: z
    .object({
      cap: z.number().int().min(0),
      raise: z.number().int().min(0),
      /** 請示時是否同意非金錢條款。 */
      terms: z.boolean().default(false),
      /** 每通電話委託人的回應；通數超過就重複最後一段。 */
      calls: z.array(z.array(line).min(1)).min(1),
      /** 超過授權還想接受時，盧卡斯自己的提醒。 */
      over: z.array(line).min(1),
    })
    .optional(),
  /** 舊欄位，已不使用：虛張聲勢改看玩家手上真的拿到的證據。 */
  disclosed: z.array(id).default([]),
  reveals: z.array(line).default([]),
  walkOut: z.array(line).min(1),
  accepted: z.array(line).min(1),
});

/**
 * 辯方證人（企劃書 6.9.6）：我方直接詰問。只能用開放式問題，依時間順序問；
 * 先有證人準備，其中可以選「告訴他該怎麼說」（記倫理紀錄）。
 * 陪審團沿用前面庭審留下的那一份心證。
 */
const defenseScene = z.object({
  type: z.literal('defense'),
  id,
  act: z.string(),
  /** 反詰問的對方律師；不填用這一集的 counsel。 */
  examiner: z.string().optional(),
  /** 條件不符就跳過這位證人（例如玩家決定不讓他作證）。 */
  when: when.optional(),
  day: z.string().default(''),
  witness: z.object({ name: z.string(), role: z.string() }),
  intro: z.array(line).default([]),
  /** 證人準備：審前花的工時（只顯示與記錄），與一組選項。 */
  prep: z.object({
    hours: z.number().int().min(0),
    options: z
      .array(
        z.object({
          id,
          label: z.string(),
          detail: z.string(),
          /** 所有回答的衝擊倍率：沒準備的證人會緊張。 */
          multiplier: z.number().min(0).default(1),
          /** 被教過的措辭（標記 rehearsed 的問題）額外的倍率。 */
          rehearsed: z.number().min(0).default(1),
          /** 教過證人：檢方反詰問時，問過 rehearsed 問題就會被問「有人教你怎麼說嗎？」。 */
          coached: z.boolean().default(false),
          ethics: z.array(z.string()).default([]),
          flags: z.array(z.string()).default([]),
          /** 條件不符就不出現（例如筆錄更正過，就沒有「再說一遍」可教）。 */
          when: when.optional(),
        }),
      )
      .min(1),
  }),
  /** 最多能問幾題。 */
  asks: z.number().int().min(1),
  questions: z
    .array(
      z.object({
        id,
        /** 時間順序；照順序問才連貫，倒著問衝擊減半。 */
        seq: z.number().int().min(0),
        q: z.string(),
        a: z.string(),
        impact: z.number().min(0),
        tags: z.array(z.enum(tags)).min(1),
        rehearsed: z.boolean().default(false),
        /** 手上要先有這些卡片或論點才問得出口；沒拿到證據，證人也無從說起。 */
        needs: z.array(id).default([]),
        /** 開門陷阱：問了這題，檢方反詰問時可以提本來不能提的事。 */
        door: z
          .object({ q: z.string(), a: z.string(), penalty: z.number().int().min(1) })
          .optional(),
        /** 條件不符就不出現（條件要在開庭前就確定）。 */
        when: when.optional(),
        /** 問了這題時手上有這些論點＝明知證詞是假的還讓他說，記進倫理帳本。 */
        ethicsIf: z
          .object({ has: z.array(id).min(1), ethics: z.array(z.string()).min(1) })
          .optional(),
      }),
    )
    .min(1),
  /** 反詰問時對方另外問的題（條件成立才問），全體往對方移 penalty。 */
  cross: z
    .array(
      z.object({
        id: id.optional(),
        when: when.optional(),
        /** 直接詰問問過其中任何一題就不問（那一題的 door 已經是同一個彈劾，不重複）。 */
        unlessAsked: z.array(id).default([]),
        /** 直接詰問問過其中任何一題才問（例如讓證人再說一次假話之後，對方才拿出那份文件）。 */
        ifAsked: z.array(id).default([]),
        q: z.string(),
        a: z.string(),
        penalty: z.number().int().min(0),
      }),
    )
    .default([]),
  /** 被教過的證人露餡時，檢方問的那一句與證人的回答，以及全體往有罪移多少。 */
  leak: z.object({
    q: z.string().default('證人，有人教過你這些話該怎麼說嗎？'),
    a: z.string(),
    penalty: z.number().int().min(1).default(8),
  }),
  outro: z.array(line).default([]),
});

/**
 * 案件理論（企劃書 6.9.2）：開庭前選一個，選了就不能換。
 * 每個理論要有哪些論點才站得住，並列出開場陳述可以許下的承諾。
 */
const theoryScene = z.object({
  type: z.literal('theory'),
  id,
  act: z.string(),
  place: z.string(),
  intro: z.array(line).default([]),
  theories: z
    .array(
      z.object({
        id,
        name: z.string(),
        summary: z.string(),
        /** 要先確認這些論點，理論才站得住。 */
        needs: z.array(id).min(1),
        /** 選了之後的一句話代價或風險，讓玩家選的時候看得到。 */
        cost: z.string(),
        /** 選這個理論時手上已經有這些論點＝明知故犯，記進倫理帳本（一筆一點）。 */
        ethicsIf: z
          .object({ has: z.array(id).min(1), ethics: z.array(z.string()).min(1) })
          .optional(),
        /**
         * 這個理論在陪審團心裡的代價：結辯開始時，全體往有責／有罪移 all，
         * 取向符合 leans 的陪審員另外再移（例如同情原告的人反彈）。note 在結辯畫面上告訴玩家為什麼。
         */
        jury: z
          .object({
            all: z.number().int().default(0),
            leans: z.partialRecord(z.enum(tags), z.number().int()).default({}),
            note: z.string(),
          })
          .optional(),
        /** 判有責時，陪審團認定死者自己的過失比例（百分比），判賠金額照比例扣。 */
        fault: z.number().int().min(0).max(100).optional(),
        /** 判決表上過失比例旁的一句理由：陪審團為什麼認為死者有這麼多錯。 */
        faultWhy: z.string().optional(),
        promises: z
          .array(
            z.object({
              id,
              text: z.string(),
              /** 庭上彈劾成功並出示這個論點，承諾就兌現。 */
              argument: id,
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

/** 開場陳述（企劃書 6.9.3）：從選定理論的承諾裡挑最多 picks 個。 */
const openingScene = z.object({
  type: z.literal('opening'),
  id,
  act: z.string(),
  place: z.string(),
  picks: z.number().int().min(1).default(3),
  intro: z.array(line).default([]),
  /** 承諾兌現：全體陪審員往辯方；結辯時還沒兌現：全體往有罪方向。 */
  kept: z.number().int().min(0).default(5),
  broken: z.number().int().min(0).default(8),
});

/**
 * 陪審團遴選（企劃書 6.9.1）：候選人取 seats 位（刑事 12、民事 6）。
 * 問卷看得到的寫在 sheet，提問才看得到的寫在 hidden。
 */
const voirDireScene = z.object({
  type: z.literal('voirdire'),
  id,
  act: z.string(),
  place: z.string(),
  /** 可以提問的次數。 */
  questions: z.number().int().min(1),
  /** 玩家的無因迴避次數；檢方同樣有這麼多次。 */
  peremptories: z.number().int().min(1),
  seats: z.number().int().min(1),
  intro: z.array(line).default([]),
  candidates: z
    .array(
      z.object({
        id,
        name: z.string(),
        job: z.string(),
        sheet: z.string(),
        leans: z.array(z.enum(tags)).min(1).max(2),
        start: z.number().int().min(0).max(100),
        /** 陪審長由領導特質最高的人擔任。 */
        lead: z.number().int().min(0).default(0),
        /** 這個人對辯方多有利（0–10）：檢方的無因迴避照這個順序砍。 */
        value: z.number().int().min(0).max(10).default(5),
        question: z.object({ q: z.string(), a: z.string() }),
        /** 提問後才看得到的偏見。 */
        hidden: z.string().optional(),
        /** 提問後明確表示偏見＝可以有因迴避。 */
        cause: z.boolean().default(false),
      }),
    )
    .min(1),
});

/**
 * 結辯與判決（企劃書 6.9.8、6.10）：挑三個論點排順序，選一種訴求基調，
 * 然後是三輪評議與判決。玩家看得到誰被說服，但插不了手。
 */
const closingScene = z.object({
  type: z.literal('closing'),
  id,
  act: z.string(),
  place: z.string(),
  /** 要挑幾個論點。 */
  picks: z.number().int().min(1),
  threshold: z.number().int().min(1).max(100),
  intro: z.array(line).default([]),
  tones: z.array(z.object({ id, label: z.string(), tag: z.enum(tags), text: z.string() })).min(2),
  /** 判決之後的結局：依判決分開寫。 */
  /** 刑事寫無罪／有罪／僵局，民事寫無責／有責／僵局；驗證器依庭審的 burden 檢查。 */
  verdicts: z.object({
    無罪: z.array(line).min(1).optional(),
    有罪: z.array(line).min(1).optional(),
    有責: z.array(line).min(1).optional(),
    無責: z.array(line).min(1).optional(),
    陪審團僵局: z.array(line).min(1),
  }),
  /** 依條件改寫的結局，第一個符合的取代 verdicts 裡的那一段。 */
  endings: z.array(z.object({ id, when, lines: z.array(line).min(1) })).default([]),
  /**
   * 民事判決的金額：判有責時，損害總額扣掉死者過失比例（理論的 fault，依票數離門檻多近浮動 swing 個百分點）。
   * punitive：懲罰性賠償另外評議一輪，門檻較高（明確且令人信服）；符合 when 其中一項才進入，bonus 是不利推定之類的加成。
   */
  damages: z
    .object({
      total: z.number().int().min(0),
      swing: z.number().int().min(0).default(5),
      punitive: z
        .object({
          threshold: z.number().int().min(1).max(100).default(65),
          ratio: z.number().min(0).default(2),
          when: z.array(z.object({ when, bonus: z.number().int().default(0) })).min(1),
        })
        .optional(),
    })
    .optional(),
});

const scene = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('phone'),
    id,
    act: z.string(),
    /** 條件不符就整場跳過（尾聲分支用）。 */
    when: when.optional(),
    /** 尾聲：協商成交或撤回起訴提前收場時，只演標了 epilogue 的場景。 */
    epilogue: z.boolean().default(false),
    owner: z.string(),
    steps: z.array(phoneStep).min(1),
    /** 演完最後一步之後的警方現場照片（設定集 05-05），照順序排在照片紀錄表裡。 */
    photos: z
      .array(
        z.object({
          id,
          subject: z.string(),
          /** 照片裡的證物牌號碼；沒有證物牌的全景照不填。 */
          placard: z.number().int().optional(),
          /** 一格一黃：只有這一張的證物牌是黃。 */
          highlight: z.boolean().default(false),
          /** 照片拍到遺體：以「照片已遮蔽」黑條呈現。 */
          redacted: z.boolean().default(false),
          photo: photoLog,
        }),
      )
      .optional(),
  }),
  z.object({
    type: z.literal('dialogue'),
    id,
    act: z.string(),
    /** 條件不符就整場跳過（尾聲分支用）。 */
    when: when.optional(),
    /** 尾聲：協商成交或撤回起訴提前收場時，只演標了 epilogue 的場景。 */
    epilogue: z.boolean().default(false),
    place: z.string(),
    steps: z.array(dialogueStep).min(1),
    /** 這一場畫成手機來電畫面（設定集第 3 章第 29 格）：來電顯示與通話結束時的時間。 */
    call: z
      .object({
        caller: z.string(),
        duration: z.string().regex(/^\d\d:\d\d$/, '通話時間格式是 MM:SS'),
      })
      .optional(),
  }),
  interviewScene,
  deskScene,
  trialScene,
  depositionScene,
  voirDireScene,
  theoryScene,
  openingScene,
  defenseScene,
  closingScene,
  negotiationScene,
  /** 片頭或幕與幕之間的標題卡。 */
  z.object({
    type: z.literal('card'),
    id,
    act: z.string(),
    when: when.optional(),
    epilogue: z.boolean().default(false),
    title: z.string(),
    lines: z.array(z.string()).default([]),
    /** 案卷登錄表的一行：案件行事曆上的日期（MM/DD/YYYY）與法院紀錄口吻的事項。序號依卡的順序產生。 */
    docket: docketRow.optional(),
    /**
     * 上一張卡之後、這張卡之前的其他法院事件（證物袋引用的傳票、檢視令、撤銷聲請），
     * 排在本卡 docket 那一行前面。寫了 when 的只在那條分支列出。
     */
    filings: z.array(docketRow.extend({ when: when.optional() })).optional(),
  }),
]);

export const episodeSchema = z
  .object({
    id,
    number: z.number().int().min(1),
    title: z.string(),
    /** 對造律師（第 1 集是檢察官）：庭上發問、反詰問的人。 */
    counsel: z.string().default('莫羅檢察官'),
    /**
     * 前面的選擇留下的代價：條件在開庭或調解開始那一刻判斷。jury：開庭時全體陪審員起始往對方移幾點；
     * confidence、trust：調解時對方的起始信心與客戶信任加減；flags：條件成立就算有這些旗標，而且帶到下一集。
     */
    effects: z
      .array(
        z.object({
          when,
          jury: z.number().int().default(0),
          confidence: z.number().int().default(0),
          trust: z.number().int().default(0),
          flags: z.array(z.string()).default([]),
        }),
      )
      .default([]),
    /** 案卷登錄表的最後一行：判決或處分，各分支一句，列第一個符合 when 的。 */
    disposition: z.array(docketRow.extend({ when })).optional(),
    scenes: z.array(scene).min(1),
  })
  // 庭審與辯方證人場景沒寫 examiner 的，補上這一集的對造律師。
  .transform((e) => ({
    ...e,
    scenes: e.scenes.map((s) =>
      (s.type === 'trial' || s.type === 'defense') && !s.examiner
        ? { ...s, examiner: e.counsel }
        : s,
    ),
  }));

export type Episode = z.infer<typeof episodeSchema>;
export type Scene = Episode['scenes'][number];
export type PhoneScene = Extract<Scene, { type: 'phone' }>;
export type PhoneStep = PhoneScene['steps'][number];
export type DialogueScene = Extract<Scene, { type: 'dialogue' }>;
export type InterviewScene = Extract<Scene, { type: 'interview' }>;
export type DeskScene = Extract<Scene, { type: 'desk' }>;
export type TrialScene = Extract<Scene, { type: 'trial' }>;
export type DepositionScene = Extract<Scene, { type: 'deposition' }>;
export type VoirDireScene = Extract<Scene, { type: 'voirdire' }>;
export type ClosingScene = Extract<Scene, { type: 'closing' }>;
export type DefenseScene = Extract<Scene, { type: 'defense' }>;
export type TheoryScene = Extract<Scene, { type: 'theory' }>;
export type OpeningScene = Extract<Scene, { type: 'opening' }>;
export type Theory = TheoryScene['theories'][number];
export type Candidate = VoirDireScene['candidates'][number];
export type NegotiationScene = Extract<Scene, { type: 'negotiation' }>;
export type DepoQuestion = DepositionScene['topics'][number]['questions'][number];
export type Offer = NegotiationScene['offers'][number];
export type Line = z.infer<typeof line>;
export const lineSchema = line;
export type When = z.infer<typeof when>;
export type Card = z.infer<typeof card>;
export type Question = z.infer<typeof question>;
export type Motion = DeskScene['motions'][number];
export type Topic = z.infer<typeof topic>;
export type Message = z.infer<typeof message>;
