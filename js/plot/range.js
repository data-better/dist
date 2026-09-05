// 축 범위 계산 — 분포와 모수로부터 보기 좋은 x·y 범위를 정한다.

import { cumulative as cdf, density as pdf, momentsOf as getMoments, supportRange }
  from '../distributions/registry.js';

/** CDF 이분법 분위수. 모든 분포에 대해 동작한다. */
export function quantile(id, params, p, lo = -1e6, hi = 1e6) {
  const F = cdf[id];
  if (!F) return NaN;
  let a = lo, b = hi;
  // 유효한 초기 구간 확보
  for (let i = 0; i < 60 && F(a, params) > p; i++) { b = a; a = a * 2 - 1; }
  for (let i = 0; i < 60 && F(b, params) < p; i++) { a = b; b = b * 2 + 1; }
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (F(m, params) < p) a = m; else b = m;
  }
  return (a + b) / 2;
}

/**
 * 기본 x 범위.
 *  - 유계 지지집합: 지지집합 전체
 *  - 그 외: 평균 ± 4σ
 *  - 평균·분산이 없으면(t(1), t(2)): 분위수 기반 0.5%~99.5%
 */
export function defaultXRange(dist, params) {
  // 이산분포는 정수 지지집합의 양옆에 0.5 여유를 둔다 (막대가 잘리지 않게)
  if (dist.discrete) {
    const [lo, hi] = supportRange(dist.id, params);
    return [lo - 0.5, hi + 0.5];
  }
  const sup = dist.support || {};
  if (sup.type === 'bounded') {
    const lo = typeof sup.lower === 'string' ? params[sup.lower] : sup.lower;
    const hi = typeof sup.upper === 'string' ? params[sup.upper] : sup.upper;
    return [lo, hi];
  }
  const m = getMoments(dist.id, params);
  if (m.mean !== null && m.variance !== null && Number.isFinite(m.variance)) {
    const s = Math.sqrt(m.variance);
    let lo = m.mean - 4 * s, hi = m.mean + 4 * s;
    if (sup.type === 'halfline') lo = Math.max(sup.lower ?? 0, 0);
    return [lo, hi];
  }
  // 평균·분산이 존재하지 않는 경우 (코시 등)
  const lo = quantile(dist.id, params, 0.005);
  const hi = quantile(dist.id, params, 0.995);
  return [lo, hi];
}

/** 주어진 x 범위에서 PDF 최댓값을 훑어 y 범위를 정한다 */
export function defaultYRange(dist, params, xRange, samples = 600) {
  const f = pdf[dist.id];
  let mx = 0;
  if (dist.discrete) {
    // 이산은 정수 점에서만 값이 있다. 연속처럼 훑으면 최댓값을 놓친다.
    const lo = Math.ceil(xRange[0]);
    const hi = Math.floor(xRange[1]);
    for (let k = lo; k <= hi; k++) {
      const v = f(k, params);
      if (Number.isFinite(v) && v > mx) mx = v;
    }
    return [0, (mx > 0 ? mx : 1) * 1.15];
  }
  for (let i = 0; i <= samples; i++) {
    const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / samples;
    const v = f(x, params);
    if (Number.isFinite(v) && v > mx) mx = v;
  }
  if (!(mx > 0)) mx = 1;
  return [0, mx * 1.15];
}

/** 여러 모수 조합을 한 화면에 담을 때의 합집합 범위 */
export function unionRange(ranges) {
  const lo = Math.min(...ranges.map((r) => r[0]));
  const hi = Math.max(...ranges.map((r) => r[1]));
  return [lo, hi];
}
