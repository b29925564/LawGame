import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import type { Relation } from '../schema';
import * as desk from './desk';
import * as interview from './interview';
import type { DeskScene, InterviewScene, TrialScene } from './schema';
import * as trial from './trial';

const scene = <T>(id: string) => episodes.ep1.scenes.find((s) => s.id === id) as T;
const meet = scene<InterviewScene>('meet-ethan');
const investigate = scene<DeskScene>('investigate');
const court = scene<TrialScene>('court-kowalski');
const rachel = scene<TrialScene>('court-rachel');

/** 連線區：兩張卡加一種關係。 */
const linkUp = (st: desk.DeskState, cards: string[], r: Relation) => {
  for (const c of cards) st = desk.toggleLinkCard(st, c);
  return desk.connect(investigate, desk.setLinkRelation(st, r));
};

describe('訪談', () => {
  it('話題問過就不再出現，卡片要湊齊才解鎖新話題', () => {
    let st = interview.startInterview(meet);
    expect(interview.openTopics(meet, st, []).map((t) => t.id)).not.toContain('t-report');
    st = interview.ask(meet, st, 't-friday');
    const open = interview.openTopics(meet, st, []).map((t) => t.id);
    expect(open).toContain('t-report');
    expect(open).not.toContain('t-friday');
    expect(st.gained).toContain('ethan-accused');
  });

  it('關鍵話題問完才能結束訪談', () => {
    let st = interview.startInterview(meet);
    expect(interview.canFinish(meet, st)).toBe(false);
    for (const t of meet.topics.filter((t) => t.key)) st = interview.ask(meet, st, t.id);
    expect(interview.canFinish(meet, st)).toBe(true);
  });

  it('施壓沒有卡片撐著只會讓他關上嘴；戒心滿了訪談就結束', () => {
    let st = interview.startInterview(meet);
    st = interview.press(meet, st, 'p-trophy', []);
    expect(st.gained).not.toContain('ethan-trophy');
    expect(st.guard).toBe(4);
    st = interview.calm(meet, st);
    expect(st.guard).toBe(3);
    const s2 = interview.press(meet, { ...st, pressed: [] }, 'p-trophy', ['ethan-flee']);
    expect(s2.gained).toContain('ethan-trophy');
    expect(s2.over).toBe(true);
    expect(interview.ask(meet, s2, 't-ride')).toBe(s2);
  });
});

describe('訪談安撫', () => {
  it('安撫整場只有固定次數，用完就沒有效果', () => {
    let st = interview.startInterview(meet);
    st = { ...st, guard: 4 };
    for (let i = 0; i < meet.calms; i++) st = interview.calm(meet, st);
    expect(st.guard).toBe(4 - meet.calms);
    const after = interview.calm(meet, st);
    expect(after).toBe(st);
  });
});

