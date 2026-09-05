// 난수 생성 — 이 사이트가 가르치는 관계 그대로 구현한다.
// 코드가 교재 내용과 일치하면 코드 자체가 학습 자료가 된다 (PRD §7.3).
//   beta   ← 감마 두 개의 비 (E11)
//   chisq  ← Gamma(m/2, 1/2) (E8)
//   t      ← Z / √(χ²(n)/n) (E27)
//   f      ← (χ²(r₁)/r₁)/(χ²(r₂)/r₂) (E20)
//   exp    ← −ln(U)/λ (E13)

/**
 * mulberry32 — seedable 32bit PRNG. 같은 seed면 항상 같은 수열.
 * @param {number} seed
 * @returns {() => number} [0,1) 난수 함수
 */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marsaglia polar — 표준정규 1개 */
export function sampleStdNormal(rng) {
  let u, v, s;
  do {
    u = 2 * rng() - 1;
    v = 2 * rng() - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt((-2 * Math.log(s)) / s);
}

/**
 * Marsaglia–Tsang 감마 생성 (shape r, rate λ).
 * r < 1 이면 boost: G(r) = G(r+1) · U^(1/r)
 */
export function sampleGamma(rng, r, lambda = 1) {
  if (r < 1) {
    const u = rng();
    return sampleGamma(rng, r + 1, lambda) * Math.pow(u === 0 ? Number.MIN_VALUE : u, 1 / r);
  }
  const d = r - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = sampleStdNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) return (d * v) / lambda;
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return (d * v) / lambda;
  }
}

export const sample = {
  normal: (rng, { mu = 0, sigma = 1 }) => mu + sigma * sampleStdNormal(rng),
  stdnormal: (rng) => sampleStdNormal(rng),
  lognormal: (rng, { mu = 0, sigma = 1 }) => Math.exp(mu + sigma * sampleStdNormal(rng)),
  gamma: (rng, { r = 1, lambda = 1 }) => sampleGamma(rng, r, lambda),

  // E13: 역변환 표본추출
  exponential: (rng, { lambda = 1 }) => {
    const u = rng();
    return -Math.log(u === 0 ? Number.MIN_VALUE : u) / lambda;
  },

  // E8: χ²(m) = Gamma(m/2, rate 1/2)
  chisq: (rng, { m = 1 }) => sampleGamma(rng, m / 2, 0.5),

  // E11: X₁/(X₁+X₂), 동일 rate
  beta: (rng, { alpha = 1, beta = 1 }) => {
    const x1 = sampleGamma(rng, alpha, 1);
    const x2 = sampleGamma(rng, beta, 1);
    const s = x1 + x2;
    return s > 0 ? x1 / s : 0.5;
  },

  // E27: Z / √(χ²(n)/n)
  t: (rng, { n = 1 }) => {
    const z = sampleStdNormal(rng);
    const c = sampleGamma(rng, n / 2, 0.5);
    return z / Math.sqrt(c / n);
  },

  // E20: (χ²(r₁)/r₁)/(χ²(r₂)/r₂)
  f: (rng, { r1 = 1, r2 = 1 }) => {
    const c1 = sampleGamma(rng, r1 / 2, 0.5) / r1;
    const c2 = sampleGamma(rng, r2 / 2, 0.5) / r2;
    return c1 / c2;
  },

  unif01: (rng) => rng(),
  unifab: (rng, { a = 0, b = 1 }) => a + (b - a) * rng(),

  // E32: 두 표준정규의 비 Z₁/Z₂ (관계도가 가르치는 그 변환 그대로)
  cauchy: (rng, { x0 = 0, gamma = 1 }) => {
    let z2;
    do { z2 = sampleStdNormal(rng); } while (z2 === 0);
    return x0 + gamma * (sampleStdNormal(rng) / z2);
  },

  // E38: Exp(a) 의 1/b 승
  weibull: (rng, { a = 1, b = 1 }) => {
    const u = rng();
    const e = -Math.log(u === 0 ? Number.MIN_VALUE : u) / a;   // Exp(a)
    return Math.pow(e, 1 / b);
  },

  // E40: 독립인 두 Exp(λ) 의 차
  dblexp: (rng, { lambda = 1 }) => {
    const u1 = rng(); const u2 = rng();
    const e1 = -Math.log(u1 === 0 ? Number.MIN_VALUE : u1) / lambda;
    const e2 = -Math.log(u2 === 0 ? Number.MIN_VALUE : u2) / lambda;
    return e1 - e2;
  },
};

/** CLT 시뮬레이터 전용 원천분포 3종 (PRD F4.7.2). 관계도 노드로는 추가하지 않는다. */
export const cltExtraSamplers = {
  // 양봉 혼합: 0.5·N(−2,0.5) + 0.5·N(2,0.5)
  bimodal: (rng) => (rng() < 0.5 ? -2 : 2) + 0.5 * sampleStdNormal(rng),
  // 극단 왜도: Gamma(r=0.5, λ=1)
  skewed: (rng) => sampleGamma(rng, 0.5, 1),
  // 이산 균등(주사위)
  dice: (rng) => Math.floor(6 * rng()) + 1,
};

export function getSampler(id) {
  if (Object.prototype.hasOwnProperty.call(sample, id)) return sample[id];
  if (Object.prototype.hasOwnProperty.call(cltExtraSamplers, id)) return cltExtraSamplers[id];
  return null;
}
