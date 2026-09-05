// 확률밀도함수 — 11개 분포.
// 모든 PDF는 로그 스케일에서 계산 후 exp 한다 (CLAUDE.md 수치 계산 규칙).
// 지지집합 밖에서는 반드시 0을 반환한다. NaN·Infinity 반환 경로가 있어서는 안 된다.
//
// 감마 계열 모수화: rate. f(x) = λ^r/Γ(r)·x^(r−1)·e^(−λx), 평균 r/λ (PRD §11.2)

import { lgamma, lbeta } from './special.js';

const LOG_2PI = Math.log(2 * Math.PI);

/** 로그밀도를 밀도로. 비유한값은 0으로 눌러 플롯이 깨지지 않게 한다. */
function fromLog(logf) {
  if (!Number.isFinite(logf)) return logf === Infinity ? Infinity : 0;
  const v = Math.exp(logf);
  return Number.isFinite(v) ? v : 0;
}

export const pdf = {
  /** N(μ, σ²) — params.sigma 는 표준편차 */
  normal(x, { mu = 0, sigma = 1 }) {
    if (!(sigma > 0) || !Number.isFinite(x)) return 0;
    const z = (x - mu) / sigma;
    return fromLog(-0.5 * (z * z + LOG_2PI) - Math.log(sigma));
  },

  /** N(0,1) */
  stdnormal(x) {
    if (!Number.isFinite(x)) return 0;
    return fromLog(-0.5 * (x * x + LOG_2PI));
  },

  /** LN(μ, σ²) — ln X ~ N(μ, σ²) */
  lognormal(x, { mu = 0, sigma = 1 }) {
    if (!(x > 0) || !(sigma > 0) || !Number.isFinite(x)) return 0;
    const lx = Math.log(x);
    const z = (lx - mu) / sigma;
    return fromLog(-0.5 * (z * z + LOG_2PI) - Math.log(sigma) - lx);
  },

  /** Gamma(r, λ) — rate 모수화 */
  gamma(x, { r = 1, lambda = 1 }) {
    if (!(x > 0) || !(r > 0) || !(lambda > 0) || !Number.isFinite(x)) return 0;
    return fromLog(r * Math.log(lambda) + (r - 1) * Math.log(x) - lambda * x - lgamma(r));
  },

  /** Exp(λ) — rate 모수화, 평균 1/λ */
  exponential(x, { lambda = 1 }) {
    if (!(x >= 0) || !(lambda > 0) || !Number.isFinite(x)) return 0;
    return fromLog(Math.log(lambda) - lambda * x);
  },

  /** χ²(m) = Gamma(m/2, 1/2) */
  chisq(x, { m = 1 }) {
    if (!(x > 0) || !(m > 0) || !Number.isFinite(x)) return 0;
    const k = m / 2;
    return fromLog((k - 1) * Math.log(x) - x / 2 - k * Math.LN2 - lgamma(k));
  },

  /** Beta(α, β) */
  beta(x, { alpha = 1, beta = 1 }) {
    if (!(alpha > 0) || !(beta > 0)) return 0;
    if (x <= 0 || x >= 1) {
      // 경계에서 유한한 값을 갖는 경우만 채워 준다 (예: U(0,1) = Beta(1,1))
      if (x === 0 && alpha === 1) return fromLog(-lbeta(alpha, beta) + (beta - 1) * Math.log(1));
      if (x === 1 && beta === 1) return fromLog(-lbeta(alpha, beta));
      return 0;
    }
    return fromLog((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - lbeta(alpha, beta));
  },

  /** t(n) */
  t(x, { n = 1 }) {
    if (!(n > 0) || !Number.isFinite(x)) return 0;
    return fromLog(
      lgamma((n + 1) / 2) - lgamma(n / 2) - 0.5 * Math.log(n * Math.PI)
      - ((n + 1) / 2) * Math.log1p((x * x) / n)
    );
  },

  /** F(r₁, r₂) */
  f(x, { r1 = 1, r2 = 1 }) {
    if (!(x > 0) || !(r1 > 0) || !(r2 > 0) || !Number.isFinite(x)) return 0;
    const a = r1 / 2, b = r2 / 2;
    return fromLog(
      a * Math.log(r1) + b * Math.log(r2) + (a - 1) * Math.log(x)
      - (a + b) * Math.log(r2 + r1 * x) - lbeta(a, b)
    );
  },

  /** U(0,1) */
  unif01(x) {
    return x >= 0 && x <= 1 ? 1 : 0;
  },

  /** U(a,b) */
  unifab(x, { a = 0, b = 1 }) {
    if (!(b > a)) return 0;
    return x >= a && x <= b ? 1 / (b - a) : 0;
  },

  /** Cauchy(x₀, γ) — f(x) = 1/(πγ[1+((x−x₀)/γ)²]). t(1) 과 같은 분포다. */
  cauchy(x, { x0 = 0, gamma = 1 }) {
    if (!(gamma > 0) || !Number.isFinite(x)) return 0;
    const z = (x - x0) / gamma;
    return 1 / (Math.PI * gamma * (1 + z * z));
  },

  /**
   * Weibull(a, b) — rate 계열 모수화로 통일한다 (about.html 표기 규약).
   * f(x) = a·b·x^(b−1)·e^(−a x^b), x>0.  b=1 이면 Exp(a).
   */
  weibull(x, { a = 1, b = 1 }) {
    if (!(a > 0) || !(b > 0) || !(x > 0) || !Number.isFinite(x)) return 0;
    const lx = Math.log(x);
    return fromLog(Math.log(a) + Math.log(b) + (b - 1) * lx - a * Math.exp(b * lx));
  },

  /** 이중지수(라플라스) DE(0, λ) — f(x) = (λ/2)e^(−λ|x|) */
  dblexp(x, { lambda = 1 }) {
    if (!(lambda > 0) || !Number.isFinite(x)) return 0;
    return fromLog(Math.log(lambda / 2) - lambda * Math.abs(x));
  },
};

/** id로 PDF 함수를 얻는다. 없으면 null. */
export function getPdf(id) {
  return Object.prototype.hasOwnProperty.call(pdf, id) ? pdf[id] : null;
}
