// 엣지 연동 시뮬레이션 데모 (PRD F4.1–F4.6).
//
// 각 관계에 대해 몬테카를로 표본을 생성하고, 밀도 정규화 히스토그램과 이론 PDF를 겹쳐 그린다.
// 레시피는 이 사이트가 가르치는 변환을 **그대로** 코드로 옮긴 것이다.
// 사용자에게 보이는 문자열은 여기 두지 않고 data/relations.json 의 simulation 필드에서 온다.

import { $, el, fmtNum, rafThrottle } from '../util/dom.js';
import { texToHtml } from '../util/latex.js';
import { density as pdf, momentsOf as getMoments, isDiscrete }
  from '../distributions/registry.js';
import { createRng, sample, sampleGamma, sampleStdNormal } from '../distributions/sample.js';
import { sampleD } from '../distributions/discrete.js';
import { lgamma } from '../distributions/special.js';
import { CurvePlot, drawStems } from '../plot/curve.js';
import { Histogram, drawHistogram } from '../plot/histogram.js';
import { defaultXRange } from '../plot/range.js';

const SAMPLE_SIZES = [100, 1000, 10000, 100000];

/**
 * 레시피 레지스트리.
 * 각 레시피는 모수 p 와 난수원 rng 를 받아 { draw, target } 을 돌려준다.
 *   draw()  — 변환을 적용한 표본 하나
 *   target  — 이론 분포 { id, params }
 *   extra   — (선택) 대조용 보조 곡선 [{ id, params, labelKo }]
 */
