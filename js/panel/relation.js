// 관계 상세 패널 (PRD F3) — 단계별 유도 아코디언, 극한 관계는 수렴 시연.

import { el, $, fmtNum, appendChildren, boldParts } from '../util/dom.js';
import { texToHtml } from '../util/latex.js';
import { density as pdf, cumulative as cdf, momentsOf as getMoments, isDiscrete }
  from '../distributions/registry.js';
import { CurvePlot, drawStems } from '../plot/curve.js';
import { defaultXRange, defaultYRange } from '../plot/range.js';

import { TYPE_KO } from './distribution.js';
import { SimulationSection } from './simulation.js';


const METHOD_KO = {
  cdf: 'CDF 기법', jacobian: '야코비안', mgf: '적률생성함수',
  substitution: '모수 대입', clt: '중심극한정리',
};

export class RelationPanel {
  constructor(host, { dists, rels, onSelectNode }) {
    this.host = host;
    this.dists = dists;
    this.rels = rels;
    this.byId = new Map(dists.map((d) => [d.id, d]));
    this.onSelectNode = onSelectNode;
  }

  show(id) {
    const r = this.rels.find((x) => x.id === id);
    if (!r) return;
    this.rel = r;
    this.step = 1;
    this._demo = null;
    this._sim = null;
    this._build();
  }

  _build() {
    const r = this.rel;
    const from = this.byId.get(r.from);
    const to = this.byId.get(r.to);

    this.host.innerHTML = '';
    appendChildren(this.host, [
      el('header', { class: 'panel-head' }, [
        el('div', { class: 'panel-kicker', text: `관계 ${r.id}` }),
        el('h2', { class: 'panel-title panel-title-rel' }, [
          el('button', { class: 'node-chip', type: 'button', html: texToHtml(from.notation), onclick: () => this.onSelectNode(from.id) }),
          el('span', { class: 'arrow', text: r.type === 'limit' ? '⇢' : '→' }),
          el('button', { class: 'node-chip', type: 'button', html: texToHtml(to.notation), onclick: () => this.onSelectNode(to.id) }),
        ]),
        el('div', { class: 'badges' }, [
          el('span', { class: `badge type-${r.type}`, text: TYPE_KO[r.type] }),
          el('span', { class: 'badge badge-method', text: METHOD_KO[r.derivationMethod] || '' }),
          r.isBinary ? el('span', { class: 'badge badge-binary', text: '이항 관계' }) : null,
          r.isAugmented ? el('span', { class: 'badge badge-aug', text: '보강' }) : null,
        ]),
      ]),
      el('p', { class: 'panel-desc' }, boldParts(r.summaryKo)),
      this._summaryCard(),
      r.isBinary ? el('p', { class: 'callout callout-info' }, [
        el('b', { text: '독립 확률변수 2개가 필요합니다. ' }),
        el('span', { text: '이 관계는 하나의 확률변수를 변환하는 것이 아니라, 서로 독립인 두 확률변수를 결합해 새 분포를 만듭니다.' }),
      ]) : null,
      r.note ? el('p', { class: 'callout callout-warn' }, [
        el('b', { text: '원본 다이어그램 대비 수정 — ' }), el('span', { text: r.note }),
      ]) : null,
      r.type === 'limit' && r.limitDemo ? this._limitDemo() : null,
      this._derivation(),
      r.simulation ? this._simulation() : null,
      r.isCltInstance || r.derivationMethod === 'clt' ? el('a', {
        class: 'btn btn-cta', href: `clt.html#/clt?source=${r.from}`,
        text: '일반 정리로 보기 — 중심극한정리 시뮬레이터 →',
      }) : null,
    ]);
    if (this._demo) this._demo();
    if (this._sim) this._sim.mount();
  }

  /** 관계에 딸린 시뮬레이션 데모 (PRD F4) */
  _simulation() {
    this._sim = new SimulationSection(this.rel, { dists: this.dists, cdf });
    return this._sim.build();
  }

