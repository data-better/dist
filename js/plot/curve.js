// 곡선 플롯 — 축·격자는 SVG, 곡선은 Canvas 2D (슬라이더 실시간 반응 성능 확보).
// 주의: Canvas 는 CSS 변수를 이해하지 못한다. 색은 반드시 resolveColor() 를 거친다.
// devicePixelRatio 를 반영해 선명하게 그린다.

import { resolveColor } from '../util/dom.js';

const PAD = { l: 52, r: 14, t: 14, b: 34 };

export class CurvePlot {
  /** @param {HTMLElement} host 캔버스와 축 SVG를 담을 컨테이너 */
  constructor(host, { height = 260 } = {}) {
    this.host = host;
    this.height = height;
    host.classList.add('plot');
    host.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plot-canvas';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'plot-axes');
    this.tip = document.createElement('div');
    this.tip.className = 'plot-tip';
    this.tip.hidden = true;
    host.append(this.canvas, this.svg, this.tip);
    this.xRange = [0, 1];
    this.yRange = [0, 1];
    this.series = [];
    this._bindHover();
  }

  get width() { return this.host.clientWidth || 480; }

  /** series: [{fn, color, width, dash, label, muted}] */
  setSeries(series) { this.series = series; return this; }
  setRanges(xRange, yRange) { this.xRange = xRange; this.yRange = yRange; return this; }

  /** 데이터 → 픽셀 */
  sx(x) {
    const w = this.width;
    return PAD.l + ((x - this.xRange[0]) / (this.xRange[1] - this.xRange[0])) * (w - PAD.l - PAD.r);
  }
  sy(y) {
    const h = this.height;
    return h - PAD.b - ((y - this.yRange[0]) / (this.yRange[1] - this.yRange[0])) * (h - PAD.t - PAD.b);
  }
  /** 픽셀 → 데이터 x */
  ix(px) {
    const w = this.width;
    return this.xRange[0] + ((px - PAD.l) / (w - PAD.l - PAD.r)) * (this.xRange[1] - this.xRange[0]);
  }

  draw() {
    const w = this.width, h = this.height;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this._drawAxes(w, h);

    for (const s of this.series) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t - 2, w - PAD.l - PAD.r, h - PAD.t - PAD.b + 2);
      ctx.clip();
      ctx.strokeStyle = resolveColor(s.color);
      ctx.lineWidth = s.width ?? 2;
      ctx.setLineDash(s.dash || []);
      ctx.globalAlpha = s.muted ? 0.55 : 1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const n = Math.max(2, Math.round(w - PAD.l - PAD.r));
      let pen = false;
      for (let i = 0; i <= n; i++) {
        const x = this.xRange[0] + ((this.xRange[1] - this.xRange[0]) * i) / n;
        const y = s.fn(x);
        // 비유한값에서는 경로를 끊는다 (이어 그리지 않는다)
        if (!Number.isFinite(y)) { pen = false; continue; }
        const px = this.sx(x), py = this.sy(y);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (s.fill) {
        ctx.lineTo(this.sx(this.xRange[1]), this.sy(0));
        ctx.lineTo(this.sx(this.xRange[0]), this.sy(0));
        ctx.closePath();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = resolveColor(s.color);
        ctx.fill();
      }
      ctx.restore();
    }
    return this;
  }

  _drawAxes(w, h) {
    const ns = 'http://www.w3.org/2000/svg';
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.innerHTML = '';
    const mk = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      this.svg.appendChild(e);
      return e;
    };
    const xt = ticks(this.xRange[0], this.xRange[1], 6);
    const yt = ticks(this.yRange[0], this.yRange[1], 5);
    for (const t of yt) {
      const y = this.sy(t);
      mk('line', { x1: PAD.l, y1: y, x2: w - PAD.r, y2: y, class: 'grid' });
      mk('text', { x: PAD.l - 7, y: y + 3.5, class: 'tick tick-y' }, fmtTick(t));
    }
    for (const t of xt) {
      const x = this.sx(t);
      mk('line', { x1: x, y1: PAD.t, x2: x, y2: h - PAD.b, class: 'grid grid-v' });
      mk('text', { x, y: h - PAD.b + 15, class: 'tick tick-x' }, fmtTick(t));
    }
    mk('line', { x1: PAD.l, y1: h - PAD.b, x2: w - PAD.r, y2: h - PAD.b, class: 'axis' });
    mk('line', { x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: h - PAD.b, class: 'axis' });
  }

  _bindHover() {
    const move = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      if (px < PAD.l || px > this.width - PAD.r || !this.onHover) { this.tip.hidden = true; return; }
      const x = this.ix(px);
      const text = this.onHover(x);
      if (!text) { this.tip.hidden = true; return; }
      this.tip.hidden = false;
      this.tip.innerHTML = text;
      const tw = this.tip.offsetWidth;
      this.tip.style.left = `${Math.min(Math.max(px - tw / 2, 4), this.width - tw - 4)}px`;
      this.tip.style.top = '6px';
      this.cursorX = x;
      this._drawCursor(px);
    };
    this.host.addEventListener('pointermove', move);
    this.host.addEventListener('pointerleave', () => {
      this.tip.hidden = true;
      this.cursorX = null;
      const l = this.svg.querySelector('.cursor');
      if (l) l.remove();
    });
  }

  _drawCursor(px) {
    let l = this.svg.querySelector('.cursor');
    if (!l) {
      l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('class', 'cursor');
      this.svg.appendChild(l);
    }
    l.setAttribute('x1', px); l.setAttribute('x2', px);
    l.setAttribute('y1', PAD.t); l.setAttribute('y2', this.height - PAD.b);
  }
}

