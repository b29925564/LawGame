/**
 * 第 2 集崔佛提案的引擎部分：前面的選擇留下的代價（effects）、對方主導錄取的 missed／anchors、
 * 開示的 exposes／waived、書桌委託的旗標、辯方證人的 when／ethicsIf／cross。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import {
  allFlags,
  carryOver,
  courtScene,
  deskScene,
  exposedArgs,
  negoScene,
  useEpisode,
  witnessScene,
} from '../game';
import type { Progress } from '../save';
import * as defense from './defense';
import * as depo from './deposition';
import * as desk from './desk';
import type {
  DefenseScene,
  DepositionScene,
  DeskScene,
  Episode,
  NegotiationScene,
  TrialScene,
} from './schema';

const ep2 = episodes.ep2 as Episode;
const scene = <T>(id: string) => ep2.scenes.find((s) => s.id === id) as T;
const at = (id: string) => ep2.scenes.findIndex((s) => s.id === id);
const progress = (over: Partial<Progress> = {}): Progress => ({
  episode: 'ep2',
  scene: 0,
  step: 0,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes: {},
  ...over,
});

const saved = { effects: ep2.effects, scenes: ep2.scenes };
afterEach(() => {
  ep2.effects = saved.effects;
  ep2.scenes = saved.scenes;
});
/** 暫時換掉第 2 集的某個場景（測完還原）。 */
const patch = <T extends Episode['scenes'][number]>(id: string, f: (s: T) => T) => {
  ep2.scenes = ep2.scenes.map((s) => (s.id === id ? f(s as T) : s));
};

describe('集層級 effects', () => {
  const chat = 'discovery:rq-chat:produced';

  it('條件成立：開庭時全體陪審員起始往對方移，調解信心與客戶信任跟著變', () => {
    ep2.effects = [
      { when: { flags: [chat] }, jury: 6, confidence: 10, trust: -1, flags: [] },
      { when: { flags: ['never'] }, jury: 50, confidence: 50, trust: -5, flags: [] },
    ];
    const court = scene<TrialScene>('court-marisol');
    const nego = scene<NegotiationScene>('mediation');
    const before = courtScene(progress(), court).jurors;
    const after = courtScene(progress({ flags: [chat] }), court).jurors;
    after.forEach((j, i) => expect(j.start).toBe(Math.min(100, before[i].start + 6)));

    expect(negoScene(progress(), nego)).toBe(nego);
    const n = negoScene(progress({ flags: [chat] }), nego);
    expect(n.confidence).toBe(nego.confidence + 10);
    expect(n.client.trust).toBe(nego.client.trust - 1);
  });

  it('effects 的旗標分支看得到，而且帶到下一集；場景內的旗標不帶', () => {
    ep2.effects = [
      {
        when: { flags: [chat] },
        jury: 0,
        confidence: 0,
        trust: 0,
        flags: ['memo-produced'],
      },
    ];
    const p = progress({
      scenes: { investigate: { flags: [chat] } as unknown as desk.DeskState },
    });
    expect(allFlags(p)).toContain('memo-produced');
    const next = carryOver(p, 'ep1');
    expect(next.flags).toContain('memo-produced');
    expect(next.flags).not.toContain(chat);
  });
});

describe('對方主導的錄取：missed 與 anchors', () => {
  const base = (): DepositionScene => ({
    ...scene<DepositionScene>('depo-engineer'),
    id: 'depo-x',
    script: [
      {
        id: 'p-always',
        q: '一直都是這樣嗎？',
        a: '從來沒有強制下線過。',
        objection: null,
        gives: [],
        anchors: 'trevor-sworn',
        missed: { gives: [], flags: [] },
      },
      {
        id: 'p-legal2',
        q: '律師怎麼說？',
        a: '法務說沒問題。',
        objection: '特權',
        gives: [],
        missed: { gives: ['memo'], flags: ['memo-leaked'] },
      },
    ],
  });

  it('答了就定錨；該擋沒擋（沒異議或理由錯）才給 missed', () => {
    const s = base();
    let st = depo.defend(s, depo.startDeposition(s), null);
    expect(st.anchored).toEqual(['trevor-sworn']);
    const wrong = depo.defend(s, st, '推測');
    expect(wrong.flags).toContain('memo-leaked');
    expect(wrong.gained).toContain('memo');
    expect(wrong.slipped).toEqual(['p-legal2']);
    st = depo.defend(s, st, null);
    expect(st.flags).toContain('memo-leaked');
    expect(st.slipped).toEqual(['p-legal2']);
  });

  it('異議對了，missed 不生效', () => {
    const s = base();
    let st = depo.defend(s, depo.startDeposition(s), null);
    st = depo.defend(s, st, '特權');
    expect(st.slipped).toEqual([]);
    expect(st.flags).not.toContain('memo-leaked');
    expect(st.gained).not.toContain('memo');
  });
});

