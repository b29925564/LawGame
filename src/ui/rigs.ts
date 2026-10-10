import rigData from '../content/rigs.yaml';

/**
 * 場記右欄讀燈組（設定集 11.3：「第二日 14:10 4800K」直接讀 rigs/court-d2-pm.yaml，不手打）。
 * 燈組資料在 src/content/rigs.yaml。
 */
export type Rig = { label: string; time: string; kelvin: number };

export const RIGS = rigData as Record<string, Rig>;

/** 法庭裡（第 N 法庭；不含走廊、調解室、台階、量刑庭）依開庭日選燈組。量刑庭不是庭審日，讀地點自帶的日子時刻。地點用中文原文判斷。 */
export function rigOf(place: string, day?: string): Rig | null {
  if (!/第.法庭/.test(place) || /外|走廊/.test(place)) return null;
  if (day && /第二|Two/.test(day)) return RIGS['court-d2-pm'];
  if (day && /第三|Three/.test(day)) return RIGS['court-d3-ov'];
  return RIGS['court-d1-am'];
}

/**
 * 法庭以外的地點色溫，照第 5 章的場景光表與設計師 P4-8 光表裁定（色溫只表示時間與地盤）：
 * 大廳晨光 5600K；海爾辦公室窗光 5600K、入夜桌燈 2700K；惠特洛克辦公室上午日光 5600K（工作單 3.5、日照表）、
 * 黃昏夕照 3200K、入夜桌燈 2700K；
 * 四十二樓是惠特洛克辦公室的夜景，桌燈 2700K。
 * 事務所會議室：B（錄取）柔光框 5000K；C 上午側面天光 5600K；A 下午主光是頂上的燈管 4100K（沒寫字母的就是 A；
 * 設計師 S1 會議室審查第一版，取代原本照窗光算的 4800K）。三間值不同是主光不同，不是改色溫表情緒。
 * 奧卡福事務所會議室天光 4800K；法院調解室陰天高窗 6500K；法院台階照太陽，上午 5600K、16 點後低太陽 3600K。
 * 走廊與影印室是燈管 4100K，下班後也一樣（影印室沒有窗）；看守所螢光 4100K；檢察署窗光 7000K；
 * 碼頭九號鈉燈 1800K；港邊夜 6500K；盧卡斯的桌面照工時的光層：白天窗光 6500K、傍晚 3200K、入夜檯燈 2700K。
 * 法院和其他機構是燈管 4100K。
 */
export function kelvinOf(place: string) {
  const hour = Number(/(\d{1,2}):\d{2}/.exec(place)?.[1] ?? 12);
  const night = /深夜|晚上/.test(place) || hour >= 19 || hour < 6;
  if (/大廳/.test(place)) return 5600;
  if (/碼頭/.test(place)) return 1800;
  if (/港/.test(place)) return 6500;
  if (/看守所/.test(place)) return 4100;
  if (/檢察/.test(place)) return 7000;
  if (/台階/.test(place)) return hour >= 16 ? 3600 : 5600;
  if (/走廊|影印室/.test(place)) return 4100;
  if (/調解室/.test(place)) return 6500;
  if (/法院|法庭/.test(place)) return 4100;
  if (/四十二樓/.test(place)) return 2700;
  if (/海爾的辦公室/.test(place)) return night ? 2700 : 5600;
  if (/惠特洛克的辦公室/.test(place)) return night ? 2700 : hour >= 17 ? 3200 : 5600;
  if (/奧卡福/.test(place)) return 4800;
  if (/會議室 ?B/.test(place)) return 5000;
  if (/會議室 ?C/.test(place)) return 5600;
  if (/會議室/.test(place)) return night ? 2700 : hour >= 12 ? 4100 : 5600;
  if (/盧卡斯/.test(place)) return night ? 2700 : hour >= 17 ? 3200 : 6500;
  return night ? 2700 : 4100;
}
