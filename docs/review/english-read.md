# 英文在地化通讀報告（src/content/en）

審稿角度：美式英文母語編輯，具美國法庭／訴訟用語背景。範圍是 `src/content/en/` 全部 8 個檔案逐行讀過（engine、ep1、ep2、glossary、ui、ui-desk、ui-talk、ui-trial），需要時對照 `src/content/ep1.yaml`／`ep2.yaml` 中文原文，介面字串則對照 `src/ui/*.tsx` 的使用位置。行號一律以 origin/main（`803c563`）為準。

刻意保留、不列入的部分：

- 盧卡斯的 Chandler Bing 式反諷口吻（例："A little over half. Sounds like my GPA."、"How do you know where I work." 句號結尾的平板問句），沒有不合文法或刻薄的地方就不動。
- 口語庭審用 12 小時制（11:14 p.m.），文件／證物用 24 小時制。
- `｜` 是劇本的分行記號，不是錯字。

## 摘要

| 嚴重度 | 數量 |
| ------ | ---- |
| 必改   | 26   |
| 建議   | 65   |

整體品質很好：法庭語言大致道地（"Objection, hearsay." / "Sustained. The jury will disregard the question." / "I decline to answer on the grounds that it may incriminate me." / "Differences in the sample go to weight"），刑事與民事的舉證標準（beyond a reasonable doubt vs. preponderance / more likely than not）、liable vs. guilty、peremptory vs. for cause、Rule 30(e) errata、privilege log、summary judgment、Daubert 都用得正確。真正的問題集中在三類：

1. **跨檔重複 key 互相覆蓋**：英文對照表是把 8 個檔案合併成一張表，載入順序是檔名排序（engine → ep1 → ep2 → glossary → ui-desk → ui-talk → ui-trial → ui），同一個中文 key 在不同檔案給了不同英文時，**後載入的那一個會靜靜蓋掉前面的**。結果例如 ep1 的證據卡「宣誓陳述」實際顯示成 ui.yaml 的 "Affidavit"（法律上錯誤），起訴書卡片標題顯示成詞典用的 "Indictment / information"。
2. **單複數**：引擎沒有複數機制，`{n}` 為 1 時會出現 "Caught bluffing 1 times"、"Make 1 promises" 這類文法錯誤。
3. **同一名詞多種譯法**：主角姓氏 Grey／Gray、會議名稱 closing／closeout meeting、第二集片名 "The Price of Settlement"／"The Price of a Settlement"、攤牌 "Lay it out"／"showdown"。

另外一個修正 PR（`claude/english-typos`）只處理「必改」裡屬於拼字／標點／文法的項目，清單見文末「修正 PR 已處理」。

## 前十名

