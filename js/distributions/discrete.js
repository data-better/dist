// 이산확률분포 — 확률질량함수(PMF), 누적분포함수, 모멘트, 표본생성.
//
// 표기 규약 (연속 쪽의 rate 모수화와 같은 성격의 선택이므로 사이트 전체에서 하나로 고정한다):
//   기하분포·음이항분포는 **시행 횟수** 관례를 쓴다.
//     Geom(p)     : 첫 성공이 나올 때까지의 **시행 횟수**, k = 1, 2, 3, …  평균 1/p
//     NegBin(r,p) : r번째 성공이 나올 때까지의 **시행 횟수**, k = r, r+1, … 평균 r/p
//   실패 횟수 관례(k = 0, 1, 2, …)를 쓰는 교재와는 k_실패 = k_시행 − r 로 대응한다.
//
// 모든 PMF는 로그 스케일에서 계산 후 exp 한다. 지지집합 밖에서는 0을 반환하고
// NaN·Infinity 를 내보내지 않는다 (연속 쪽과 같은 규칙).

import { lgamma, lowerRegGamma, upperRegGamma, regIncBeta } from './special.js';

/** log C(n, k) */
export function lchoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

const isInt = (x) => Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9;
const fromLog = (v) => {
  if (!Number.isFinite(v)) return 0;
  const e = Math.exp(v);
  return Number.isFinite(e) ? e : 0;
};

// ── 확률질량함수 ────────────────────────────────────────────────────────────
export const pmf = {
  /** 베르누이 — 성공/실패 한 번 */
  bernoulli(k, { p = 0.5 }) {
    if (!(p >= 0 && p <= 1) || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i === 0) return 1 - p;
    if (i === 1) return p;
    return 0;
  },

  /** 이항 — 독립 베르누이 n회 중 성공 횟수 */
  binomial(k, { n = 10, p = 0.5 }) {
    if (!(p >= 0 && p <= 1) || !(n >= 1) || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i < 0 || i > n) return 0;
    if (p === 0) return i === 0 ? 1 : 0;
    if (p === 1) return i === n ? 1 : 0;
    return fromLog(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p));
  },

  /** 기하 — 첫 성공까지의 시행 횟수 (k = 1, 2, …) */
  geometric(k, { p = 0.3 }) {
    if (!(p > 0 && p <= 1) || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i < 1) return 0;
    return fromLog(Math.log(p) + (i - 1) * Math.log1p(-p));
  },

  /** 음이항 — r번째 성공까지의 시행 횟수 (k = r, r+1, …) */
  negbinomial(k, { r = 3, p = 0.3 }) {
    if (!(p > 0 && p <= 1) || !(r >= 1) || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i < r) return 0;
    return fromLog(lchoose(i - 1, r - 1) + r * Math.log(p) + (i - r) * Math.log1p(-p));
  },

  /** 포아송 — 단위 구간에서의 사건 횟수 */
  poisson(k, { lambda = 3 }) {
    if (!(lambda > 0) || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i < 0) return 0;
    return fromLog(i * Math.log(lambda) - lambda - lgamma(i + 1));
  },

  /** 초기하 — 비복원추출. 전체 N개 중 성공 K개, n개를 뽑았을 때의 성공 횟수 */
  hypergeometric(k, { N = 50, K = 20, n = 10 }) {
    if (!(N >= 1) || !(K >= 0) || !(n >= 0) || K > N || n > N || !isInt(k)) return 0;
    const i = Math.round(k);
    if (i < Math.max(0, n - (N - K)) || i > Math.min(n, K)) return 0;
    return fromLog(lchoose(K, i) + lchoose(N - K, n - i) - lchoose(N, n));
  },

  /** 이산 균등 — a부터 b까지 정수가 모두 같은 확률 */
  discreteUniform(k, { a = 1, b = 6 }) {
    if (!isInt(k) || !(b >= a)) return 0;
    const i = Math.round(k);
    return i >= a && i <= b ? 1 / (b - a + 1) : 0;
  },
};

// ── 누적분포함수 ────────────────────────────────────────────────────────────
// 가능한 곳은 닫힌 형태(정규화 불완전베타·불완전감마)를 쓴다. 큰 모수에서 누적합을
// 돌리면 느리고 오차가 쌓이기 때문이다.
/**
 * 누적분포함수 진입 가드.
 * ±Infinity 를 그대로 흘려보내면 불완전감마·불완전베타에 무한대 인자가 들어가
 * 연분수가 발산한다. 지지집합의 양 끝으로 눌러 준다.
 * @returns {0|1|NaN|null} null 이면 정상 경로로 계속 진행
 */