export const recipes = {
  // E1: Y = e^X
  normalToLognormal: (p, rng) => ({
    draw: () => Math.exp(sample.normal(rng, { mu: p.mu, sigma: p.sigma })),
    target: { id: 'lognormal', params: { mu: p.mu, sigma: p.sigma } },
  }),

  // E9: Y = ΣXᵢ, Xᵢ ~ Exp(λ)
  sumExp: (p, rng) => ({
    draw: () => {
      let s = 0;
      for (let i = 0; i < p.n; i++) s += sample.exponential(rng, { lambda: p.lambda });
      return s;
    },
    target: { id: 'gamma', params: { r: p.n, lambda: p.lambda } },
  }),

  // E10: Y = min(Xᵢ) ~ Exp(nλ)
  minExp: (p, rng) => ({
    draw: () => {
      let m = Infinity;
      for (let i = 0; i < p.n; i++) {
        const v = sample.exponential(rng, { lambda: p.lambda });
        if (v < m) m = v;
      }
      return m;
    },
    target: { id: 'exponential', params: { lambda: p.n * p.lambda } },
    extra: [{ id: 'exponential', params: { lambda: p.lambda }, labelKo: 'Exp(λ) — 최솟값을 취하지 않았다면' }],
  }),

  // E11: Y = X₁/(X₁+X₂)
  gammaToBeta: (p, rng) => ({
    draw: () => {
      const a = sampleGamma(rng, p.alpha, 1);
      const b = sampleGamma(rng, p.beta, 1);
      return a / (a + b);
    },
    target: { id: 'beta', params: { alpha: p.alpha, beta: p.beta } },
  }),

  // E13: Y = −ln(U)/λ — 역변환 표본추출
  invTransformExp: (p, rng) => ({
    draw: () => {
      const u = rng();
      return -Math.log(u === 0 ? Number.MIN_VALUE : u) / p.lambda;
    },
    target: { id: 'exponential', params: { lambda: p.lambda } },
  }),

  // E14: Y = e^(−λX)
  expToUnif: (p, rng) => ({
    draw: () => Math.exp(-p.lambda * sample.exponential(rng, { lambda: p.lambda })),
    target: { id: 'unif01', params: {} },
  }),

  // E19: Y = X₁ + X₂
  sumChisq: (p, rng) => ({
    draw: () => sample.chisq(rng, { m: p.m1 }) + sample.chisq(rng, { m: p.m2 }),
    target: { id: 'chisq', params: { m: p.m1 + p.m2 } },
  }),

  // E20: Y = (X₁/r₁)/(X₂/r₂)
  chisqToF: (p, rng) => ({
    draw: () => (sample.chisq(rng, { m: p.r1 }) / p.r1) / (sample.chisq(rng, { m: p.r2 }) / p.r2),
    target: { id: 'f', params: { r1: p.r1, r2: p.r2 } },
  }),

  // E21: Y = T²
  tSquared: (p, rng) => ({
    draw: () => { const t = sample.t(rng, { n: p.n }); return t * t; },
    target: { id: 'f', params: { r1: 1, r2: p.n } },
  }),

  // E23: 표준화한 감마 → N(0,1)
  gammaNormalApprox: (p, rng) => {
    const m = getMoments('gamma', { r: p.r, lambda: p.lambda });
    const sd = Math.sqrt(m.variance);
    return {
      draw: () => (sampleGamma(rng, p.r, p.lambda) - m.mean) / sd,
      target: { id: 'stdnormal', params: {} },
    };
  },

  // E24: t(n) → N(0,1)
  tToNormal: (p, rng) => ({
    draw: () => sample.t(rng, { n: p.n }),
    target: { id: 'stdnormal', params: {} },
    extra: [{ id: 't', params: { n: p.n }, labelKo: 't(n) 이론 밀도' }],
  }),

  // E26: Y = ΣZᵢ² ~ χ²(m)
  sumSqNormal: (p, rng) => ({
    draw: () => {
      let s = 0;
      for (let i = 0; i < p.m; i++) { const z = sampleStdNormal(rng); s += z * z; }
      return s;
    },
    target: { id: 'chisq', params: { m: p.m } },
  }),

  // E27: T = Z/√(V/n)
  defineT: (p, rng) => ({
    draw: () => {
      const z = sampleStdNormal(rng);
      const v = sample.chisq(rng, { m: p.n });
      return z / Math.sqrt(v / p.n);
    },
    target: { id: 't', params: { n: p.n } },
    extra: [{ id: 'stdnormal', params: {}, labelKo: 'N(0,1) — 비교용' }],
  }),

  // E28: Y = 1 − X
  betaFlip: (p, rng) => ({
    draw: () => 1 - sample.beta(rng, { alpha: p.alpha, beta: p.beta }),
    target: { id: 'beta', params: { alpha: p.beta, beta: p.alpha } },
    extra: [{ id: 'beta', params: { alpha: p.alpha, beta: p.beta }, labelKo: '원래 Beta(α,β)' }],
  }),

  // E29: Y = 1/X
  fRecip: (p, rng) => ({
    draw: () => 1 / sample.f(rng, { r1: p.r1, r2: p.r2 }),
    target: { id: 'f', params: { r1: p.r2, r2: p.r1 } },
  }),

  // E30: Y = (r₂/r₁)·X/(1−X)
  betaToF: (p, rng) => ({
    draw: () => {
      const x = sample.beta(rng, { alpha: p.r1 / 2, beta: p.r2 / 2 });
      return (p.r2 / p.r1) * (x / (1 - x));
    },
    target: { id: 'f', params: { r1: p.r1, r2: p.r2 } },
  }),

  // E32: Y = Z₁/Z₂ ~ Cauchy(0,1)
  cauchyRatio: (p, rng) => ({
    draw: () => {
      let z2;
      do { z2 = sampleStdNormal(rng); } while (z2 === 0);
      return sampleStdNormal(rng) / z2;
    },
    target: { id: 'cauchy', params: { x0: 0, gamma: 1 } },
  }),

  // E36: Y = X^(1/b), X ~ Exp(a)
  expToWeibull: (p, rng) => ({
    draw: () => Math.pow(sample.exponential(rng, { lambda: p.a }), 1 / p.b),
    target: { id: 'weibull', params: { a: p.a, b: p.b } },
  }),

  // E38: Y = X₁ − X₂, 둘 다 Exp(λ)
  expDiffToLaplace: (p, rng) => ({
    draw: () => sample.exponential(rng, { lambda: p.lambda })
      - sample.exponential(rng, { lambda: p.lambda }),
    target: { id: 'dblexp', params: { lambda: p.lambda } },
  }),

  // E39: Y = |X|, X ~ DE(0,λ)
  laplaceAbsToExp: (p, rng) => ({
    draw: () => Math.abs(sample.dblexp(rng, { lambda: p.lambda })),
    target: { id: 'exponential', params: { lambda: p.lambda } },
  }),

  // ── 이산 관계 ────────────────────────────────────────────────────────────
  // D22: 합을 조건으로 준 포아송 → 이항.
  // 조건부분포를 정의 그대로 재현하려면 X₁+X₂ = n 인 경우만 남기는 기각표본추출이 맞다.
  // 다만 λ₁+λ₂ 가 n 에서 멀면 채택률 P(Pois(λ₁+λ₂)=n) 이 급락하므로,
  // 그 확률을 미리 계산해 시도 횟수를 정하고 총 계산량을 묶어 둔다.
  // 끝내 실패한 표본은 NaN 이 되고 히스토그램에서 자동으로 제외된다.
  poisCondBinom: (p, rng) => {
    const lam = p.lambda1 + p.lambda2;
    const pAcc = Math.exp(-lam + p.n * Math.log(lam) - lgamma(p.n + 1));
    const tries = pAcc < 5e-4 ? 200 : Math.min(2000, Math.max(40, Math.ceil(25 / pAcc)));
    return {
      draw: () => {
        for (let i = 0; i < tries; i++) {
          const x1 = sampleD.poisson(rng, { lambda: p.lambda1 });
          const x2 = sampleD.poisson(rng, { lambda: p.lambda2 });
          if (x1 + x2 === p.n) return x1;
        }
        return NaN;
      },
      target: { id: 'binomial', params: { n: p.n, p: p.lambda1 / lam } },
    };
  },

  // D1: Y = Σ Bern(p) ~ B(n,p)
  sumBernoulli: (p, rng) => ({
    draw: () => {
      let s = 0;
      for (let i = 0; i < p.n; i++) s += sampleD.bernoulli(rng, { p: p.p });
      return s;
    },
    target: { id: 'binomial', params: { n: p.n, p: p.p } },
  }),

  // D4: 첫 성공이 나온 시행 번호
  firstSuccess: (p, rng) => ({
    draw: () => {
      let k = 1;
      while (sampleD.bernoulli(rng, { p: p.p }) === 0) k++;
      return k;
    },
    target: { id: 'geometric', params: { p: p.p } },
  }),

  // D5: Y = Σ Geom(p) ~ NB(r,p)
  sumGeometric: (p, rng) => ({
    draw: () => {
      let s = 0;
      for (let i = 0; i < p.r; i++) s += sampleD.geometric(rng, { p: p.p });
      return s;
    },
    target: { id: 'negbinomial', params: { r: p.r, p: p.p } },
  }),

  // D7: λ=np 를 고정한 채 n 을 키우면 포아송에 수렴
  binomToPoisson: (p, rng) => ({
    draw: () => sampleD.binomial(rng, { n: p.n, p: Math.min(1, p.lambda / p.n) }),
    target: { id: 'poisson', params: { lambda: p.lambda } },
    extra: [{ id: 'binomial', params: { n: p.n, p: Math.min(1, p.lambda / p.n) }, labelKo: 'B(n, λ/n) 이론' }],
  }),

  // D9: K/N 을 고정한 채 N 을 키우면 이항에 수렴
  hyperToBinom: (p, rng) => {
    const K = Math.round(p.N / 2);
    return {
      draw: () => sampleD.hypergeometric(rng, { N: p.N, K, n: p.n }),
      target: { id: 'binomial', params: { n: p.n, p: K / p.N } },
      extra: [{ id: 'hypergeometric', params: { N: p.N, K, n: p.n }, labelKo: '초기하 이론' }],
    };
  },

  // E31: 확률적분변환 Y = F_X(X) — 원천분포를 바꿔 가며 항상 균등이 됨을 본다
  pit: (p, rng, ctx) => {
    const src = ctx?.source || { id: 'stdnormal', params: {} };
    const F = ctx.cdf[src.id];
    const smp = sample[src.id];
    return {
      draw: () => F(smp(rng, src.params), src.params),
      target: { id: 'unif01', params: {} },
    };
  },
};