  _summaryCard() {
    const r = this.rel;
    const rows = [];
    if (r.conditionLatex) rows.push(['조건', r.conditionLatex]);
    if (r.transformLatex) rows.push(['변환', r.transformLatex]);
    return el('dl', { class: 'def-block def-card' }, rows.map(([k, v]) =>
      el('div', { class: 'def-row' }, [el('dt', { text: k }), el('dd', { html: texToHtml(v) })])));
  }

  /** 극한 관계 — 유도 대신 수렴 시연을 우선 제공한다 (PRD F3.5) */
  _limitDemo() {
    const r = this.rel;
    const cfg = r.limitDemo;
    const src = this.byId.get(r.from);
    const wrap = el('section', { class: 'limit-demo' }, [
      el('h3', { text: '수렴 시연' }),
      el('p', { class: 'muted', text: '슬라이더를 밀면 회색 참조 곡선(극한 분포) 위로 겹쳐지는 과정을 볼 수 있습니다.' }),
      el('div', { class: 'ctrl' }, [
        el('label', { class: 'ctrl-label' }, [
          el('span', { html: texToHtml(r.conditionLatex || 'k') }),
          el('output', { class: 'ctrl-val', id: 'limit-val', text: String(cfg.from) }),
        ]),
        el('input', {
          type: 'range', min: cfg.from, max: cfg.to, step: 1, value: cfg.from,
          class: 'ctrl-range', id: 'limit-range', 'aria-label': '극한 모수 슬라이더',
        }),
      ]),
      el('div', { class: 'plot-host', id: 'limit-plot' }),
      el('p', { class: 'limit-note', id: 'limit-note' }),
    ]);

    this._demo = () => {
      const plot = new CurvePlot($('#limit-plot', this.host), { height: 220 });
      const range = $('#limit-range', this.host);
      const valEl = $('#limit-val', this.host);
      const note = $('#limit-note', this.host);

      const paramsAt = (k) => {
        const p = { ...cfg.fixed };
        for (const [sym] of Object.entries(cfg.varyParams)) p[sym] = k;
        // 연동 모수 — 극한을 취하는 동안 함께 움직여야 하는 값
        //   lambdaOverN : p = λ/n  (D7 이항 → 포아송, np 를 고정한다)
        //   halfN       : K = N/2  (D9 초기하 → 이항, 성공비율을 고정한다)
        for (const [sym, rule] of Object.entries(cfg.linkedParam || {})) {
          if (rule === 'lambdaOverN') p[sym] = Math.min(1, cfg.linkedParam.lambda / k);
          else if (rule === 'halfN') p[sym] = Math.round(k / 2);
        }
        for (const q of src.params || []) if (p[q.symbol] == null) p[q.symbol] = q.default;
        return p;
      };
      const targetParamsAt = (k) => {
        if (!cfg.targetFromMoments) {
          // D9 처럼 대상 모수가 극한 모수와 함께 움직이는 경우
          if (cfg.linkedParam?.halfN && cfg.targetParams?.p !== undefined) {
            return { ...cfg.targetParams, p: Math.round(k / 2) / k };
          }
          return cfg.targetParams || {};
        }
        const m = getMoments(src.id, paramsAt(k));
        return { mu: m.mean, sigma: Math.sqrt(m.variance) };
      };

      const draw = () => {
        const k = Number(range.value);
        valEl.textContent = String(k);
        const p = paramsAt(k);
        const tp = targetParamsAt(k);
        const tDist = this.byId.get(cfg.targetDist);
        const scale = cfg.scaleBy ? (p[cfg.scaleBy] ?? 1) : 1;

        const srcFn = cfg.scaleBy
          ? (x) => pdf[src.id](x / scale, p) / scale   // r₁·X 의 밀도
          : (x) => pdf[src.id](x, p);
        const tgtFn = (x) => pdf[tDist.id](x, tp);

        const xr = cfg.targetFromMoments || cfg.scaleBy
          ? unionOf(defaultXRange(tDist, tp), src.discrete ? defaultXRange(src, p) : defaultXRange(tDist, tp))
          : unionOf(defaultXRange(src.id === tDist.id ? tDist : src, p), defaultXRange(tDist, tp));
        const yr = [0, Math.max(defaultYRange(tDist, tp, xr)[1],
          src.discrete ? maxOfInt(srcFn, xr) : maxOf(srcFn, xr)) * 1.1];

        const bothDiscrete = !!src.discrete && !!tDist.discrete;
        if (bothDiscrete) {
          plot.setRanges(xr, yr).setSeries([]).draw();
          const sup = [Math.ceil(xr[0]), Math.floor(xr[1])];
          drawStems(plot, tgtFn, sup, { color: 'var(--muted-line)', width: 6, dot: false, alpha: 0.6 });
          drawStems(plot, srcFn, sup, { color: 'var(--accent)', width: 2.5 });
        } else {
          plot.setRanges(xr, yr).setSeries([
            { fn: tgtFn, color: 'var(--muted-line)', width: 2.2, dash: [5, 4] },
            { fn: srcFn, color: 'var(--accent)', width: 2.4 },
          ]).draw();
        }

        const gap = bothDiscrete
          ? maxAbsDiffInt(srcFn, tgtFn, xr) : maxAbsDiff(srcFn, tgtFn, xr);
        note.innerHTML = `최대 밀도 차이 <b>${fmtNum(gap, 3)}</b> — `
          + (gap < 0.005 ? '거의 구분되지 않습니다.'
            : gap < 0.02 ? '꽤 가까워졌습니다.' : '아직 눈에 띄게 다릅니다.');
      };
      range.addEventListener('input', draw);
      draw();
    };
    return wrap;
  }