| #   | 位置                                                                            | 原文 → 建議                                                                                                                      | 嚴重度 | 理由                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ui.yaml:60（蓋掉 ep1.yaml:171、ep2.yaml:73）                                    | 宣誓陳述 "Affidavit" → 三處統一 "Sworn testimony"（或 "Sworn statement"）                                                        | 必改   | ui.yaml 最後載入，所以瑞秋／崔佛的錄取證詞卡全顯示成 Affidavit；affidavit 是書面宣誓書，錄取證詞不是，法律用語錯。                                                        |
| 2   | glossary.yaml:89（蓋掉 ep1.yaml:108）                                           | 起訴書 "Indictment / information"                                                                                                | 必改   | 詞典詞條名把第 1 集證據卡標題也改成 "Indictment / information"；卡片應是 "Indictment"，詞典詞條要改用不同 key 或場景前綴。                                                |
| 3   | ui-desk.yaml:153                                                                | 葛雷 "Gray" → "Grey"                                                                                                             | 必改   | 主角姓氏其他地方都是 Grey（ui-desk:204、ep1:59、ep2:29），借據簽名處拼成 Gray。                                                                                           |
| 4   | ep1.yaml:696                                                                    | "You'll regret this!" → "You'll be sorry!"                                                                                       | 必改   | 蘇菲「只聽到半句」（ep1:689）是劇情關鍵；完整句子在 ep1:95、236 是 "You'll be sorry when the audit report comes out."，英文的半句必須是同一句的前半，否則玩家看不出關聯。 |
| 5   | ui-trial.yaml:185                                                               | "Below: alternates" → "Below: rest of the pool"                                                                                  | 必改   | 美國的 alternate juror 是「入座旁聽、隨時遞補」的候補陪審員；這裡是沒輪到的候選人，用 alternates 是錯的術語。                                                             |
| 6   | ep1.yaml:176 vs 437、756                                                        | "Northgate closing meeting" vs "Northgate closeout meeting" → 統一 "closeout"                                                    | 必改   | 會議名稱是調閱出席紀錄的線索，卡片和證詞拼法不同，玩家會以為是兩場會議。                                                                                                  |
| 7   | ui.yaml:11 vs ep2.yaml:92、152                                                  | "The Price of Settlement" vs "The Price of a Settlement"                                                                         | 必改   | 第二集片名兩種寫法；同 key 時 ui.yaml 蓋掉 ep2，片頭字卡（ep2:152）又是另一種。建議統一 "The Price of Settlement"。                                                       |
| 8   | ui-talk.yaml:125 等（見 B2）                                                    | "Caught bluffing {n} times" → 需要單複數                                                                                         | 必改   | `{n}` 第一次出現就是 1，顯示 "Caught bluffing 1 times"；同類問題十餘處，需在 i18n 加複數支援。                                                                            |
| 9   | engine.yaml:23、25；ep1.yaml:88、122、338、340；ep2.yaml:51、77、78；ui.yaml:59 | 矛盾 Contradicts／Contradiction、縮小範圍 Narrows down／Narrows it down／Narrows、語音 Automated voice／Voice、物品 Item／Object | 必改   | 同 key 多譯互蓋：推理關係最後顯示成 "Supports / Narrows / Contradiction / Shows motive"，詞性混用；第 1 集看守所語音被蓋成 "Voice"；證物種類被蓋成 "Object"。             |
| 10  | ep1.yaml:536–537                                                                | "College student" + "Twenty-one, third-year law student." → "Twenty-one, college junior, pre-law."                               | 必改   | 美國法學院是研究所，21 歲不可能是 3L；職業欄又寫 College student，兩行自相矛盾。                                                                                          |

---

## A. 跨檔重複 key（後載入的蓋掉前面的）

載入順序：engine → ep1 → ep2 → glossary → ui-desk → ui-talk → ui-trial → ui。根本解法是同 key 只留一個英文，或用 `場景id::` 前綴把劇情用的卡片名與介面／詞典分開。