/** 시뮬레이션 섹션을 만들어 반환한다. mount() 를 호출해야 실제로 그려진다. */
export class SimulationSection {
  constructor(rel, { dists, cdf }) {
    this.rel = rel;
    this.spec = rel.simulation;
    this.dists = dists;
    this.cdf = cdf;
    this.sizeIdx = 2;              // 기본 10,000
    this.seed = 20260904;
    this.fixedSeed = true;
    this.params = Object.fromEntries((this.spec.controls || []).map((c) => [c.symbol, c.default]));
    this.sourceId = 'stdnormal';   // pit 전용
  }

  build() {
    const spec = this.spec;
    const wrap = el('section', { class: 'sim' }, [
      el('div', { class: 'sim-head' }, [
        el('h3', { text: '시뮬레이션' }),
        el('span', { class: 'sim-count', id: 'sim-count' }),
      ]),
      el('p', { class: 'sim-title', text: spec.titleKo }),
      el('p', { class: 'muted sim-note', text: spec.noteKo }),
      el('div', { class: 'sim-controls', id: 'sim-controls' }),
      el('div', { class: 'plot-host', id: 'sim-plot' }),
      el('div', { class: 'plot-legend', id: 'sim-legend' }),
      el('div', { class: 'sim-stats', id: 'sim-stats' }),
      el('p', { class: 'visually-hidden', id: 'sim-a11y', 'aria-live': 'polite' }),
    ]);
    this.host = wrap;
    return wrap;
  }

