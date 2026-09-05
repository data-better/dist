// 특수함수 — 감마·베타 계열 분포의 PDF/CDF 계산에 필요한 최소 집합.
// 외부 라이브러리 없이 자체 구현한다 (CLAUDE.md 절대 규칙).

const EPS = 1e-15;
const MAX_ITER = 300;
const LOG_SQRT_2PI = 0.9189385332046727;

/** Lanczos 계수 (g = 7, n = 9). Numerical Recipes 3rd ed. §6.1 */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/**
 * log Γ(x). Lanczos 근사(g=7, 9항). x < 0.5 에서는 반사공식을 쓴다.
 * @param {number} x
 * @returns {number} log Γ(x), x <= 0 인 극점에서는 Infinity
 */
export function lgamma(x) {
  if (!Number.isFinite(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x < 0.5) {
    // 반사공식: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log B(a,b) = log Γ(a) + log Γ(b) − log Γ(a+b) */
export function lbeta(a, b) {
  return lgamma(a) + lgamma(b) - lgamma(a + b);
}

/**
 * 오차함수의 여함수 erfc(x). 큰 |x| 에서도 자릿수 손실이 없도록
 * Chebyshev 유리함수 근사를 쓴다 (Numerical Recipes 3rd ed. §6.2, erfc_cheb).
 * 상대오차 ~1.2e-7 수준이나, 아래 정규 CDF는 이를 다시 정밀화해 쓴다.
 */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
    6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
    9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13,
    3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
  ];
  let d = 0, dd = 0;
  for (let j = cof.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + cof[j];
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

/** 오차함수 erf(x) */
export function erf(x) {
  return 1 - erfc(x);
}

/**
 * 정규화 하부 불완전감마 P(s, x) = γ(s,x)/Γ(s).
 * x < s+1 이면 급수 전개, 그 외에는 연분수(수정 Lentz).
 * Numerical Recipes 3rd ed. §6.2
 */
export function lowerRegGamma(s, x) {
  if (Number.isNaN(x)) return NaN;
  if (!(s > 0) || x < 0 || !Number.isFinite(x)) return x >= 0 && s > 0 ? 1 : NaN;
  if (x === 0) return 0;
  if (x < s + 1) return gserSeries(s, x);
  return 1 - gcfContinued(s, x);
}

/**
 * 정규화 상부 불완전감마 Q(s, x) = 1 − P(s, x).
 * **1 − P 로 계산하면 안 된다.** 꼬리에서 P 가 1에 붙어 자릿수가 통째로 사라진다
 * (예: 포아송 λ=60 의 P(X≤0)=e^-60≈8.8e-27 이 0 으로 뭉개진다).
 * 연분수 경로는 Q 를 직접 주므로 그쪽을 그대로 쓴다.
 */
export function upperRegGamma(s, x) {
  if (Number.isNaN(x)) return NaN;
  if (!(s > 0) || x < 0 || !Number.isFinite(x)) return x >= 0 && s > 0 ? 0 : NaN;
  if (x === 0) return 1;
  if (x < s + 1) return 1 - gserSeries(s, x);
  return gcfContinued(s, x);      // Q 를 직접 계산 — 뺄셈 없음
}

/** 급수 전개 경로. x < s+1 에서 빠르게 수렴한다. */
function gserSeries(s, x) {
  let ap = s;
  let sum = 1 / s;
  let del = sum;
  for (let n = 0; n < MAX_ITER; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) {
      return sum * Math.exp(-x + s * Math.log(x) - lgamma(s));
    }
  }
  console.warn(`[special] gserSeries 반복 상한 도달: s=${s}, x=${x}`);
  return sum * Math.exp(-x + s * Math.log(x) - lgamma(s));
}

/** 연분수 경로(수정 Lentz). x >= s+1 에서 빠르게 수렴한다. Q(s,x)를 반환. */
function gcfContinued(s, x) {
  const FPMIN = Number.MIN_VALUE / EPS;
  let b = x + 1 - s;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
    if (i === MAX_ITER) console.warn(`[special] gcfContinued 반복 상한 도달: s=${s}, x=${x}`);
  }
  return Math.exp(-x + s * Math.log(x) - lgamma(s)) * h;
}

/**
 * 정규화 불완전베타 I_x(a, b).
 * x > (a+1)/(a+b+2) 이면 대칭관계 I_x(a,b) = 1 − I_{1−x}(b,a) 로 전환한다.
 * Numerical Recipes 3rd ed. §6.4
 */
export function regIncBeta(a, b, x) {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (!(a > 0) || !(b > 0)) return NaN;
  // front(p,q,y) = y^p (1−y)^q / B(p,q) — 로그 스케일에서 계산 후 exp
  const front = (p, q, y) =>
    Math.exp(p * Math.log(y) + q * Math.log(1 - y) - lbeta(p, q));
  if (x < (a + 1) / (a + b + 2)) {
    return (front(a, b, x) * betacf(a, b, x)) / a;
  }
  return 1 - (front(b, a, 1 - x) * betacf(b, a, 1 - x)) / b;
}

/** 불완전베타 연분수(수정 Lentz) */
function betacf(a, b, x) {
  const FPMIN = Number.MIN_VALUE / EPS;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
    if (m === MAX_ITER) console.warn(`[special] betacf 반복 상한 도달: a=${a}, b=${b}, x=${x}`);
  }
  return h;
}

/** 표준정규 CDF Φ(z). erfc 기반이며 양쪽 꼬리 모두 안정적이다. */
export function normalCdfStd(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** 표준정규 PDF φ(z) */
export function normalPdfStd(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * 표준정규 분위수 Φ⁻¹(p). Acklam 근사 + Halley 1회 정련.
 * 플롯 축 범위 계산에 쓴다.
 */
export function normalQuantileStd(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2,
    1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2,
    6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pl = 0.02425;
  let q, r, x;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    q = p - 0.5; r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley 정련 1회
  const e = normalCdfStd(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}
