// 누적분포함수 — 11개 분포.
// 감마 계열은 rate 모수화 (PRD §11.2).

import { lowerRegGamma, regIncBeta, normalCdfStd } from './special.js';

export const cdf = {
  normal(x, { mu = 0, sigma = 1 }) {
    if (!(sigma > 0) || Number.isNaN(x)) return NaN;
    if (x === -Infinity) return 0;
    if (x === Infinity) return 1;
    return normalCdfStd((x - mu) / sigma);
  },

  stdnormal(x) {
    if (Number.isNaN(x)) return NaN;
    return normalCdfStd(x);
  },

  lognormal(x, { mu = 0, sigma = 1 }) {
    if (!(sigma > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    return normalCdfStd((Math.log(x) - mu) / sigma);
  },

  /** Gamma(r, λ) rate: P(r, λx) */
  gamma(x, { r = 1, lambda = 1 }) {
    if (!(r > 0) || !(lambda > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    return lowerRegGamma(r, lambda * x);
  },

  exponential(x, { lambda = 1 }) {
    if (!(lambda > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    return -Math.expm1(-lambda * x);
  },

  /** χ²(m): P(m/2, x/2) */
  chisq(x, { m = 1 }) {
    if (!(m > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    return lowerRegGamma(m / 2, x / 2);
  },

  beta(x, { alpha = 1, beta = 1 }) {
    if (!(alpha > 0) || !(beta > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return regIncBeta(alpha, beta, x);
  },

  /**
   * t(n). 불완전베타의 두 가지 동치 표현 중 **인자가 작은 쪽**을 쓴다.
   *   중심부(x² < n): y = x²/(n+x²) 는 0 근방 → F = 1/2 + sign(x)/2 · I_y(1/2, n/2)
   *   꼬리부(x² ≥ n): u = n/(n+x²) 는 0 근방 → p = 1/2 · I_u(n/2, 1/2)
   * 한쪽 형태만 쓰면 반대편에서 인자가 1에 붙어 1−u 계산에서 자릿수가 소실된다
   * (예: t(200) 의 x≈0 에서 상대오차 6e-4). 두 형태를 나눠 쓰면 양쪽 모두 안정적이다.
   */
  t(x, { n = 1 }) {
    if (!(n > 0) || Number.isNaN(x)) return NaN;
    if (x === 0) return 0.5;
    if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
    const x2 = x * x;
    if (x2 < n) {
      const y = x2 / (n + x2);
      const half = 0.5 * regIncBeta(0.5, n / 2, y);
      return x > 0 ? 0.5 + half : 0.5 - half;
    }
    const u = n / (n + x2);
    const p = 0.5 * regIncBeta(n / 2, 0.5, u);
    return x > 0 ? 1 - p : p;
  },

  /** F(r₁,r₂): I_{r₁x/(r₁x+r₂)}(r₁/2, r₂/2) */
  f(x, { r1 = 1, r2 = 1 }) {
    if (!(r1 > 0) || !(r2 > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    if (!Number.isFinite(x)) return 1;
    return regIncBeta(r1 / 2, r2 / 2, (r1 * x) / (r1 * x + r2));
  },

  unif01(x) {
    if (Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
  },

  unifab(x, { a = 0, b = 1 }) {
    if (!(b > a) || Number.isNaN(x)) return NaN;
    if (x <= a) return 0;
    if (x >= b) return 1;
    return (x - a) / (b - a);
  },

  /** Cauchy — F(x) = ½ + arctan((x−x₀)/γ)/π. 꼬리에서 atan 이 포화하므로 작은 쪽은 atan(1/z) 로 뒤집는다. */
  cauchy(x, { x0 = 0, gamma = 1 }) {
    if (!(gamma > 0) || Number.isNaN(x)) return NaN;
    if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
    const z = (x - x0) / gamma;
    // |z| 가 크면 0.5+atan(z)/π 는 1(또는 0)로 반올림된다. 항등식 atan(z) = π/2 − atan(1/z) 로 꼬리를 직접 계산.
    if (z > 1) return 1 - Math.atan(1 / z) / Math.PI;
    if (z < -1) return Math.atan(-1 / z) / Math.PI;
    return 0.5 + Math.atan(z) / Math.PI;
  },

  /** Weibull(a,b) — F(x) = 1 − e^(−a x^b) */
  weibull(x, { a = 1, b = 1 }) {
    if (!(a > 0) || !(b > 0) || Number.isNaN(x)) return NaN;
    if (x <= 0) return 0;
    if (!Number.isFinite(x)) return 1;
    return -Math.expm1(-a * Math.pow(x, b));
  },

  /** DE(0,λ) — F(x) = ½e^(λx) (x≤0), 1 − ½e^(−λx) (x>0) */
  dblexp(x, { lambda = 1 }) {
    if (!(lambda > 0) || Number.isNaN(x)) return NaN;
    if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
    return x <= 0 ? 0.5 * Math.exp(lambda * x) : 1 - 0.5 * Math.exp(-lambda * x);
  },
};

export function getCdf(id) {
  return Object.prototype.hasOwnProperty.call(cdf, id) ? cdf[id] : null;
}