  mount() {
    this.plot = new CurvePlot($('#sim-plot', this.host), { height: 220 });
    this._buildControls();
    this.redraw = rafThrottle(() => this.run());
    this.run();
  }

  _buildControls() {
    const box = $('#sim-controls', this.host);
    box.innerHTML = '';

    // 확률적분변환 데모는 원천분포를 직접 고르게 한다
    if (this.spec.sourcePicker) {
      const sel = el('select', {
        'aria-label': '원천분포',
        onchange: (e) => { this.sourceId = e.target.value; this.run(); },
      });
      for (const d of this.dists) {
        if (d.id === 'unif01') continue;
        sel.appendChild(el('option', { value: d.id, text: d.nameKo, selected: d.id === this.sourceId ? '' : null }));
      }
      box.appendChild(el('label', { class: 'sim-ctrl' }, [
        el('span', { class: 'sim-ctrl-name', text: '원천분포' }), sel,
      ]));
    }

    for (const c of this.spec.controls || []) {
      const out = el('output', { class: 'ctrl-val', text: String(c.default) });
      const range = el('input', {
        type: 'range', min: c.min, max: c.max, step: c.step, value: c.default,
        class: 'ctrl-range', 'aria-label': `${c.nameKo} 슬라이더`,
        oninput: (e) => {
          this.params[c.symbol] = Number(e.target.value);
          out.textContent = e.target.value;
          this.redraw();
        },
      });
      box.appendChild(el('div', { class: 'sim-ctrl' }, [
        el('span', { class: 'sim-ctrl-name', text: c.nameKo }), range, out,
      ]));
    }

    const sizeBtns = SAMPLE_SIZES.map((n, i) => el('button', {
      class: `seg${i === this.sizeIdx ? ' on' : ''}`, type: 'button',
      text: n.toLocaleString('ko-KR'),
      onclick: (e) => {
        this.sizeIdx = i;
        [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target));
        this.run();
      },
    }));