| 位置                                      | 原文                                                                               | 建議                                           | 嚴重度 | 理由                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| ui.yaml:60、ep1.yaml:171、ep2.yaml:73     | 宣誓陳述: "Affidavit" / "Sworn statement"                                          | 統一 "Sworn testimony"                         | 必改   | 見前十名 #1。實際生效的是 Affidavit。                                                                                  |
| glossary.yaml:89、ep1.yaml:108            | 起訴書: "Indictment / information" / "Indictment"                                  | 卡片用 "Indictment"；詞典詞條另給 key 或改譯名 | 必改   | 見前十名 #2。                                                                                                          |
| engine.yaml:23、ep1.yaml:340、ep2.yaml:78 | 矛盾: "Contradicts" / "Contradiction" / "Contradiction"                            | 統一 "Contradicts"                             | 必改   | 關係標籤其餘都是動詞（Supports、Shows motive、Shows opportunity），ep1／ep2 的名詞版蓋掉 engine 的動詞版，詞性不一致。 |
| engine.yaml:25、ep1.yaml:338、ep2.yaml:77 | 縮小範圍: "Narrows down" / "Narrows it down" / "Narrows"                           | 統一 "Narrows down"                            | 必改   | 三檔三種，生效的是 ep2 的 "Narrows"（不及物用法不完整）。                                                              |
| ep1.yaml:88、ep2.yaml:51                  | 語音: "Automated voice" / "Voice"                                                  | 統一 "Automated voice"                         | 必改   | ep2 蓋掉 ep1，看守所自動語音的說話者標籤變成 "Voice"。                                                                 |
| ep1.yaml:122、ui.yaml:59                  | 物品: "Item" / "Object"                                                            | 統一 "Item"（或 "Physical evidence"）          | 必改   | 證物種類標籤；"Object" 在法庭語境容易被讀成「異議」(object)。                                                          |
| ep2.yaml:92、ui.yaml:11                   | 和解的價格                                                                         | 見前十名 #7                                    | 必改   |                                                                                                                        |
| ep1.yaml:721、ui-trial.yaml:32            | 已定錨: "Locked in." / "Locked in"                                                 | 刪掉 ep1 的句點                                | 建議   | 生效的是無句點版本，ep1 那行等於無效。                                                                                 |
| ep1.yaml:304、ep2.yaml:209                | 戴文・艾許　助理: "Devon Ash, Paralegal" / "Devon Ash, paralegal"                  | 統一大小寫                                     | 建議   | 只差大小寫，ep2 蓋掉 ep1。                                                                                             |
| ep1.yaml:379、ep2.yaml:315                | 限制證人作證範圍: "Limit the witness's testimony" / "Limit the scope of testimony" | 統一一種                                       | 建議   | 聲請選項同 key 兩譯，第 1 集實際顯示第 2 集的版本。                                                                    |
| glossary.yaml:47、ui-trial.yaml:49        | 陪審團遴選: "Voir dire" / "Jury selection"                                         | 詞典詞條可寫 "Jury selection (voir dire)"      | 建議   | 詞典的 "Voir dire" 被介面版蓋掉，詞條名看不到這個術語。                                                                |
| glossary.yaml:52、ui-trial.yaml:51        | 無因迴避: "Peremptory challenge" / "Peremptory strike"                             | 兩者皆正確，擇一                               | 建議   | 詞典的 challenge 被蓋成 strike。                                                                                       |
| glossary.yaml:56、ui-trial.yaml:61        | 案件理論: "Theory of the case" / "Case theory"                                     | 擇一                                           | 建議   | 同上。                                                                                                                 |

## B. 拼字、標點、文法

### B1. 拼字與標點

