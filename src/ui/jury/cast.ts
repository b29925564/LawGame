import data from './cast.json';
import type { JurorLook } from './silhouette';

/**
 * 法庭上的說話者用剪影替身（設定集第 7.6 章；使用者 10-09：配角在桌上是檔案照、在法庭是剪影）。
 * 名字對到 cast.json 的 id；同一個人在劇本裡有短名、全名、職稱三種寫法。
 * 盧卡斯不在這裡：他有定案立繪。對不到的（系統語音、法院系統）不畫頭像。
 */
const ID: Record<string, string> = {
  瑞秋: 'rachel',
  '瑞秋・艾德勒': 'rachel',
  伊森: 'ethan',
  '伊森・蕭': 'ethan',
  '馬庫斯・海爾': 'marcus',
  海爾: 'marcus',
  '維多莉亞・惠特洛克': 'victoria',
  羅根: 'logan',
  '羅根・普萊斯': 'logan',
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
  '奧瑪・哈桑': 'omar',
  '亞瑟・卡爾德': 'arthur',
  '崔佛・米爾斯': 'trevor',
  '丹尼爾・奧卡福': 'okafor',
  '瑪莉索・維加': 'marisol',
  '艾瑪・徐': 'emma',
  '喬安娜・費雪醫師': 'fisher',
  '麥可・唐醫師': 'tang',
};

const LOOKS = new Map<string, JurorLook>(
  [...data.main, ...data.secondary].map((l) => [l.id, l as JurorLook]),
);

export function castLook(who: string): JurorLook | undefined {
  const id = ID[who];
  return id ? LOOKS.get(id) : undefined;
}
