// 검증 전용 수치적분기 — 앱 코드가 아니라 test/ 하네스의 일부다.
//
// 왜 심프슨이 아닌가: 이 프로젝트의 밀도함수 중 여럿이 경계에서 발산한다
// (Gamma r<1, χ²(1), Beta(0.5,0.5) 는 x→0 에서 f→∞). 적분값은 유한하지만
// 균등격자 심프슨은 특이점 근방을 크게 과대평가한다.
// tanh-sinh(이중지수) 구적법은 끝점 특이점을 지수적으로 눌러 주므로 이 경우에 맞는다.

/**
 * tanh-sinh 구적법으로 ∫_a^b f(x) dx 를 계산한다.
 * 변수변환 x = (a+b)/2 + (b−a)/2 · tanh(π/2 · sinh(t)) 를 쓰면
 * 끝점에서 가중치가 이중지수적으로 0에 수렴해 적분 가능한 특이점을 흡수한다.
 * @param {(x:number)=>number} f
 * @param {number} a 유한 하한
 * @param {number} b 유한 상한
 * @param {number} level 세분 단계 (기본 12 ≈ 8000점)
 */
export function tanhSinh(f, a, b, level = 12) {
  if (!(b > a)) return 0;
  const c = (a + b) / 2;
  const half = (b - a) / 2;
  const hMax = 4.0;               // |t| 상한. 매우 날카로운 특이점까지 흡수하려면 이 정도가 필요하다
  const n = 1 << level;
  const h = (2 * hMax) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const t = -hMax + i * h;
    const sinhT = Math.sinh(t);
    const u = (Math.PI / 2) * sinhT;
    const x = c + half * Math.tanh(u);
    if (x <= a || x >= b) continue;            // 끝점은 건너뛴다 (특이점 회피)
    const coshU = Math.cosh(u);
    const w = ((Math.PI / 2) * Math.cosh(t)) / (coshU * coshU);
    const v = f(x);
    if (!Number.isFinite(v)) continue;         // 비유한값은 무시
    const term = w * v * half * h;
    if (Number.isFinite(term)) sum += term;
  }
  return sum;
}

/**
 * 반무한 구간 ∫_a^∞ f(x) dx. x = a + u/(1−u), u ∈ (0,1) 로 사상한 뒤 tanh-sinh.
 */
export function tanhSinhHalfLine(f, a, level = 12) {
  const g = (u) => {
    const d = 1 - u;
    return f(a + u / d) / (d * d);
  };
  return tanhSinh(g, 0, 1, level);
}

/** 전 실수축 ∫_{-∞}^{∞}. x = u/(1−u²) 사상. */
export function tanhSinhLine(f, level = 12) {
  const g = (u) => {
    const d = 1 - u * u;
    return (f(u / d) * (1 + u * u)) / (d * d);
  };
  return tanhSinh(g, -1, 1, level);
}
