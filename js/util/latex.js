// KaTeX 래퍼 — 수식 하나가 깨져도 페이지 전체가 멈추면 안 된다.
// KaTeX 는 vendor/katex/ 에 self-host 되어 있다 (CDN 금지, 오프라인 요구사항).

/** KaTeX 전역이 로드되었는가 */
function katexReady() {
  return typeof window !== 'undefined' && typeof window.katex !== 'undefined';
}

/**
 * LaTeX 문자열을 element 안에 렌더링한다.
 * 실패해도 throw 하지 않고 원본 문자열을 <code> 로 표시한 뒤 콘솔 경고를 남긴다.
 * @param {string} tex
 * @param {HTMLElement} el
 * @param {{display?: boolean}} [opts]
 */
export function renderTex(tex, el, { display = false } = {}) {
  if (!el) return;
  if (tex == null || tex === '') { el.textContent = ''; return; }
  if (!katexReady()) {
    el.innerHTML = `<code>${escapeHtml(tex)}</code>`;
    console.warn('[latex] KaTeX 가 로드되지 않았습니다. vendor/katex/ 를 확인하세요.');
    return;
  }
  try {
    window.katex.render(tex, el, { displayMode: display, throwOnError: true, output: 'html' });
  } catch (e) {
    el.innerHTML = `<code class="tex-fallback">${escapeHtml(tex)}</code>`;
    console.warn(`[latex] 파싱 실패: ${tex}`, e.message);
  }
}

/** LaTeX 을 HTML 문자열로 반환한다. 실패 시 <code> 폴백. */
export function texToHtml(tex, display = false) {
  if (tex == null || tex === '') return '';
  if (!katexReady()) return `<code>${escapeHtml(tex)}</code>`;
  try {
    return window.katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'html' });
  } catch (e) {
    console.warn(`[latex] 파싱 실패: ${tex}`, e.message);
    return `<code class="tex-fallback">${escapeHtml(tex)}</code>`;
  }
}

/** 정합성 검사용 — 이 문자열이 KaTeX 로 파싱되는가 */
export function canParseTex(tex) {
  if (!katexReady()) return true; // KaTeX 없으면 이 검사는 건너뛴다
  try {
    window.katex.renderToString(tex, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