| 位置                                                                                   | 原文                                                                       | 建議                                   | 嚴重度 | 理由                                                                                                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| ui-desk.yaml:153                                                                       | 葛雷: "Gray"                                                               | "Grey"                                 | 必改   | 主角姓氏拼錯。**已於修正 PR 修正。**                                                                                                 |
| ui-desk.yaml:165；ui-trial.yaml:7、17、19、20、23、38、63、90、103、128、137、141、179 | "You can’t undo this"、"Judge’s patience"、“{text}”…                       | 改用直引號 `'` `"`                     | 必改   | 其餘 7 個檔案全部用直引號，只有這 14 行用彎引號；ui-trial:141 甚至同一句混用（“{tone}” 加上 didn't）。**已於修正 PR 統一為直引號。** |
| ui-trial.yaml:7                                                                        | for “{lean}”, from 0 to 100                                                | for "{lean}," from 0 to 100            | 必改   | 美式標點：逗號、句號放在引號內。**已修。**                                                                                           |
| ep1.yaml:491                                                                           | only ever "not proven".                                                    | only ever "not proven."                | 必改   | 同上。**已修。**                                                                                                                     |
| ep1.yaml:551                                                                           | Even the doctors say "roughly".                                            | say "roughly."                         | 必改   | 同上。**已修。**                                                                                                                     |
| ep1.yaml:916                                                                           | listed only as "V.", status: unsent                                        | as "V.," status: unsent                | 必改   | 同上。**已修。**                                                                                                                     |
| ep2.yaml:16                                                                            | does it say 'we were wrong'.                                               | does it say "we were wrong."           | 必改   | 美式引文用雙引號，句號在內。**已修。**                                                                                               |
| glossary.yaml:10                                                                       | says "I heard so-and-so say…", you can                                     | says "I heard so-and-so say…," you can | 必改   | 美式標點。**已修。**                                                                                                                 |
| glossary.yaml:106                                                                      | must be "clear and convincing".                                            | "clear and convincing."                | 必改   | 美式標點。**已修。**                                                                                                                 |
| ui-trial.yaml:201                                                                      | The jury finds the defendant liable, and awards punitive damages.          | …liable and awards punitive damages.   | 必改   | 同一主詞的兩個述語之間不加逗號。**已修。**                                                                                           |
| ui-desk.yaml:138                                                                       | Calder County Superior Court — Order                                       | Calder County Superior Court—Order     | 建議   | 美式 em dash 通常不留空格（若是版面刻意留白可保留）。                                                                                |
| glossary.yaml:85                                                                       | Attorney–client privilege（en dash）                                       | Attorney-client privilege              | 建議   | ep2:224、239 用連字號；美國通行寫法也是 hyphen。                                                                                     |
| ep1.yaml:228、239、329 vs 432、735、740、850、ep2.yaml:173、188                        | "ten-thirty"、"Eight-thirty to ten-forty" vs "eleven thirty"、"ten thirty" | 統一不加連字號（"ten thirty"）         | 建議   | 同一種口語時間寫法兩種拼法。                                                                                                         |

### B2. 單複數（系統性）

引擎 `t()` 沒有複數規則，下列樣板在 `{n}`／`{a}`／`{k}` 為 1 時文法錯誤。建議在 `src/i18n` 加一個簡單的複數語法（例如 `{n|promise|promises}`），yaml 再改用。修正 PR 不動這些，因為只改 yaml 必須改寫句型，超出「只修錯字」的範圍。

| 位置                                    | 原文                                                                   | n=1 時顯示                                    | 嚴重度 |
| --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- | ------ |
| ui-talk.yaml:125                        | Caught bluffing {n} times                                              | Caught bluffing 1 times（第一次出現必定是 1） | 必改   |
| ui-trial.yaml:68                        | Make {n} promises                                                      | Make 1 promises                               | 必改   |
| ui-trial.yaml:90                        | {n} closing slots will stay empty                                      | 1 closing slots                               | 必改   |
| ui-trial.yaml:92                        | {n} promises from your opening went unkept                             | 1 promises … went                             | 必改   |
| ui-trial.yaml:97                        | You have only {n} confirmed arguments                                  | only 1 confirmed arguments                    | 必改   |
| ui-trial.yaml:186                       | {a} questions and {b} peremptory strikes left                          | 1 questions and 1 peremptory strikes          | 必改   |
| ui-trial.yaml:211、213                  | {a} jurors were already on your side／won over {k} more jurors         | 1 jurors were                                 | 必改   |
| ui-desk.yaml:39、57、161                | {n} more questions appear…／{n} wrong answers／Lucas marked {n} places | 1 more questions…                             | 必改   |
| ui-trial.yaml:96、123                   | Pick {n} arguments／Up to {n} promises                                 | 視 n 是否可能為 1                             | 建議   |
| ui-desk.yaml:176、177；ui-trial.yaml:16 | notch(es)、line(s)                                                     | 有複數支援後拿掉括號                          | 建議   |

（以上算一項系統性必改；表內逐行列出方便追蹤。）

### B3. 文法與語意

