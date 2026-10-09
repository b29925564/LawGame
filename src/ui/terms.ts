import { episodeOf, useEpisode } from '../engine/game';
import { termsOf, type Burden } from '../engine/jury';

/** 介面上依案件類型換的字：民事沒有檢方、認罪協商，案號也不同。 */
const UI = {
  criminal: {
    other: '檢方',
    deal: '認罪協商成立',
    caseNo: 'No. 26-CR-0417',
    parties: '卡爾德州　訴　伊森・蕭',
    plaintiff: '卡爾德州',
    defendant: '伊森・蕭',
  },
  civil: {
    other: '原告律師',
    deal: '和解成立',
    caseNo: 'No. 26-CV-1182',
    parties: '維加　訴　卡爾德物流',
    plaintiff: '維加',
    defendant: '卡爾德物流',
  },
} as const;

/** 這一集是刑事還是民事：看劇本裡有標 burden 的場景。 */
export function burdenOf(scenes: readonly { burden?: Burden }[]): Burden {
  return scenes.find((s) => s.burden)?.burden ?? 'criminal';
}

export function useCaseTerms() {
  const progress = useEpisode((s) => s.progress);
  const burden = burdenOf(episodeOf(progress).scenes as { burden?: Burden }[]);
  return { burden, ...termsOf({ burden }), ...UI[burden] };
}
