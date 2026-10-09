/**
 * 黑條（設定集第 1、9 章 <Redaction>）：「沒有資訊」一律是黑條，不用虛線灰框、問號或模糊。
 * 三種意思：藏（被遮蔽）、刪（被收回、被刪除）、默（拒答）。條內小字說它是什麼、什麼時候。
 * 長方形零圓角、上緣 1px；一個畫面最多三條，不蓋臉。
 */
export function Redaction({ label, meta }: { label: string; meta?: string }) {
  return (
    <span className="redact">
      <span className="redact-label">{label}</span>
      {meta && <span className="redact-meta">{meta}</span>}
    </span>
  );
}