| 位置              | 原文                                                                        | 建議                                                                                              | 嚴重度 | 理由                                                     |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| ui-trial.yaml:151 | Cards you showed in negotiation get an answer ready; close on other points. | The other side has an answer ready for anything you showed in negotiation. Close on other points. | 必改   | 原句主詞變成「牌自己準備好答案」，語意錯。               |
| ep1.yaml:467      | When I get out I'd be…                                                      | By the time I get out I'll be…                                                                    | 建議   | 時態混用（get／would）；口語中斷句可接受，但順一點較好。 |
| ep2.yaml:692      | I wasn't asking whether you know.                                           | I'm not asking whether you know.                                                                  | 建議   | 回應對方剛說的 "I know."，現在式較自然。                 |
| ep2.yaml:693      | He said it steadier on the stand                                            | He said it more steadily on the stand                                                             | 建議   | 口語可接受，書面標準是副詞。                             |
| ep1.yaml:543      | Laid off by her last employer last year.                                    | Laid off by her previous employer last year.                                                      | 建議   | 兩個 last 連用讀起來拗口。                               |
| ep1.yaml:772      | I've said. Eleven thirty.                                                   | I told you. Eleven thirty.                                                                        | 建議   | "I've said." 不是道地的口語。                            |
| ui-trial.yaml:153 | Withholding in discovery hurts more than handing it over once it comes out. | Withholding something in discovery hurts more than producing it, once it comes out.               | 建議   | 句尾 once 子句的修飾對象不清楚。                         |
| ui-trial.yaml:96  | Pick {n} arguments. Your order is the order you deliver them.               | Pick {n} arguments. You'll deliver them in the order you pick them.                               | 建議   | "Your order is the order…" 不自然。                      |

## C. 美國法庭／法律用語

| 位置                             | 原文                                                           | 建議                                                               | 嚴重度 | 理由                                                                                                     |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| ui-trial.yaml:185                | Above: the {n} who sit · Below: alternates                     | Above: the {n} who sit · Below: rest of the pool                   | 必改   | 見前十名 #5。                                                                                            |
| ep1.yaml:536–537                 | College student／Twenty-one, third-year law student.           | College student／Twenty-one, college junior, pre-law.              | 必改   | 見前十名 #10。                                                                                           |
| ep1.yaml:491                     | Ethan is only ever "not proven."                               | Ethan is only ever "not guilty," never innocent.                   | 建議   | "Not proven" 是蘇格蘭的判決類別，美國沒有；美國讀者會懂，但不是本地用語。                                |
| ep1.yaml:309                     | A records request.                                             | A subpoena to the company.                                         | 建議   | 叫車公司是私人企業，美國實務是用 subpoena 取得乘車紀錄；records request 通常指向政府機關的公開紀錄申請。 |
| ep1.yaml:371、383                | Subpoena motion: …                                             | Motion for subpoena: …                                             | 建議   | 美式說法是 motion for (issuance of) a subpoena。                                                         |
| ep1.yaml:951；ep2.yaml:461       | The jury will disregard.                                       | The jury will disregard that.                                      | 建議   | 法官口語確實常說，但 disregard 是及物動詞，補受詞較完整；engine.yaml:57 用 "the question" 是好例子。     |
| ep2.yaml:138、346、347           | an ordinary medical witness                                    | a non-retained medical witness／another physician                  | 建議   | "ordinary medical witness" 不是美國用語；原意是「非受聘專家的一般醫師證人」。                            |
| ep2.yaml:450                     | when the question itself is defective                          | when the question itself is improper                               | 建議   | 異議的慣用說法是 improper question。                                                                     |
| ep2.yaml:318                     | Differences in the sample go to weight, which is for the jury. | …go to weight, not admissibility. That's for the jury.             | 建議   | "goes to weight, not admissibility" 是固定說法，補上更道地。                                             |
| ep2.yaml:662                     | that is knowing perjury                                        | you'd be knowingly putting on perjured testimony                   | 建議   | 律師的責任是「明知而提出偽證」（suborning／offering false testimony），不是律師自己犯 perjury。          |
| ep2.yaml:125、237、282、305、668 | removing forced offline／There was never a forced offline.     | removing the forced-offline lock／There was never a forced logoff. | 建議   | "a forced offline" 把形容詞當名詞用；崔佛的口語可以留，但文件（ep2:125、237）建議補名詞。                |
| glossary.yaml:73                 | such as impeaching the defendant's honesty                     | such as impeaching the defendant's credibility if he testifies     | 建議   | 前科用於彈劾的前提是被告出庭作證；credibility 是標準用語。                                               |
| glossary.yaml:109                | the judge gatekeeps                                            | the judge acts as gatekeeper                                       | 建議   | gatekeep 當動詞偏口語（且帶負面意涵）；Daubert 的固定說法是 gatekeeper。                                 |
| glossary.yaml:120                | 過失致死訴訟: "Wrongful death"                                 | "Wrongful-death suit"                                              | 建議   | 詞條原文是「訴訟」，英文少了 suit／action。                                                              |
| ui-trial.yaml:203                | Released from the courtroom                                    | Released immediately                                               | 建議   | 「當庭釋放」的英文慣用 released in open court／released immediately；"from the courtroom" 字面直譯。     |
| ui-trial.yaml:171                | Examination over · {name}                                      | Cross-examination over · {name}                                    | 建議   | 原文是「交互詰問結束」，ui-trial:177 的 "Examination over" 已用於一般詰問，這裡可區分。                  |
| ui-trial.yaml:86                 | Not found ({votes} of {need} votes needed)                     | Not found ({votes} votes; {need} needed)                           | 建議   | 原寫法讀起來像「需要 {need} 票中的 {votes} 票」。                                                        |
| engine.yaml:50                   | argues for a verdict of {verdict:lower}                        | argues for "{verdict}"                                             | 建議   | 民事時會變成 "a verdict of liable"／"a verdict of not liable"，不自然。                                  |

