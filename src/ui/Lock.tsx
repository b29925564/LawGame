/** 單色鎖：跟字同色的 SVG，取代 🔒 表情符號（設計師 #225：表情符號帶彩色，設定集沒有）。 */
export function Lock() {
  return (
    <svg className="lock-icon" viewBox="0 0 12 14" aria-hidden focusable="false">
      <path
        d="M3.5 6.5V4.25a2.5 2.5 0 0 1 5 0V6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="1.5" y="6.5" width="9" height="6.5" rx="1" fill="currentColor" />
    </svg>
  );
}
