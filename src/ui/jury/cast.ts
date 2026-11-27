import data from './cast.json';
import type { JurorLook } from './silhouette';

/**
 * 說話者的剪影替身（設定集第 7.6 章）：法庭內外同一張（設計師 #446，11-27：檔案照模板 B 退役）。
 * 名字對到 cast.json 的 id；同一個人在劇本裡有短名、全名、職稱三種寫法。
 * 盧卡斯不在這裡：他有定案立繪。劇本裡每個說話者要嘛在這張表，要嘛在 NO_FACE（cast.test.ts 會擋）。
 */
export const ID: Record<string, string> = {
  瑞秋: 'rachel',
  '瑞秋・艾德勒': 'rachel',
  伊森: 'ethan',
  '伊森・蕭': 'ethan',
  '馬庫斯・海爾': 'marcus',
  海爾: 'marcus',
  '維多莉亞・惠特洛克': 'victoria',
  羅根: 'logan',
  '羅根・普萊斯': 'logan',
  普萊斯: 'logan',
  蘿莎: 'rosa',
  戴文: 'devon',
  莫羅: 'catherine',
  '凱瑟琳・莫羅': 'catherine',
  莫羅檢察官: 'catherine',
  法官: 'augustus',
  雷耶斯法官: 'augustus',
  蘇菲: 'sophie',
  '蘇菲・馬丁內斯': 'sophie',
  柯瓦斯基: 'ray',
  '艾倫・布魯克斯': 'ellen',
  '普莉亞・奈爾': 'priya',
  奧瑪: 'omar',
  '奧瑪・哈桑': 'omar',
  // 設計師 #446：她的戲大多是傳訊息，夜裡的光來自手機（screen；鈉燈的橘邊會在淺色桌面上跟黃色按鈕搶，審查 #460）。
  潔德: 'jade',
  '潔德・坎農': 'jade',
  '亞瑟・卡爾德': 'arthur',
  '崔佛・米爾斯': 'trevor',
  '丹尼爾・奧卡福': 'okafor',
  '瑪莉索・維加': 'marisol',
  '喬安娜・費雪醫師': 'fisher',
  '麥可・唐醫師': 'tang',
  // 設計師 #460：第二集取證的證人（S5 奧卡福會議室，白天陰天的窗光）。
  '艾瑪・徐': 'emma',
};

/**
 * 沒有外型、不畫頭像的說話者（設計師 #446 第 3 點）：只寫名字那一行，不留空框。
 * 電話那頭、錄音、App、系統本來就看不到臉，這是刻意的，不是缺圖。
 */
export const NO_FACE = new Set([
  '旁白',
  '語音',
  '法院系統',
  '卡爾德快遞',
  '赫克托',
  '父親',
  '林肯・高',
  // 第 1 集瑞秋取證時對方的律師（schema 的 examiner 預設值，在取證筆錄裡提異議）：沒有名字、沒有外型。
  '對造律師',
]);

const LOOKS = new Map<string, JurorLook>(
  [...data.main, ...data.secondary].map((l) => [l.id, l as JurorLook]),
);

export function castLook(who: string): JurorLook | undefined {
  const id = ID[who];
  return id ? LOOKS.get(id) : undefined;
}
