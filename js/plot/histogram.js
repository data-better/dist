// 히스토그램 — 표본 배열을 보관하지 않고 빈 카운트만 누적한다 (메모리 상한 고정).
// CLT 시뮬레이터가 최대 500만 표본을 다루므로 이 설계가 필수다 (PRD F4.7.8).

import { resolveColor } from '../util/dom.js';

export class Histogram {
  /** @param {number} bins 빈 개수 */
  constructor(bins = 60) {
    this.bins = bins;
    this.counts = new Float64Array(bins);
    this.lo = 0; this.hi = 1;
    this.n = 0;
    this.sum = 0; this.sum2 = 0; this.sum3 = 0;
    this.under = 0; this.over = 0;
    this.min = Infinity; this.max = -Infinity;
  }

  /** 빈 경계를 정하고 초기화한다 */
  reset(lo, hi) {
    this.lo = lo; this.hi = hi;
    this.counts.fill(0);
    this.n = 0; this.sum = 0; this.sum2 = 0; this.sum3 = 0;
    this.under = 0; this.over = 0;
    this.min = Infinity; this.max = -Infinity;
    return this;
  }

  /** 값 하나 누적 */
  push(v) {
    if (!Number.isFinite(v)) return;
    this.n++;
    this.sum += v; this.sum2 += v * v; this.sum3 += v * v * v;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
    const t = (v - this.lo) / (this.hi - this.lo);
    if (t < 0) { this.under++; return; }
    if (t >= 1) { this.over++; return; }
    this.counts[(t * this.bins) | 0]++;
  }

  get mean() { return this.n ? this.sum / this.n : NaN; }
  get variance() {
    if (this.n < 2) return NaN;
    return (this.sum2 - (this.sum * this.sum) / this.n) / (this.n - 1);
  }
  get sd() { return Math.sqrt(this.variance); }
  /** 표본왜도 (적률 기반) */
  get skewness() {
    if (this.n < 3) return NaN;
    const m = this.mean;
    const m2 = this.sum2 / this.n - m * m;
    const m3 = this.sum3 / this.n - 3 * m * (this.sum2 / this.n) + 2 * m * m * m;
    return m2 > 0 ? m3 / Math.pow(m2, 1.5) : NaN;
  }

  /** 밀도 정규화된 빈 높이 */
  densities() {
    const w = (this.hi - this.lo) / this.bins;
    const out = new Float64Array(this.bins);
    if (!this.n) return out;
    for (let i = 0; i < this.bins; i++) out[i] = this.counts[i] / (this.n * w);
    return out;
  }

  get maxDensity() {
    const d = this.densities();
    let m = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > m) m = d[i];
    return m;
  }

  /** 빈 카운트로부터 근사 분위수 (축 범위용) */
  quantile(p) {
    if (!this.n) return NaN;
    const target = p * (this.n - this.under - this.over);
    let acc = 0;
    const w = (this.hi - this.lo) / this.bins;
    for (let i = 0; i < this.bins; i++) {
      if (acc + this.counts[i] >= target) {
        const frac = this.counts[i] ? (target - acc) / this.counts[i] : 0;
        return this.lo + (i + frac) * w;
      }
      acc += this.counts[i];
    }
    return this.hi;
  }
}

/** CurvePlot 위에 히스토그램 막대를 그린다 */
export function drawHistogram(plot, hist, { color = '#7c9cf5', alpha = 0.5 } = {}) {
  const ctx = plot.canvas.getContext('2d');
  const d = hist.densities();
  const w = (hist.hi - hist.lo) / hist.bins;
  ctx.save();
  clipToPlot(ctx, plot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = resolveColor(color);
  for (let i = 0; i < hist.bins; i++) {
    if (d[i] <= 0) continue;
    const x0 = plot.sx(hist.lo + i * w);
    const x1 = plot.sx(hist.lo + (i + 1) * w);
    const y0 = plot.sy(d[i]);
    const y1 = plot.sy(0);
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0 - 0.5), y1 - y0);
  }
  ctx.restore();
}

/**
 * 표본 분위수 기반 축 범위. 코시처럼 극단값이 있는 경우에 쓴다 (PRD F4.7.6).
 * 1차로 넓게 훑어 대략적인 분위수를 잡는 2단계 방식.
 */
export function quantileRange(drawFn, n = 20000, loP = 0.01, hiP = 0.99) {
  const buf = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const v = drawFn();
    if (Number.isFinite(v)) buf[k++] = v;
  }
  const arr = buf.subarray(0, k);
  arr.sort();
  if (!k) return [0, 1];
  const q = (p) => arr[Math.min(k - 1, Math.max(0, Math.floor(p * k)))];
  let lo = q(loP), hi = q(hiP);
  if (!(hi > lo)) { hi = lo + 1; }
  const pad = (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

/**
 * 히스토그램을 채우지 않고 계단 윤곽선만 그린다.
 * CLT 애니메이션에서 n=1 시점의 모양을 잔상으로 남겨,
 * 현재 모양이 출발점에서 얼마나 달라졌는지 한눈에 보이게 하는 데 쓴다.
 */
export function drawHistogramOutline(plot, { lo, hi, densities }, { color, width = 1.6, dash = [4, 3] } = {}) {
  const ctx = plot.canvas.getContext('2d');
  const bins = densities.length;
  const w = (hi - lo) / bins;
  ctx.save();
  clipToPlot(ctx, plot);
  ctx.strokeStyle = resolveColor(color);
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(plot.sx(lo), plot.sy(0));
  for (let i = 0; i < bins; i++) {
    const x0 = plot.sx(lo + i * w);
    const x1 = plot.sx(lo + (i + 1) * w);
    const y = plot.sy(densities[i]);
    ctx.lineTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.lineTo(plot.sx(hi), plot.sy(0));
  ctx.stroke();
  ctx.restore();
}

/** 그리기를 플롯 안쪽으로 제한한다. 축·눈금 영역을 침범하지 않게 한다. */
function clipToPlot(ctx, plot) {
  const x0 = plot.sx(plot.xRange[0]);
  const x1 = plot.sx(plot.xRange[1]);
  const yTop = plot.sy(plot.yRange[1]);
  const yBot = plot.sy(plot.yRange[0]);
  ctx.beginPath();
  ctx.rect(x0, yTop, x1 - x0, yBot - yTop);
  ctx.clip();
}