## D. 翻譯腔與不自然措辭

| 位置              | 原文                                                                                    | 建議                                                                                           | 嚴重度 | 理由                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| ep2.yaml:688      | Grey, everyone in this building knows their own last name. You don't seem to yet.       | Grey, everyone in this building knows whose name is on the door. You don't seem to yet.        | 必改   | 「知道自己姓什麼」是「認清自己的身分」的中文慣用語，英文直譯後意思完全消失，讀者看不懂惠特洛克在說什麼。 |
| ep2.yaml:25       | Whatever you say in this room, I need to hear it here, not for the first time in court. | Whatever you're going to say, I need to hear it here first. Not for the first time in court.   | 建議   | 原句「在這個房間說的話，我要在這裡聽到」是同義反覆。                                                     |
| ep2.yaml:262      | Risk: the fatigue lock was changed away                                                 | Risk: the fatigue lock was removed                                                             | 建議   | "changed away" 不是英文說法。                                                                            |
| ep2.yaml:662      | but there is one less door at trial                                                     | but Okafor has one less way in at trial                                                        | 建議   | 「少一個門」直譯。                                                                                       |
| ep2.yaml:648      | So does the jury, the day they see it.                                                  | And so will the jury, the day it sees it.                                                      | 建議   | "So does the jury" 字面是「陪審團也會改變」，時態也和前句不一致。                                        |
| ep2.yaml:636、639 | There is no third road.／Two roads left                                                 | There's no third option.／Two options left                                                     | 建議   | road 是「條路」的直譯；英文慣用 option／way。                                                            |
| ep2.yaml:223      | Signed by my old group head.                                                            | Signed by my old practice group head.                                                          | 建議   | 律所的組是 practice group。                                                                              |
| ep2.yaml:192、301 | Discovery deadline: two weeks／Mediation: one week                                      | Discovery deadline in two weeks／Mediation in one week                                         | 建議   | ep1 同類字卡用 "Trial in three days"（ep1:396），這兩行只有冒號讀起來像期間長度。                        |
| ep1.yaml:829      | Ask him to answer only what's asked. If he remembers, say so. If he doesn't, say that.  | Ask him to answer only what's asked: if he remembers, he says so; if he doesn't, he says that. | 建議   | 原句後兩句的主詞變成玩家本人。                                                                           |
| ep1.yaml:215      | two hundred-some cases                                                                  | two hundred-plus cases                                                                         | 建議   | "-some" 接在 hundred 後較少見。                                                                          |
| ui-trial.yaml:163 | Accept: pay {amount}, settled                                                           | Accept: settle for {amount}                                                                    | 建議   | 較自然。                                                                                                 |
| ui-talk.yaml:80   | Directions tipped off to the other side                                                 | Leads tipped off to the other side                                                             | 建議   | "directions" 是「方向」直譯。                                                                            |
| ui-desk.yaml:107  | Link bench {slot}                                                                       | Link slot {slot}                                                                               | 建議   | "bench" 在法庭遊戲裡容易聯想到法官席。                                                                   |
| ui-desk.yaml:197  | on the ground of                                                                        | on the grounds of                                                                              | 建議   | 法律文書慣用複數 grounds。                                                                               |
| ui.yaml:56        | Courtroom lighting (test)                                                               | Courtroom lighting (experimental)                                                              | 建議   | 「試做」是實驗性功能。                                                                                   |