describe('開示：exposes 與 waived', () => {
  const withMemo = (s: DeskScene): DeskScene => ({
    ...s,
    discovery: [
      {
        id: 'rq-memo-x',
        text: '法務意見書',
        cards: [s.cards[0].id],
        unlock: [],
        privilege: 'valid',
        waived: { flags: ['memo-leaked'] },
        overbroad: false,
        exposes: ['arg-e'],
        lines: {},
      },
    ],
  });

  it('特權被放棄的條件成立，valid 降成 weak', () => {
    patch<DeskScene>('investigate', withMemo);
    const s = scene<DeskScene>('investigate');
    expect(deskScene(progress(), s).discovery[0].privilege).toBe('valid');
    expect(deskScene(progress({ flags: ['memo-leaked'] }), s).discovery[0].privilege).toBe('weak');
  });

  it('交出的文件把它指向的論點標成已揭露', () => {
    patch<DeskScene>('investigate', withMemo);
    const s = scene<DeskScene>('investigate');
    const st = { ...desk.startDesk(s), discovery: { 'rq-memo-x': 'produced' as const } };
    expect(exposedArgs(progress({ scenes: { investigate: st } }))).toContain('arg-e');
    const kept = { ...st, discovery: { 'rq-memo-x': 'withheld' as const } };
    expect(exposedArgs(progress({ scenes: { investigate: kept } }))).not.toContain('arg-e');
  });
});

describe('書桌委託記旗標', () => {
  it('委託完成就有旗標', () => {
    const s = scene<DeskScene>('investigate');
    const sc: DeskScene = {
      ...s,
      jobs: [
        {
          id: 'job-errata',
          who: '羅根',
          label: '請崔佛更正錄取證詞',
          detail: '',
          cost: 1,
          needs: [],
          report: [{ who: '羅根', text: '好。', mood: '平', thought: false }],
          gives: [],
          flags: ['trevor-corrected'],
        },
      ],
    };
    const st = desk.commission(sc, desk.startDesk(sc), 'job-errata');
    expect(st.flags).toContain('trevor-corrected');
  });
});

describe('辯方證人：when、ethicsIf、cross', () => {
  const id = 'defense-trevor';
  const tune = (s: DefenseScene): DefenseScene => ({
    ...s,
    prep: {
      ...s.prep,
      options: s.prep.options.map((o) =>
        o.coached ? { ...o, when: { notFlags: ['trevor-corrected'] } } : o,
      ),
    },
    questions: s.questions.map((q) =>
      q.id === 'tq-always'
        ? {
            ...q,
            needs: [],
            when: { notFlags: ['trevor-corrected'] },
            ethicsIf: { has: ['arg-g'], ethics: ['offered-perjury'] },
          }
        : q,
    ),
    cross: [
      {
        when: { flags: ['discovery:rq-chat:produced'] },
        q: '這句是您說的？',
        a: '是。',
        penalty: 8,
      },
    ],
  });

  it('條件不符的題目與追加反詰問拿掉', () => {
    patch<DefenseScene>(id, tune);
    const s = scene<DefenseScene>(id);
    expect(witnessScene(progress(), s).questions.some((q) => q.id === 'tq-always')).toBe(true);
    expect(witnessScene(progress(), s).cross).toEqual([]);
    const fixed = witnessScene(
      progress({ flags: ['trevor-corrected', 'discovery:rq-chat:produced'] }),
      s,
    );
    expect(fixed.questions.some((q) => q.id === 'tq-always')).toBe(false);
    expect(fixed.prep.options.some((o) => o.coached)).toBe(false);
    expect(witnessScene(progress(), s).prep.options.some((o) => o.coached)).toBe(true);
    expect(fixed.cross).toHaveLength(1);
  });

  it('反詰問追加的題往有責移 penalty', () => {
    const s = { ...tune(scene<DefenseScene>(id)), questions: [] as DefenseScene['questions'] };
    const rules = { jurors: scene<TrialScene>('court-marisol').jurors, threshold: 50 };
    const jury = Object.fromEntries(rules.jurors.map((j) => [j.id, 40]));
    const st = { ...defense.startDefense(jury), stage: 'direct' as const, prep: 'trevor-honest' };
    const done = defense.finish(s, st, rules);
    expect(done.log.map((l) => l.text)).toContain('這句是您說的？');
    for (const j of rules.jurors) expect(done.jury[j.id]).toBe(48);
  });

  it('手上有論點還問了那一題，記一筆倫理；沒有就不記，也不重複記', () => {
    patch<DefenseScene>(id, tune);
    const s = scene<DefenseScene>(id);
    const g = useEpisode.getState();
    const jury = Object.fromEntries(
      scene<TrialScene>('court-marisol').jurors.map((j) => [j.id, 50]),
    );
    const begin = (cards: string[]) =>
      useEpisode.setState({
        progress: progress({
          scene: at(id),
          cards,
          scenes: {
            'court-marisol': { jury } as never,
            [id]: { ...defense.startDefense(jury), stage: 'direct', prep: s.prep.options[0].id },
          },
        }),
      });
    begin([]);
    g.askWitness('tq-always');
    expect(useEpisode.getState().progress.ethics).toEqual([]);

    begin(['arg-g']);
    g.askWitness('tq-always');
    g.askWitness('tq-always');
    expect(useEpisode.getState().progress.ethics).toEqual(['offered-perjury']);
  });
});