describe('桌面調查', () => {
  const play = () => {
    let st = desk.startDesk(investigate);
    st = desk.mark(investigate, st, 'watch-listed');
    return st;
  };

  it('標記關鍵句子才生成卡片，點別的句子沒有懲罰', () => {
    const st = desk.mark(investigate, play(), 'not-a-card');
    expect(desk.heldCards(investigate, st)).toContain('watch-listed');
    expect(st.hours).toBe(investigate.hours);
  });

  it('沒有前提的時候，每個委託都下不了', () => {
    const st = play();
    for (const j of investigate.jobs) {
      expect(j.needs.length).toBeGreaterThan(0);
      expect(desk.canCommission(investigate, st, j.id)).toBe(false);
    }
  });

  it('委託要先有前提卡片，花掉的工時會扣', () => {
    let st = play();
    expect(desk.canCommission(investigate, st, 'job-watch')).toBe(false);
    st = desk.commission(investigate, st, 'job-watch', ['ethan-message']);
    expect(st.hours).toBe(22);
    expect(desk.heldCards(investigate, st)).toContain('watch-notice');
  });

  it('連線對了不花工時，連錯扣 1 工時', () => {
    let st = desk.commission(investigate, play(), 'job-watch', ['ethan-message']);
    st = desk.commission(investigate, st, 'job-ride', ['ethan-ride']);
    const hours = st.hours;
    st = desk.toggleLinkCard(st, 'watch-notice');
    st = desk.toggleLinkCard(st, 'ride-receipt');
    st = desk.setLinkRelation(st, '矛盾');
    st = desk.connect(investigate, st);
    expect(st.found).toEqual([]);
    expect(st.hours).toBe(hours - 1);
    st = desk.setLinkRelation(st, '支持');
    st = desk.connect(investigate, st);
    expect(st.found).toEqual(['l-called']);
    expect(st.hours).toBe(hours - 1);
    expect(st.link.cards).toEqual([]);
  });

  it('疑問要拿發現回答，全對才確認，錯了照樣扣工時而且不說哪裡錯', () => {
    let st = desk.commission(investigate, play(), 'job-watch', ['ethan-message']);
    st = desk.commission(investigate, st, 'job-ride', ['ethan-ride']);
    st = desk.mark(investigate, st, 'watch-photo');
    st = desk.commission(investigate, st, 'job-sophie', []);
    st = linkUp(st, ['watch-notice', 'ride-receipt'], '支持');
    st = linkUp(st, ['watch-photo', 'sophie-health-app'], '支持');
    st = desk.toggleCard(investigate, st, 'q1', 'l-watch');
    st = desk.submit(investigate, st, 'q1');
    expect(st.confirmed).toEqual([]);
    expect(st.wrong).toBe(1);
    expect(st.feedback.q1).not.toContain('l-');
    // 同樣的組合不能再交一次（設計稿 board-redesign：試過的組合提交鈕變灰）。
    expect(desk.misses(st, 'q1')).toBe(1);
    expect(desk.triedBefore(st, 'q1')).toBe(true);
    expect(desk.canSubmit(investigate, st, 'q1')).toBe(false);

    // 格子滿了直接挑另一張就換掉，不必先取消（玩家回報：選了就換不掉）。
    st = desk.toggleCard(investigate, st, 'q1', 'l-called');
    expect(st.attempts.q1.cards).toEqual(['l-called']);
    st = desk.submit(investigate, st, 'q1');
    expect(st.confirmed).toContain('q1');
    // 過關的推理鏈確認之後才收得了工，但要玩家自己按，剩下的工時還能繼續查。
    expect(desk.canWrap(investigate, st)).toBe(true);
    expect(desk.done(investigate, st)).toBe(false);
    expect(desk.done(investigate, desk.wrap(st))).toBe(true);
    expect(desk.heldCards(investigate, st)).toContain('arg-a');
  });

  it('花掉工時之後檢方的補充開示才寄到', () => {
    let st = play();
    expect(st.mail).not.toContain('mail-blood');
    st = desk.commission(investigate, st, 'job-ride', ['ethan-ride']);
    st = desk.commission(investigate, st, 'job-watch', ['ethan-message']);
    expect(st.mail).toContain('mail-blood');
  });

  it('工時用完就進下一幕', () => {
    const st = { ...desk.startDesk(investigate), hours: 0 };
    expect(desk.done(investigate, st)).toBe(true);
  });
});