## E. 同一名詞多種譯法

| 位置                               | 原文                                                         | 建議                                                             | 嚴重度 | 理由                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| ep1.yaml:176 vs 437、756           | Northgate closing meeting／closeout meeting                  | 統一 "Northgate closeout meeting"                                | 必改   | 見前十名 #6。                                                                                                                        |
| ep1.yaml:696 vs 95、236            | You'll regret this!／You'll be sorry when…                   | "You'll be sorry!"                                               | 必改   | 見前十名 #4。                                                                                                                        |
| ui-talk.yaml:46 vs 110、125        | 攤牌: "Lay it out"／"your showdowns"                         | 按鈕與說明統一（例如按鈕 "Show your hand"，說明 "your reveals"） | 必改   | 玩家按的是 "Lay it out"，回饋卻說 "showdowns land 20% softer"，對不上是哪個操作。                                                    |
| ui.yaml:11 vs ep2.yaml:92、152     | The Price of Settlement／The Price of a Settlement           | 統一                                                             | 必改   | 見前十名 #7。                                                                                                                        |
| ep1.yaml:445、499、818–820 vs 全篇 | recalled vs unsent                                           | 統一 "unsent"                                                    | 建議   | 第 1 集片名就是 "The Unsent Message"，同一動作混用 recall／unsend。專家證詞用 recalled 可以接受，但盧卡斯的提問（ep1:445）建議統一。 |
| ep1.yaml:648、668、764 vs 125、128 | access log vs badge log                                      | 統一 "badge log"                                                 | 建議   | 同一份門禁紀錄兩種叫法。                                                                                                             |
| ep1.yaml:647 vs 106、206、250      | crystal award vs trophy                                      | "crystal trophy"                                                 | 建議   | 凶器名稱一致較好。                                                                                                                   |
| ep1.yaml:826 vs 98、149、238、308  | Rideshare driver vs ride-hail                                | "Ride-hail driver"                                               | 建議   | 同一服務兩種說法。                                                                                                                   |
| ep1.yaml:133 vs 290                | Dr. Brooks, medical examiner／Ellen Brooks, Medical Examiner | 統一大小寫                                                       | 建議   |                                                                                                                                      |
| ep1.yaml:394 vs engine.yaml:85–87  | The case review passed／Case meeting: …                      | 統一 "case meeting"                                              | 建議   | 「案情會議」兩種譯法。                                                                                                               |
| ep1.yaml:89 vs ui-desk.yaml:4      | Court system vs Court portal                                 | 擇一                                                             | 建議   | 「法院系統」兩種譯法（注意 src/ui/i18nKeys.test.ts 以 "Court system" 當測試字串）。                                                  |
| ui-desk.yaml:78 vs 219             | A prerequisite is missing／Missing a premise                 | 統一                                                             | 建議   | 同為「還缺前提」。                                                                                                                   |
| ui-talk.yaml:52 vs 117             | Side terms vs extra terms                                    | 統一 "side terms"                                                | 建議   | 同為「附帶條款」。                                                                                                                   |
| ui-trial.yaml:25 vs 24             | 證詞 {n}: "Claim {n}"／證詞: "Testimony"                     | "Statement {n}"                                                  | 建議   | 分頁名稱與上層標籤用詞不同。                                                                                                         |
| ep1.yaml:610                       | 大樓保全: "Building security"                                | "Building security guard"                                        | 建議   | 職業欄其他都是人（Bus driver、Nurse）。                                                                                              |