    box.appendChild(el('div', { class: 'sim-actions' }, [
      el('span', { class: 'sim-ctrl-name', text: '표본 수' }),
      el('div', { class: 'segmented', role: 'group', 'aria-label': '표본 수' }, sizeBtns),
      el('label', { class: 'chk' }, [
        el('input', {
          type: 'checkbox', checked: '',
          onchange: (e) => { this.fixedSeed = e.target.checked; },
        }),
        el('span', { text: 'seed 고정' }),
      ]),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: '다시 생성',
        onclick: () => {
          if (!this.fixedSeed) this.seed = (Math.random() * 2 ** 31) | 0;
          this.run();
        },
      }),
      el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button', text: '애니메이션',
        onclick: () => this.animate(),
      }),
    ]));
  }

  _recipe() {
    const fn = recipes[this.spec.recipe];
    if (!fn) {
      console.warn(`[simulation] 알 수 없는 레시피: ${this.spec.recipe}`);
      return null;
    }
    const src = this.dists.find((d) => d.id === this.sourceId);
    const ctx = {
      cdf: this.cdf,
      source: src ? { id: src.id, params: Object.fromEntries((src.params || []).map((p) => [p.symbol, p.default])) } : null,
    };
    return fn(this.params, this.rng, ctx);
  }

  /** 히스토그램 축 범위 — 이론 분포 기준으로 잡되 표본 범위도 반영한다 */
  _range(target) {
    const tDist = this.dists.find((d) => d.id === target.id);
    if (!tDist) return [0, 1];
    const r = defaultXRange(tDist, target.params);
    // 반직선 지지집합은 하한을 0으로 고정
    if (tDist.support.type === 'halfline') return [Math.max(0, r[0]), r[1]];
    return r;
  }

  /** 대상이 이산이면 정수 하나가 빈 하나가 되도록 맞춘다 */
  _isDiscreteTarget(target) {
    return !!this.dists.find((d) => d.id === target.id)?.discrete;
  }

  run() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.rng = createRng(this.seed);
    const rec = this._recipe();
    if (!rec) return;
    const N = SAMPLE_SIZES[this.sizeIdx];
    const range = this._range(rec.target);
    // 이산 대상은 정수 한 칸이 빈 한 칸이 되어야 막대가 실제 확률과 맞는다
    const bins = this._isDiscreteTarget(rec.target)
      ? Math.max(1, Math.round(range[1] - range[0])) : 56;
    this.hist = new Histogram(bins).reset(range[0], range[1]);
    for (let i = 0; i < N; i++) this.hist.push(rec.draw());
    this._render(rec, N);
  }

  animate() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.rng = createRng(this.seed);
    const rec = this._recipe();
    if (!rec) return;
    const N = SAMPLE_SIZES[this.sizeIdx];
    const range = this._range(rec.target);
    const bins = this._isDiscreteTarget(rec.target)
      ? Math.max(1, Math.round(range[1] - range[0])) : 56;
    this.hist = new Histogram(bins).reset(range[0], range[1]);
    let done = 0;
    const per = Math.max(20, Math.floor(N / 80));
    const step = () => {
      const end = Math.min(N, done + per);
      for (let i = done; i < end; i++) this.hist.push(rec.draw());
      done = end;
      this._render(rec, done);
      if (done < N) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _render(rec, n) {
    const h = this.hist;
    const discreteTarget = this._isDiscreteTarget(rec.target);
    const tPdf = (x) => pdf[rec.target.id](x, rec.target.params);
    // 이산 대상은 곡선을 그리면 안 된다 — 정의되지 않은 점 사이를 이은 것처럼 보인다
    const series = discreteTarget ? []
      : [{ fn: tPdf, color: 'var(--fg)', width: 2.2, dash: [5, 4] }];
    if (!discreteTarget) {
      for (const e of rec.extra || []) {
        series.push({ fn: (x) => pdf[e.id](x, e.params), color: 'var(--pin-2)', width: 1.6, muted: true });
      }
    }
    const yMax = Math.max(h.maxDensity, maxOf(tPdf, [h.lo, h.hi], discreteTarget ? null : 300)) * 1.2 || 1;
    this.plot.setRanges([h.lo, h.hi], [0, yMax]).setSeries(series).draw();
    drawHistogram(this.plot, h, { color: 'var(--accent)', alpha: 0.45 });
    if (discreteTarget) {
      const sup = [Math.ceil(h.lo), Math.floor(h.hi)];
      for (const e of rec.extra || []) {
        drawStems(this.plot, (k) => pdf[e.id](k, e.params), sup,
          { color: 'var(--pin-2)', width: 2, alpha: 0.75 });
      }
      drawStems(this.plot, tPdf, sup, { color: 'var(--fg)', width: 2.5 });
    }

    $('#sim-count', this.host).textContent = `표본 ${n.toLocaleString('ko-KR')}개`;

    // 범례
    const lg = $('#sim-legend', this.host);
    lg.innerHTML = '';
    lg.append(
      legendItem('var(--accent)', '시뮬레이션 (히스토그램)', true),
      legendItem('var(--fg)', `이론 ${labelOf(rec.target)}`),
      ...(rec.extra || []).map((e) => legendItem('var(--pin-2)', e.labelKo)),
    );

    // 적합도 요약 — 형식적 검정은 범위 외(PRD §10). 표본 vs 이론 요약값만 비교한다.
    const m = getMoments(rec.target.id, rec.target.params);
    const rows = [
      ['표본평균', fmtNum(h.mean, 4), m.mean === null ? '존재하지 않음' : fmtNum(m.mean, 4)],
      ['표본분산', fmtNum(h.variance, 4), m.variance === null ? '존재하지 않음' : fmtNum(m.variance, 4)],
    ];
    $('#sim-stats', this.host).innerHTML =
      '<table class="sim-table"><thead><tr><th></th><th>시뮬레이션</th><th>이론</th></tr></thead><tbody>'
      + rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')
      + '</tbody></table>'
      + (h.under + h.over > 0
        ? `<p class="muted sim-clip">축 밖으로 벗어난 표본 ${(h.under + h.over).toLocaleString('ko-KR')}개 (꼬리가 두꺼운 분포에서는 정상입니다)</p>`
        : '');

    $('#sim-a11y', this.host).textContent =
      `${this.spec.titleKo}. 표본 ${n}개. 표본평균 ${fmtNum(h.mean, 4)}, `
      + `이론평균 ${m.mean === null ? '없음' : fmtNum(m.mean, 4)}.`;
  }
}

function legendItem(color, text, solid = false) {
  return el('span', { class: 'legend-item' }, [
    el('i', {
      class: 'legend-swatch',
      style: `background:${color};${solid ? 'height:8px;opacity:.45' : ''}`,
    }),
    el('span', { text }),
  ]);
}

function labelOf(target) {
  const p = Object.entries(target.params).map(([k, v]) => `${k}=${v}`).join(', ');
  return p ? `${target.id}(${p})` : target.id;
}

/** n 이 null 이면 정수 점만 훑는다 (이산 대상) */
function maxOf(fn, [lo, hi], n = 300) {
  let m = 0;
  if (n === null) {
    for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
      const v = fn(k);
      if (Number.isFinite(v) && v > m) m = v;
    }
    return m;
  }
  for (let i = 0; i <= n; i++) {
    const v = fn(lo + ((hi - lo) * i) / n);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}
