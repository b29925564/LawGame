export const NB = '\u00a0';
/**
 * 英文專有名詞（設計師裁定 a26de2b）：顯示時把名字裡的空白換成不斷行空格，不寫進內容檔。
 * 地名、公司、機構和有台詞的角色全名；內容新增時加在這裡（properNames.test.ts 檢查每個都真的在內容裡）。
 */
export const EN_NAMES = [
  ...['Calder County', 'Calder Building', 'Calder Harbor', 'Calder Express', 'Calder Logistics'],
  ...[
    'Calder Tribune',
    'Superior Court',
    'Detention Center',
    'Medical Examiner',
    'District Attorney',
  ],
  ...['Northgate Freight', 'East River Street', 'Harbor Avenue', 'Pier Nine', 'Pier Road'],
  ...['State Prison', 'Calder State Prison', 'Okafor Labor Law', 'South Harbor Market'],
  ...['Whitlock & Hale', 'Omar H.', 'Air Force'],
  ...[
    'Ethan Shaw',
    'Trevor Mills',
    'Devon Ash',
    'Arthur Calder',
    'Sophie Martinez',
    'Rachel Adler',
  ],
  ...['Marisol Vega', 'Lucas Grey', 'Jade Cannon', 'Hector Vega', 'Grant Voss', 'Omar Hassan'],
  ...['Priya Nair', 'Logan Price', 'Ellen Brooks', 'Daniel Okafor', 'Catherine Morrow'],
  ...['Victoria Whitlock', 'Marcus Hale', 'Ray Kowalski', 'Judge Reyes', 'Prosecutor Morrow'],
];
const NAME_RE = new RegExp(
  `(?<![A-Za-z])(?:${[...EN_NAMES]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \u00a0]'))
    .join('|')})(?![A-Za-z])`,
  'g',
);
/** 專有名詞黏住（EN_NAMES，長的先比對：Calder State Prison 先於 State Prison）。 */
export const glueNames = (text: string) => text.replace(NAME_RE, (m) => m.replace(/ /g, NB));