## F. 介面字串長度

依 `src/ui/*.tsx` 確認以下字串用在按鈕上，英文比中文長很多，窄螢幕可能換行或撐破：

| 位置                                    | 用途 | 原文                                                                               | 建議                                        | 嚴重度 |
| --------------------------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| ui-trial.yaml:63（Theory.tsx:146）      | 按鈕 | Your arguments can’t support any theory. Go to court anyway（58 字元）             | No theory holds up. Go to court anyway      | 建議   |
| ui-talk.yaml:126（Negotiation.tsx:300） | 按鈕 | Advise holding out (no rounds left, so this means walking out to trial)（71 字元） | Hold out (no rounds left: this means trial) | 建議   |
| ui-talk.yaml:56（Negotiation.tsx:276）  | 按鈕 | Advise {name} to accept (over authority)                                           | Advise accepting (over authority)           | 建議   |
| ui-talk.yaml:31（Interview.tsx:130）    | 按鈕 | Leave the meeting room                                                             | Leave                                       | 建議   |
| ui-trial.yaml:208                       | 比數 | {a} : {b}                                                                          | {a}–{b}                                     | 建議   |

## G. 程式端發現（不在 yaml，僅記錄）

| 位置                        | 問題                                                                                                                                                     | 建議                                                                  | 嚴重度               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| src/ui/Pleading.tsx:142     | 多個支撐證物之間寫死中文頓號 `'、'`，英文聲請狀會出現 "Exhibit A、Exhibit B"                                                                             | 改成 `t('、')`（ui-desk.yaml:163 已有 `'、': ', '`）                  | 必改                 |
| src/ui/Pleading.tsx:124–146 | 英文組出來是 "The movant asks the Court to: Issue a subpoena…, on the ground of Relevance, and offers … as evidence."；冒號後與 ground of 後都是大寫開頭 | 請求與依據在英文模式改小寫開頭（可沿用 `{x:lower}` 機制），冒號可拿掉 | 建議                 |
| src/i18n/index.ts           | 沒有複數規則                                                                                                                                             | 見 B2                                                                 | 必改（與 B2 同一項） |

## 修正 PR 已處理（`claude/english-typos`）

只動 `src/content/en/`，只修拼字、標點、文法，不改語氣、用詞與術語：

1. ui-desk.yaml:153 "Gray" → "Grey"。
2. 彎引號統一為直引號：ui-desk.yaml:165；ui-trial.yaml:7、17、19、20、23、38、63、90、103、128、137、141、179。
3. 美式標點（句號、逗號放進引號）：ep1.yaml:491、551、916；ep2.yaml:16（同時把單引號改雙引號）；glossary.yaml:10、106；ui-trial.yaml:7。
4. ui-trial.yaml:201 刪除複合述語前的逗號。
5. 新增 vitest 守門：英文值不得出現彎引號、引號外的句號／逗號、"Gray"、重複字、全形標點（`｜` 分行記號除外）。

其餘必改（重複 key、術語、單複數、語意錯誤）牽涉用詞或程式，留給負責人決定。
