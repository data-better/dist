// DOM 헬퍼 — 얇게 유지한다. 프레임워크를 도입하지 않는다.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div', {class:'x', onclick:fn}, [child, '텍스트']) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendAll(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG 요소 생성 */
export function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  appendAll(node, children);
  return node;
}

function applyAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
}

function appendAll(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** 다음 프레임에 한 번만 실행되도록 묶는다 (슬라이더 조작 스로틀) */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

/** 숫자를 보기 좋게 (유효숫자 기준) */
export function fmtNum(v, sig = 4) {
  if (v == null) return '—';
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(1, sig - 1));
  return String(Number(v.toPrecision(sig)));
}

/**
 * CSS 커스텀 프로퍼티를 실제 색상값으로 해석한다.
 * Canvas 2D 의 strokeStyle/fillStyle 은 var(--x) 를 이해하지 못하므로,
 * 캔버스에 그리기 전에 반드시 이 함수를 거쳐야 한다.
 * (해석에 실패하면 strokeStyle 이 무시되어 모든 곡선이 검정으로 그려진다.)
 */
const colorCache = new Map();
export function resolveColor(value, root = document.documentElement) {
  if (typeof value !== 'string') return value;
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!m) return value;
  const key = `${root.dataset.theme || 'auto'}|${m[1]}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const v = getComputedStyle(root).getPropertyValue(m[1]).trim() || '#888';
  colorCache.set(key, v);
  return v;
}
/** 테마가 바뀌면 캐시를 비운다 */
export function clearColorCache() { colorCache.clear(); }

/**
 * 여러 자식을 붙이되 null/false 는 건너뛴다.
 * 주의: Element.append() 는 null 을 문자열 "null" 로 바꿔 화면에 찍는다.
 * 조건부 자식(`cond ? el(...) : null`)을 넘길 때는 반드시 이 함수를 쓴다.
 */
export function appendChildren(host, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    host.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/**
 * 데이터의 `**강조**` 표기를 <b> 로 바꿔 자식 노드 배열로 돌려준다.
 * innerHTML 을 쓰지 않으므로 데이터에 들어간 <, & 가 그대로 안전하게 나온다.
 * data/*.json 의 descriptionKo·summaryKo 처럼 긴 설명문에서만 쓴다.
 * @param {string} s
 * @returns {(string|HTMLElement)[]}
 */
export function boldParts(s) {
  if (!s) return [];
  return String(s).split(/\*\*(.+?)\*\*/s)
    .map((part, i) => (i % 2 === 1 ? el('b', { text: part }) : part))
    .filter((p) => p !== '');
}
