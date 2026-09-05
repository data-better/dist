// 이론 모멘트 — 평균·분산·왜도.
// 존재하지 않으면 null 을 반환한다. CLT 시뮬레이터가 이 값으로 전제 위반을 판정하므로 정확해야 한다.
//   t(1): 평균 null, 분산 null (코시)
//   t(2): 평균 0,    분산 null
//   t(3): 평균 0,    분산 3,   왜도 null (왜도는 n>3 에서만 존재)
//   Cauchy: 전부 null

import { lgamma } from './special.js';

export const moments = {
  normal: ({ mu = 0, sigma = 1 }) => ({ mean: mu, variance: sigma * sigma, skewness: 0 }),
  stdnormal: () => ({ mean: 0, variance: 1, skewness: 0 }),

  lognormal: ({ mu = 0, sigma = 1 }) => {
    const s2 = sigma * sigma;
    const m = Math.exp(mu + s2 / 2);
    const v = (Math.exp(s2) - 1) * Math.exp(2 * mu + s2);
    const sk = (Math.exp(s2) + 2) * Math.sqrt(Math.exp(s2) - 1);
    return { mean: m, variance: v, skewness: sk };
  },

  // rate 모수화: 평균 r/λ, 분산 r/λ², 왜도 2/√r
  gamma: ({ r = 1, lambda = 1 }) => ({
    mean: r / lambda, variance: r / (lambda * lambda), skewness: 2 / Math.sqrt(r),
  }),

  exponential: ({ lambda = 1 }) => ({
    mean: 1 / lambda, variance: 1 / (lambda * lambda), skewness: 2,
  }),

  chisq: ({ m = 1 }) => ({
    mean: m, variance: 2 * m, skewness: Math.sqrt(8 / m),
  }),

  beta: ({ alpha = 1, beta = 1 }) => {
    const s = alpha + beta;
    const mean = alpha / s;
    const variance = (alpha * beta) / (s * s * (s + 1));
    const skewness = (2 * (beta - alpha) * Math.sqrt(s + 1)) /
      ((s + 2) * Math.sqrt(alpha * beta));
    return { mean, variance, skewness };
  },

  t: ({ n = 1 }) => ({
    mean: n > 1 ? 0 : null,
    variance: n > 2 ? n / (n - 2) : null,
    skewness: n > 3 ? 0 : null,
  }),

  f: ({ r1 = 1, r2 = 1 }) => {
    const mean = r2 > 2 ? r2 / (r2 - 2) : null;
    let variance = null;
    if (r2 > 4) {
      variance = (2 * r2 * r2 * (r1 + r2 - 2)) /
        (r1 * (r2 - 2) * (r2 - 2) * (r2 - 4));
    }
    let skewness = null;
    if (r2 > 6) {
      skewness = ((2 * r1 + r2 - 2) * Math.sqrt(8 * (r2 - 4))) /
        ((r2 - 6) * Math.sqrt(r1 * (r1 + r2 - 2)));
    }
    return { mean, variance, skewness };
  },

  unif01: () => ({ mean: 0.5, variance: 1 / 12, skewness: 0 }),

  unifab: ({ a = 0, b = 1 }) => ({
    mean: (a + b) / 2, variance: ((b - a) ** 2) / 12, skewness: 0,
  }),

  // 코시: 어떤 적률도 존재하지 않는다. CLT 반례의 근거가 이 null 이다.
  cauchy: () => ({ mean: null, variance: null, skewness: null }),

  // Weibull(a,b): F=1−e^(−a x^b). Γ_k = Γ(1+k/b), 평균 a^(−1/b)Γ₁
  weibull: ({ a = 1, b = 1 }) => {
    if (!(a > 0) || !(b > 0)) return { mean: null, variance: null, skewness: null };
    const s = Math.pow(a, -1 / b);              // 척도
    const g = (k) => Math.exp(lgamma(1 + k / b));
    const g1 = g(1); const g2 = g(2); const g3 = g(3);
    const mean = s * g1;
    const variance = s * s * (g2 - g1 * g1);
    const sd = Math.sqrt(g2 - g1 * g1);
    const skewness = sd > 0 ? (g3 - 3 * g1 * g2 + 2 * g1 ** 3) / (sd ** 3) : null;
    return { mean, variance, skewness };
  },

  dblexp: ({ lambda = 1 }) => ({
    mean: 0, variance: 2 / (lambda * lambda), skewness: 0,
  }),
};

/**
 * @returns {{mean:number|null, variance:number|null, skewness:number|null}}
 */
export function getMoments(id, params = {}) {
  const fn = Object.prototype.hasOwnProperty.call(moments, id) ? moments[id] : null;
  return fn ? fn(params) : { mean: null, variance: null, skewness: null };
}

/** CLT 전제(유한 평균·분산)를 만족하는가 */
export function hasFiniteMoments(id, params = {}) {
  const m = getMoments(id, params);
  return m.mean !== null && m.variance !== null && Number.isFinite(m.variance);
}