describe('審前動議', () => {
  /** 走到 q1 確認為止，手上就有 arg-a 與 arg-watch，才提得出兩件動議。 */
  const solved = () => {
    let st = desk.startDesk(investigate);
    st = desk.mark(investigate, st, 'watch-listed');
    st = desk.mark(investigate, st, 'autopsy');
    st = desk.mark(investigate, st, 'watch-photo');
    st = desk.commission(investigate, st, 'job-watch', ['ethan-message']);
    st = desk.commission(investigate, st, 'job-ride', ['ethan-ride']);
    st = linkUp(st, ['watch-notice', 'ride-receipt'], '支持');
    st = desk.toggleCard(investigate, st, 'q1', 'l-called');
    st = desk.submit(investigate, st, 'q1');
    // 手錶相關性的推理鏈，解鎖傳票動議。
    st = desk.commission(investigate, st, 'job-sophie', []);
    st = linkUp(st, ['watch-photo', 'sophie-health-app'], '支持');
    st = desk.toggleCard(investigate, st, 'q2a', 'l-watch');
    return desk.submit(investigate, st, 'q2a');
  };
  const fill = (
    st: desk.DeskState,
    id: string,
    basis: string,
    request: string,
    cards: string[],
  ) => {
    let next = desk.pickBasis(st, id, basis);
    next = desk.pickRequest(next, id, request);
    for (const c of cards) next = desk.toggleSupport(investigate, next, id, c);
    return next;
  };

  it('三樣都對才核准，依據錯了駁回並記下旗標', () => {
    const base = solved();
    const wrong = desk.file(
      investigate,
      fill(base, 'm-watch', '傳聞例外', '核發傳票給手錶廠商', ['arg-watch']),
      'm-watch',
    );
    expect(desk.motionAttempt(wrong, 'm-watch').ruling).toBe('denied');
    expect(wrong.flags).toContain('motion-denied');
    expect(desk.heldCards(investigate, wrong)).not.toContain('heart-rate');

    const right = desk.file(
      investigate,
      fill(base, 'm-watch', '相關性', '核發傳票給手錶廠商', ['arg-watch']),
      'm-watch',
    );
    expect(desk.motionAttempt(right, 'm-watch').ruling).toBe('granted');
    expect(desk.heldCards(investigate, right)).toContain('heart-rate');
    expect(right.hours).toBe(base.hours - 2);
  });

  it('駁回之後可以修正重送：工時再扣一次，駁回旗標留著', () => {
    const wrong = desk.file(
      investigate,
      fill(solved(), 'm-watch', '傳聞例外', '核發傳票給手錶廠商', ['arg-watch']),
      'm-watch',
    );
    const fixed = desk.pickBasis(wrong, 'm-watch', '相關性');
    expect(desk.canFile(investigate, fixed, 'm-watch')).toBe(true);
    const again = desk.file(investigate, fixed, 'm-watch');
    expect(desk.motionAttempt(again, 'm-watch').ruling).toBe('granted');
    expect(desk.heldCards(investigate, again)).toContain('heart-rate');
    expect(again.hours).toBe(wrong.hours - 2);
    expect(again.flags).toContain('motion-denied');
    expect(desk.canFile(investigate, again, 'm-watch')).toBe(false);
  });

  it('沒有論點撐著就提不出來，工時也不會扣', () => {
    const st = desk.startDesk(investigate);
    const tried = fill(st, 'm-watch', '相關性', '核發傳票給手錶廠商', ['arg-watch']);
    expect(desk.canFile(investigate, tried, 'm-watch')).toBe(false);
    expect(desk.file(investigate, tried, 'm-watch')).toBe(tried);
  });

  it('核准之後對方聲請撤銷：撤回拿不到紀錄，出庭答辯才拿得到', () => {
    const base = fill(solved(), 'm-chat', '相關性', '核發傳票給卡爾德物流', ['arg-a']);
    const granted = desk.file(investigate, base, 'm-chat');
    expect(desk.pendingTwist(investigate, granted)?.id).toBe('m-chat');
    expect(desk.heldCards(investigate, granted)).not.toContain('chat-audit');

    const back = desk.resolveTwist(investigate, granted, 'm-chat', 0);
    expect(back.flags).toContain('chat-audit-lost');
    expect(desk.heldCards(investigate, back)).not.toContain('chat-audit');
    expect(desk.pendingTwist(investigate, back)).toBeUndefined();

    const fight = desk.resolveTwist(investigate, granted, 'm-chat', 1);
    expect(fight.flags).toContain('whitlock-down');
    expect(desk.heldCards(investigate, fight)).toContain('chat-audit');
    // 決定過就不能反悔。
    expect(desk.resolveTwist(investigate, fight, 'm-chat', 0)).toBe(fight);
  });
});

describe('時間線', () => {
  it('順序是玩家放上去的順序，不會自動照時間排', () => {
    let st = desk.startDesk(investigate);
    st = desk.toggleTimeline(st, 'access-partial');
    st = desk.toggleTimeline(st, 'ride-receipt');
    expect(st.timeline).toEqual(['access-partial', 'ride-receipt']);
    st = desk.moveTimeline(st, 'ride-receipt', -1);
    expect(st.timeline).toEqual(['ride-receipt', 'access-partial']);
    expect(desk.moveTimeline(st, 'ride-receipt', -1).timeline).toEqual(st.timeline);
    st = desk.toggleTimeline(st, 'ride-receipt');
    expect(st.timeline).toEqual(['access-partial']);
  });
});

