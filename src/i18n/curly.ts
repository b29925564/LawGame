/**
 * 英文的引號（視覺設計師 #262 審查）：原始檔一律是直引號（' "），好寫、好檢查（enStyle.test.ts 擋彎引號）；
 * 顯示時在比例字體上換成彎引號（’ ‘ “ ”）。等寬字體（筆錄的 Courier Prime、場記的 JetBrains Mono、Bates）
 * 是打字稿，本來就是直引號，那些地方用 straight() 換回去。
 */
const OPENS = /[\s([{—–‘“/|｜]/;

/** 直引號 → 彎引號。開引號：行首、空白或開括號之後；其餘（詞中的撇號、句尾）是閉引號。 */
export function curly(s: string): string {
  if (!/['"]/.test(s)) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '"' && ch !== "'") {
      out += ch;
      continue;
    }
    const prev = i ? s[i - 1] : '';
    // 「…」後面緊接字母的是開引號（……"Two more runs."）；句尾標點後面的是閉引號。
    const opening =
      !prev || OPENS.test(prev) || (!/[\w.,!?;:)\]]/.test(prev) && /\w/.test(s[i + 1] ?? ''));
    if (ch === '"') out += opening ? '“' : '”';
    // ’90s 這種省略的撇號：後面接數字時是撇號，不是開引號。
    else out += opening && !/\d/.test(s[i + 1] ?? '') ? '‘' : '’';
  }
  return out;
}

/** 彎引號 → 直引號：等寬字體（打字稿）用。 */
export function straight(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}