/** 보기 좋은 눈금값 */
export function ticks(lo, hi, count = 6) {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(0);
  return String(Number(v.toPrecision(4)));
}

/**
 * 이산분포의 확률질량함수를 스템(막대+점) 으로 그린다.
 * 연속분포의 곡선과 시각적으로 확실히 구분되어야 한다 — 이산분포에서 곡선을 그리면
 * 정의되지 않은 점 사이를 이은 것처럼 보여 개념을 흐린다.
 *
 * @param {CurvePlot} plot
 * @param {(k:number)=>number} pmfFn
 * @param {[number, number]} support 정수 [lo, hi]
 */
export function drawStems(plot, pmfFn, support, { color = 'var(--accent)', width, dot = true, alpha = 1 } = {}) {
  const ctx = plot.canvas.getContext('2d');
  const [lo, hi] = support;
  const nK = hi - lo + 1;
  const px = plot.sx(1) - plot.sx(0);          // 정수 1칸의 픽셀 폭
  const w = width ?? Math.max(1.5, Math.min(12, px * 0.55));
  const c = resolveColor(color);
  ctx.save();
  const x0 = plot.sx(plot.xRange[0]);
  const x1 = plot.sx(plot.xRange[1]);
  ctx.beginPath();
  ctx.rect(x0, plot.sy(plot.yRange[1]), x1 - x0, plot.sy(plot.yRange[0]) - plot.sy(plot.yRange[1]));
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = 'butt';
  const yBase = plot.sy(0);
  // 점이 너무 많으면 점 표시를 끄고 막대만 (가독성)
  const showDot = dot && nK <= 60 && px > 5;
  for (let k = lo; k <= hi; k++) {
    const v = pmfFn(k);
    if (!Number.isFinite(v) || v <= 0) continue;
    const x = plot.sx(k);
    if (x < x0 - w || x > x1 + w) continue;
    const y = plot.sy(v);
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (showDot) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, w * 0.42), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 이산 CDF — 계단함수로 그린다 (오른쪽 연속, 점프 지점에 열린/닫힌 점) */
export function drawStep(plot, cdfFn, support, { color = 'var(--accent)', width = 2.2 } = {}) {
  const ctx = plot.canvas.getContext('2d');
  const [lo, hi] = support;
  const c = resolveColor(color);
  ctx.save();
  const x0 = plot.sx(plot.xRange[0]);
  const x1 = plot.sx(plot.xRange[1]);
  ctx.beginPath();
  ctx.rect(x0, plot.sy(plot.yRange[1]), x1 - x0, plot.sy(plot.yRange[0]) - plot.sy(plot.yRange[1]));
  ctx.clip();
  ctx.strokeStyle = c;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, plot.sy(0));
  for (let k = lo; k <= hi; k++) {
    const y = plot.sy(cdfFn(k));
    ctx.lineTo(plot.sx(k), plot.sy(k === lo ? 0 : cdfFn(k - 1)));
    ctx.lineTo(plot.sx(k), y);                       // 수직 점프
    ctx.lineTo(plot.sx(Math.min(k + 1, hi + 1)), y); // 수평 유지
  }
  ctx.lineTo(x1, plot.sy(1));
  ctx.stroke();
  ctx.restore();
}