function edgeGuard(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  return null;
}

export const cdfD = {
  bernoulli(x, { p = 0.5 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    if (x < 0) return 0;
    if (x < 1) return 1 - p;
    return 1;
  },

  /** P(X ≤ k) = I_{1−p}(n−k, k+1) */
  binomial(x, { n = 10, p = 0.5 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    const k = Math.floor(x + 1e-9);
    if (k < 0) return 0;
    if (k >= n) return 1;
    if (p === 0) return 1;
    if (p === 1) return 0;
    return regIncBeta(n - k, k + 1, 1 - p);
  },

  /** 시행 관례: P(X ≤ k) = 1 − (1−p)^k */
  geometric(x, { p = 0.3 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    const k = Math.floor(x + 1e-9);
    if (k < 1) return 0;
    return -Math.expm1(k * Math.log1p(-p));
  },

  /** 시행 관례: P(X ≤ k) = I_p(r, k−r+1) */
  negbinomial(x, { r = 3, p = 0.3 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    const k = Math.floor(x + 1e-9);
    if (k < r) return 0;
    if (p === 1) return 1;
    return regIncBeta(r, k - r + 1, p);
  },

  /** P(X ≤ k) = Q(k+1, λ) — 상부 정규화 불완전감마 */
  poisson(x, { lambda = 3 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    const k = Math.floor(x + 1e-9);
    if (k < 0) return 0;
    return upperRegGamma(k + 1, lambda);
  },

  /** 닫힌 형태가 없어 직접 누적한다. 지지집합이 유한(≤ n)하므로 안전하다. */
  hypergeometric(x, params) {
    const g = edgeGuard(x); if (g !== null) return g;
    const { N = 50, K = 20, n = 10 } = params;
    const k = Math.floor(x + 1e-9);
    const lo = Math.max(0, n - (N - K));
    const hi = Math.min(n, K);
    if (k < lo) return 0;
    if (k >= hi) return 1;
    let s = 0;
    for (let i = lo; i <= k; i++) s += pmf.hypergeometric(i, params);
    return Math.min(1, s);
  },

  discreteUniform(x, { a = 1, b = 6 }) {
    const g = edgeGuard(x); if (g !== null) return g;
    const k = Math.floor(x + 1e-9);
    if (k < a) return 0;
    if (k >= b) return 1;
    return (k - a + 1) / (b - a + 1);
  },
};

// ── 모멘트 ──────────────────────────────────────────────────────────────────
export const momentsD = {
  bernoulli: ({ p = 0.5 }) => ({
    mean: p, variance: p * (1 - p),
    skewness: p > 0 && p < 1 ? (1 - 2 * p) / Math.sqrt(p * (1 - p)) : null,
  }),
  binomial: ({ n = 10, p = 0.5 }) => ({
    mean: n * p, variance: n * p * (1 - p),
    skewness: p > 0 && p < 1 ? (1 - 2 * p) / Math.sqrt(n * p * (1 - p)) : null,
  }),
  // 시행 관례
  geometric: ({ p = 0.3 }) => ({
    mean: 1 / p, variance: (1 - p) / (p * p),
    skewness: p < 1 ? (2 - p) / Math.sqrt(1 - p) : null,
  }),
  negbinomial: ({ r = 3, p = 0.3 }) => ({
    mean: r / p, variance: (r * (1 - p)) / (p * p),
    skewness: p < 1 ? (2 - p) / Math.sqrt(r * (1 - p)) : null,
  }),
  poisson: ({ lambda = 3 }) => ({
    mean: lambda, variance: lambda, skewness: 1 / Math.sqrt(lambda),
  }),
  hypergeometric: ({ N = 50, K = 20, n = 10 }) => {
    const p = K / N;
    const mean = n * p;
    const variance = n * p * (1 - p) * ((N - n) / (N - 1));
    let skewness = null;
    if (N > 2 && variance > 0) {
      skewness = ((N - 2 * K) * Math.sqrt(N - 1) * (N - 2 * n))
        / (Math.sqrt(n * K * (N - K) * (N - n)) * (N - 2));
    }
    return { mean, variance, skewness };
  },
  discreteUniform: ({ a = 1, b = 6 }) => {
    const m = b - a + 1;
    return { mean: (a + b) / 2, variance: (m * m - 1) / 12, skewness: 0 };
  },
};

// ── 표본생성 ────────────────────────────────────────────────────────────────
// 이 사이트가 가르치는 관계를 그대로 코드로 옮기되, CLT 시뮬레이터가 수백만 표본을
// 뽑으므로 속도가 중요하다. 지지집합이 유한하거나 꼬리가 빠르게 죽는 분포는
// 누적표 + 이분탐색으로 뽑는다(모수당 한 번만 표를 만든다).

const tableCache = new Map();

/** 누적확률 표를 만들어 캐시한다. hi 까지의 확률이 1−1e-12 를 넘도록 잡는다. */
function cumTable(id, params, lo, hiGuess) {
  const key = `${id}|${JSON.stringify(params)}`;
  const hit = tableCache.get(key);
  if (hit) return hit;
  const f = pmf[id];
  const cum = [];
  const vals = [];
  let acc = 0;
  const limit = Math.min(hiGuess, lo + 200000);
  for (let k = lo; k <= limit; k++) {
    acc += f(k, params);
    vals.push(k);
    cum.push(acc);
    if (acc > 1 - 1e-12) break;
  }
  const tbl = { vals, cum, last: vals[vals.length - 1] };
  if (tableCache.size > 200) tableCache.clear();
  tableCache.set(key, tbl);
  return tbl;
}

function drawFromTable(rng, tbl) {
  const u = rng() * tbl.cum[tbl.cum.length - 1];
  let lo = 0, hi = tbl.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tbl.cum[mid] < u) lo = mid + 1; else hi = mid;
  }
  return tbl.vals[lo];
}

export const sampleD = {
  bernoulli: (rng, { p = 0.5 }) => (rng() < p ? 1 : 0),

  binomial: (rng, params) => {
    const { n = 10, p = 0.5 } = params;
    // n 이 작으면 베르누이 합이 가장 정직하다 (이 사이트가 가르치는 D1 관계 그대로)
    if (n <= 30) {
      let s = 0;
      for (let i = 0; i < n; i++) if (rng() < p) s++;
      return s;
    }
    return drawFromTable(rng, cumTable('binomial', { n, p }, 0, n));
  },

  // 역변환: k = ceil(ln U / ln(1−p)), 시행 관례이므로 최소 1
  geometric: (rng, { p = 0.3 }) => {
    if (p >= 1) return 1;
    const u = rng();
    const k = Math.ceil(Math.log(u === 0 ? Number.MIN_VALUE : u) / Math.log1p(-p));
    return Math.max(1, k);
  },

  // D5 관계 그대로: 독립 기하 r개의 합
  negbinomial: (rng, { r = 3, p = 0.3 }) => {
    let s = 0;
    for (let i = 0; i < r; i++) s += sampleD.geometric(rng, { p });
    return s;
  },

  poisson: (rng, params) => {
    const { lambda = 3 } = params;
    if (lambda < 30) {
      // Knuth 곱셈법
      const L = Math.exp(-lambda);
      let k = 0, prod = rng();
      while (prod > L) { k++; prod *= rng(); }
      return k;
    }
    const hi = Math.ceil(lambda + 10 * Math.sqrt(lambda) + 20);
    return drawFromTable(rng, cumTable('poisson', { lambda }, 0, hi));
  },

  hypergeometric: (rng, params) => {
    const { N = 50, K = 20, n = 10 } = params;
    const lo = Math.max(0, n - (N - K));
    return drawFromTable(rng, cumTable('hypergeometric', { N, K, n }, lo, Math.min(n, K)));
  },

  discreteUniform: (rng, { a = 1, b = 6 }) => a + Math.floor(rng() * (b - a + 1)),
};

/** 이 id 가 이산분포인가 */
export function isDiscreteId(id) {
  return Object.prototype.hasOwnProperty.call(pmf, id);
}

/** 지지집합 범위 — 플롯 축과 표본 표 생성에 쓴다. [lo, hi] 정수 */
export function supportRange(id, params, tailP = 1e-4) {
  switch (id) {
    case 'bernoulli': return [0, 1];
    case 'binomial': return [0, params.n];
    case 'discreteUniform': return [params.a, params.b];
    case 'hypergeometric':
      return [Math.max(0, params.n - (params.N - params.K)), Math.min(params.n, params.K)];
    default: {
      // 꼬리가 열린 분포는 분위수로 끊는다
      const F = cdfD[id];
      const lo = id === 'geometric' ? 1 : id === 'negbinomial' ? params.r : 0;
      let k = lo;
      for (let i = 0; i < 100000 && F(k, params) < 1 - tailP; i++) k++;
      return [lo, Math.max(lo + 1, k)];
    }
  }
}