  /** 단계별 유도 — 한 번에 다 펼치지 않는다 (PRD F3.2) */
  _derivation() {
    const steps = this.rel.derivation || [];
    if (!steps.length) return el('div');
    const list = el('ol', { class: 'deriv' });
    const render = () => {
      list.innerHTML = '';
      steps.slice(0, this.step).forEach((s, i) => {
        list.appendChild(el('li', { class: 'deriv-step' }, [
          el('div', { class: 'deriv-tex', html: texToHtml(s.latex, true) }),
          el('p', { class: 'deriv-note', text: s.explanationKo }),
        ]));
      });
      next.hidden = this.step >= steps.length;
      all.hidden = this.step >= steps.length;
      done.hidden = this.step < steps.length;
      counter.textContent = `${Math.min(this.step, steps.length)} / ${steps.length}`;
    };
    const next = el('button', {
      class: 'btn btn-sm', type: 'button', text: '다음 단계 →',
      onclick: () => { this.step++; render(); },
    });
    const all = el('button', {
      class: 'btn btn-sm btn-ghost', type: 'button', text: '전체 펼치기',
      onclick: () => { this.step = steps.length; render(); },
    });
    const done = el('span', { class: 'muted', text: '유도 완료', hidden: '' });
    const counter = el('span', { class: 'deriv-counter' });

    const sec = el('section', { class: 'deriv-wrap' }, [
      el('div', { class: 'deriv-head' }, [
        el('h3', { text: '유도 과정' }), counter,
      ]),
      list,
      el('div', { class: 'deriv-actions' }, [next, all, done]),
    ]);
    render();
    return sec;
  }
}

function unionOf(a, b) { return [Math.min(a[0], b[0]), Math.max(a[1], b[1])]; }
function maxOfInt(fn, [lo, hi]) {
  let m = 0;
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    const v = fn(k);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}
function maxOf(fn, [lo, hi], n = 400) {
  let m = 0;
  for (let i = 0; i <= n; i++) {
    const v = fn(lo + ((hi - lo) * i) / n);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}
/** 이산 극한 시연용 — 정수 점에서만 확률 차이를 잰다 */
function maxAbsDiffInt(f, g, [lo, hi]) {
  let m = 0;
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    const a = f(k), b = g(k);
    if (Number.isFinite(a) && Number.isFinite(b)) m = Math.max(m, Math.abs(a - b));
  }
  return m;
}

function maxAbsDiff(f, g, [lo, hi], n = 400) {
  let m = 0;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    const a = f(x), b = g(x);
    if (Number.isFinite(a) && Number.isFinite(b)) m = Math.max(m, Math.abs(a - b));
  }
  return m;
}