describe('庭審', () => {
  const guiltyLean = (st: trial.TrialState) =>
    Object.values(st.jury).reduce((a, b) => a + b, 0) / 12;

  it('異議理由對了證詞被刪除，理由錯了扣法官耐心', () => {
    let st = trial.startTrial(court);
    const before = guiltyLean(st);
    st = trial.nextQuestion(court, st);
    st = trial.letPass(court, st);
    expect(guiltyLean(st)).toBeGreaterThan(before);

    st = trial.nextQuestion(court, st);
    const mid = guiltyLean(st);
    st = trial.object(court, st, '誘導');
    expect(st.struck).toBe(1);
    expect(guiltyLean(st)).toBe(mid);
    expect(st.patience).toBe(court.patience);

    st = trial.nextQuestion(court, st);
    st = trial.object(court, st, '無關');
    expect(st.patience).toBe(court.patience - 1);
  });

  it('法官耐心歸零＝公開訓斥，詰問結束', () => {
    let st = trial.startTrial(court);
    for (let i = 0; i < 5 && st.stage === 'direct'; i++) {
      st = trial.nextQuestion(court, st);
      st = trial.object(court, st, '已問已答');
    }
    expect(st.rebuked).toBe(true);
    expect(st.stage).toBe('done');
  });

  it('三步驟：沒鋪陳被擋下，鎖得死才是彈劾成功', () => {
    const claim = court.witness.claims[0];
    let st = trial.toCross(court, trial.startTrial(court));
    st = trial.lock(court, st, claim.id, 'strong');
    const blocked = trial.confront(court, st, claim.id, 15, ['邏輯']);
    expect(blocked.patience).toBe(court.patience - 1);
    expect(blocked.impeachments).toBe(0);

    st = trial.setup(court, st, claim.id);
    const before = guiltyLean(st);
    st = trial.confront(court, st, claim.id, 15, ['邏輯']);
    expect(st.impeachments).toBe(1);
    expect(guiltyLean(st)).toBeLessThan(before);
  });

  it('鎖得含糊，證人圓得過去，衝擊減半', () => {
    const claim = court.witness.claims[0];
    let weak = trial.toCross(court, trial.startTrial(court));
    weak = trial.setup(court, weak, claim.id);
    weak = trial.lock(court, weak, claim.id, 'weak');
    const start = guiltyLean(weak);
    weak = trial.confront(court, weak, claim.id, 15, ['邏輯']);
    expect(weak.impeachments).toBe(0);

    let strong = trial.toCross(court, trial.startTrial(court));
    strong = trial.setup(court, strong, claim.id);
    strong = trial.lock(court, strong, claim.id, 'strong');
    strong = trial.confront(court, strong, claim.id, 15, ['邏輯']);
    expect(start - guiltyLean(weak)).toBeLessThan(start - guiltyLean(strong));
  });

  it('重複問同一個問題＝糾纏，法官耐心 −1', () => {
    let st = trial.toCross(court, trial.startTrial(court));
    st = trial.badger(court, st, 0);
    expect(st.patience).toBe(court.patience);
    st = trial.badger(court, st, 0);
    expect(st.patience).toBe(court.patience - 1);
  });
});

describe('瑞秋的詰問', () => {
  const claim = (id: string) => rachel.witness.claims.find((c) => c.id === id)!;
  const lean = (st: trial.TrialState) => Object.values(st.jury).reduce((a, b) => a + b, 0) / 12;

  it('錄取時已經定錨的說法，開庭就不必再鎖一次', () => {
    const cold = trial.startTrial(rachel);
    expect(cold.claims['rc-2250'].lock).toBe('none');
    const anchored = trial.startTrial(rachel, ['rachel-2250', 'rachel-meeting']);
    expect(anchored.claims['rc-2250'].lock).toBe('strong');
    expect(anchored.claims['rc-meeting'].lock).toBe('strong');
    // 沒有定錨的那一條還是要自己鎖。
    expect(anchored.claims['rc-31f'].lock).toBe('none');
  });

  const ready = (id: string, anchored: string[] = []) => {
    let st = trial.toCross(rachel, trial.startTrial(rachel, anchored));
    if (st.claims[id].lock === 'none') st = trial.lock(rachel, st, id, 'strong');
    return trial.setup(rachel, st, id);
  };

  it('洩漏過的論點，檢方備好反擊；破解得了才算彈劾成功', () => {
    const c = claim('rc-2250');
    const st = ready('rc-2250');
    const before = lean(st);

    const failed = trial.confront(rachel, st, c.id, 25, ['邏輯'], {
      id: 'arg-b',
      exposed: true,
      cards: [],
    });
    expect(failed.impeachments).toBe(0);
    expect(failed.log.some((l) => l.text.includes('手錶在搏鬥中可能脫落'))).toBe(true);

    const broken = trial.confront(rachel, st, c.id, 25, ['邏輯'], {
      id: 'arg-b',
      exposed: true,
      cards: ['watch-photo'],
    });
    expect(broken.impeachments).toBe(1);
    expect(before - lean(broken)).toBeGreaterThan(before - lean(failed));
  });

  it('沒洩漏過就沒有反擊這一關', () => {
    const st = trial.confront(rachel, ready('rc-2250'), 'rc-2250', 25, ['邏輯'], { id: 'arg-b' });
    expect(st.impeachments).toBe(1);
    expect(st.log.some((l) => l.text.includes('異議'))).toBe(false);
  });

  it('彈劾兩次之後出示論點 D，她當庭援引緘默權，詰問結束', () => {
    let st = ready('rc-2250', ['rachel-2250', 'rachel-meeting']);
    st = trial.confront(rachel, st, 'rc-2250', 25, ['邏輯'], { id: 'arg-b' });
    st = trial.setup(rachel, st, 'rc-meeting');
    st = trial.confront(rachel, st, 'rc-meeting', 15, ['邏輯'], { id: 'arg-c' });
    expect(st.impeachments).toBe(2);
    expect(st.stage).toBe('cross');

    st = trial.lock(rachel, st, 'rc-31f', 'strong');
    st = trial.setup(rachel, st, 'rc-31f');
    st = trial.confront(rachel, st, 'rc-31f', 20, ['邏輯', '程序'], { id: 'arg-d' });
    expect(st.log.some((l) => l.text.includes('自證己罪'))).toBe(true);
    expect(st.stage).toBe('done');
  });

  it('只彈劾一次就出示論點 D，她不會崩，詰問繼續', () => {
    let st = ready('rc-31f');
    st = trial.confront(rachel, st, 'rc-31f', 20, ['邏輯', '程序'], { id: 'arg-d' });
    expect(st.impeachments).toBe(1);
    expect(st.stage).toBe('cross');
    expect(st.log.some((l) => l.text.includes('自證己罪'))).toBe(false);
  });
});

describe('疑問 4：那則訊息是不是沃斯本人傳的', () => {
  it('發現或論點 B 都答得過，其他論點不行', () => {
    const q = investigate.questions.find((x) => x.id === 'q3')!;
    expect(desk.fits(q.answer, q.accept, ['l-dead-sender'])).toBe(true);
    expect(desk.fits(q.answer, q.accept, ['arg-b'])).toBe(true);
    expect(desk.fits(q.answer, q.accept, ['arg-a'])).toBe(false);
  });
});

describe('委託的前提', () => {
  it('沒有相關卡片就不能委託，有了才行', () => {
    const st = desk.startDesk(investigate);
    expect(desk.canCommission(investigate, st, 'job-sophie')).toBe(false);
    expect(desk.canCommission(investigate, st, 'job-rosa')).toBe(false);
    const marked = desk.mark(investigate, desk.mark(investigate, st, 'watch-photo'), 'access-full');
    expect(desk.canCommission(investigate, marked, 'job-sophie')).toBe(true);
    expect(desk.canCommission(investigate, marked, 'job-rosa')).toBe(true);
  });
});
