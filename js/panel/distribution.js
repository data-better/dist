// 분포 상세 패널 (PRD F2) — 모수 슬라이더, PDF/CDF 플롯, 곡선 고정, 교재 프리셋.

import { el, $, fmtNum, rafThrottle, appendChildren, boldParts } from '../util/dom.js';
import { texToHtml, renderTex } from '../util/latex.js';
import { density as pdf, cumulative as cdf, momentsOf as getMoments, isDiscrete }
  from '../distributions/registry.js';
import { CurvePlot, drawStems, drawStep } from '../plot/curve.js';
import { defaultXRange, defaultYRange, unionRange } from '../plot/range.js';

const PIN_MAX = 3;
const PIN_COLORS = ['var(--pin-1)', 'var(--pin-2)', 'var(--pin-3)', 'var(--pin-4)'];
const RATE_FAMILY = new Set(['gamma', 'exponential', 'chisq']);

export class DistributionPanel {
  constructor(host, { dists, rels, onSelectEdge }) {
    this.host = host;
    this.dists = dists;
    this.rels = rels;
    this.onSelectEdge = onSelectEdge;
    this.pins = [];
    this.mode = 'pdf';
    this.lockAxis = false;
  }

  show(id) {
    const d = this.dists.find((x) => x.id === id);
    if (!d) return;
    if (this.dist?.id !== id) { this.pins = []; this.lockAxis = false; }
    this.dist = d;
    this.params = Object.fromEntries((d.params || []).map((p) => [p.symbol, p.default]));
    this._build();
    this._update();
  }

  _build() {
    const d = this.dist;
    const inbound = this.rels.filter((r) => r.to === d.id);
    const outbound = this.rels.filter((r) => r.from === d.id);

    this.host.innerHTML = '';
    appendChildren(this.host, [
      el('header', { class: 'panel-head' }, [
        el('div', { class: 'panel-kicker', text: '분포' }),
        el('h2', { class: 'panel-title' }, [
          el('span', { html: texToHtml(d.notation) }),
          el('span', { class: 'panel-name', text: `${d.nameKo} (${d.nameEn})` }),
        ]),
        RATE_FAMILY.has(d.id) ? this._rateBadge() : null,
      ]),
      el('p', { class: 'panel-desc' }, boldParts(d.descriptionKo)),
      el('p', { class: 'panel-use' }, boldParts(d.commonUseKo)),
      this._definitionBlock(),
      this._controls(),
      el('div', { class: 'plot-host', id: 'dist-plot' }),
      el('div', { class: 'plot-legend', id: 'dist-legend' }),
      el('p', { class: 'visually-hidden', id: 'plot-a11y', 'aria-live': 'polite' }),
      this._presets(),
      this._edgeLists(inbound, outbound),
      d.isBridge ? el('p', { class: 'callout callout-info' }, [
        el('b', { text: '연속 관계도로 건너가는 다리입니다. ' }),
        el('a', { href: `index.html#/node/${d.id}`, text: '연속 관계도에서 이 분포 보기 →' }),
      ]) : null,
      el('a', {
        class: 'btn btn-cta', href: `clt.html#/clt?source=${d.id}`,
        text: '이 분포로 중심극한정리 확인하기 →',
      }),
    ]);

    this.plot = new CurvePlot($('#dist-plot', this.host), { height: 250 });
    this.plot.onHover = (x) => this._hoverText(x);
    this._redraw = rafThrottle(() => this._update());
    window.addEventListener('resize', this._redraw, { passive: true });
  }

  _rateBadge() {
    const badge = el('button', {
      class: 'badge badge-rate', type: 'button',
      title: 'scale 표기 교재와 대조하려면 클릭',
      text: 'rate 모수화',
    });
    const tip = el('div', {
      class: 'badge-tip', hidden: '',
      html: '이 사이트는 <b>rate 모수화</b>를 씁니다: '
        + `${texToHtml('f(x)=\\frac{\\lambda^{r}}{\\Gamma(r)}x^{r-1}e^{-\\lambda x}')}, 평균 ${texToHtml('r/\\lambda')}.<br>`
        + `scale 표기(평균 ${texToHtml('r\\theta')})를 쓰는 교재와는 ${texToHtml('\\theta = 1/\\lambda')} 로 대응합니다.`,
    });
    badge.addEventListener('click', () => { tip.hidden = !tip.hidden; });
    return el('div', { class: 'badge-wrap' }, [badge, tip]);
  }

  _definitionBlock() {
    const d = this.dist;
    const row = (k, tex) => el('div', { class: 'def-row' }, [
      el('dt', { text: k }), el('dd', { html: texToHtml(tex) }),
    ]);
    return el('dl', { class: 'def-block' }, [
      row(d.discrete ? '확률질량함수' : '확률밀도함수', d.pdfLatex),
      row('지지집합', d.support.latex),
      row('평균', d.moments.meanLatex),
      row('분산', d.moments.varianceLatex),
      row('적률생성함수', d.moments.mgfLatex),
    ]);
  }

  _controls() {
    const d = this.dist;
    const wrap = el('div', { class: 'controls' });

    for (const p of d.params || []) {
      const out = el('output', { class: 'ctrl-val', text: String(p.default) });
      const range = el('input', {
        type: 'range', min: p.min, max: p.max, step: p.step, value: p.default,
        class: 'ctrl-range', 'aria-label': `${p.nameKo} 슬라이더`,
      });
      const num = el('input', {
        type: 'number', min: p.min, max: p.max, step: p.step, value: p.default,
        class: 'ctrl-num', 'aria-label': `${p.nameKo} 값 입력`,
      });
      const msg = el('span', { class: 'ctrl-msg', hidden: '' });

      const commit = (v, src) => {
        const num0 = Number(v);
        if (!Number.isFinite(num0) || num0 < p.min || num0 > p.max) {
          msg.hidden = false;
          msg.textContent = `${p.nameKo}는 ${p.min} 이상 ${p.max} 이하여야 합니다.`;
          return;
        }
        const bad = this._checkConstraints(p.symbol, num0);
        if (bad) { msg.hidden = false; msg.textContent = bad; return; }
        msg.hidden = true;
        this.params[p.symbol] = num0;
        if (src !== 'range') range.value = num0;
        if (src !== 'num') num.value = num0;
        out.textContent = String(num0);
        this._redraw();
      };
      range.addEventListener('input', (e) => commit(e.target.value, 'range'));
      num.addEventListener('change', (e) => commit(e.target.value, 'num'));

      wrap.appendChild(el('div', { class: 'ctrl' }, [
        el('label', { class: 'ctrl-label' }, [
          el('span', { html: texToHtml(p.notation) }),
          el('span', { class: 'ctrl-name', text: p.nameKo }),
          out,
        ]),
        el('div', { class: 'ctrl-inputs' }, [range, num]),
        msg,
      ]));
    }

    // PDF/CDF 토글 · 축 고정 · 곡선 고정
    const LABEL = { pdf: d.discrete ? 'PMF' : 'PDF', cdf: 'CDF' };
    const modeBtns = ['pdf', 'cdf'].map((m) => el('button', {
      class: `seg${this.mode === m ? ' on' : ''}`, type: 'button',
      text: LABEL[m],
      onclick: (e) => {
        this.mode = m;
        [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target));
        this._update();
      },
    }));

    wrap.appendChild(el('div', { class: 'ctrl-row' }, [
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'PDF/CDF 전환' }, modeBtns),
      el('label', { class: 'chk' }, [
        el('input', {
          type: 'checkbox',
          onchange: (e) => { this.lockAxis = e.target.checked; this._update(); },
        }),
        el('span', { text: '축 고정' }),
      ]),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: '현재 곡선 고정',
        onclick: () => this._pin(),
      }),
      el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button', text: '고정 해제',
        onclick: () => { this.pins = []; this._update(); },
      }),
    ]));
    return wrap;
  }

  _checkConstraints(symbol, value) {
    for (const c of this.dist.constraints || []) {
      const vals = { ...this.params, [symbol]: value };
      if (c.type === 'lessThan' && !(vals[c.left] < vals[c.right])) return c.messageKo;
      if (c.type === 'lessEq' && !(vals[c.left] <= vals[c.right])) return c.messageKo;
    }
    return null;
  }

  _presets() {
    const list = this.dist.presets || [];
    if (!list.length) return el('div');
    return el('div', { class: 'presets' }, [
      el('span', { class: 'presets-label', text: '프리셋' }),
      ...list.map((ps) => el('button', {
        class: 'btn btn-sm btn-preset', type: 'button', text: ps.labelKo,
        onclick: () => this._applyPreset(ps),
      })),
    ]);
  }

  _applyPreset(ps) {
    this.pins = ps.curves.slice(0, PIN_MAX + 1).map((c) => ({ ...c }));
    this.params = { ...this.params, ...ps.curves[ps.curves.length - 1] };
    this.fixedX = ps.xRange || null;
    this.fixedY = ps.yRange || null;
    this.lockAxis = !!(ps.xRange || ps.yRange);
    // 슬라이더 위치 동기화
    for (const p of this.dist.params || []) {
      const v = this.params[p.symbol];
      const r = this.host.querySelectorAll('.ctrl-range');
      const n = this.host.querySelectorAll('.ctrl-num');
      const o = this.host.querySelectorAll('.ctrl-val');
      const i = (this.dist.params || []).indexOf(p);
      if (r[i]) r[i].value = v;
      if (n[i]) n[i].value = v;
      if (o[i]) o[i].textContent = String(v);
    }
    this._update();
  }

  _pin() {
    if (this.pins.length >= PIN_MAX) this.pins.shift();
    this.pins.push({ ...this.params });
    this._update();
  }

  _update() {
    if (!this.plot) return;
    const d = this.dist;
    const fn = this.mode === 'pdf' ? pdf[d.id] : cdf[d.id];

    const allParams = [...this.pins, this.params];
    let xRange;
    if (this.lockAxis && this.fixedX) xRange = this.fixedX;
    else if (this.lockAxis && this._lastX) xRange = this._lastX;
    else xRange = unionRange(allParams.map((p) => defaultXRange(d, p)));
    this._lastX = xRange;

    let yRange;
    if (this.mode === 'cdf') yRange = [0, 1.05];
    else if (this.lockAxis && this.fixedY) yRange = this.fixedY;
    else yRange = [0, Math.max(...allParams.map((p) => defaultYRange(d, p, xRange)[1]))];

    if (d.discrete) {
      // 이산분포는 곡선이 아니라 스템(PMF) 또는 계단(CDF) 으로 그린다.
      // 정의되지 않은 정수 사이를 이어 그리면 개념을 흐린다.
      this.plot.setRanges(xRange, yRange).setSeries([]).draw();
      const sup = [Math.ceil(xRange[0]), Math.floor(xRange[1])];
      const barW = this.pins.length ? undefined : undefined;
      this.pins.forEach((p, i) => {
        if (this.mode === 'pdf') {
          drawStems(this.plot, (k) => fn(k, p), sup,
            { color: PIN_COLORS[i % PIN_COLORS.length], alpha: 0.7, width: barW });
        } else {
          drawStep(this.plot, (k) => fn(k, p), sup,
            { color: PIN_COLORS[i % PIN_COLORS.length], width: 1.6 });
        }
      });
      if (this.mode === 'pdf') {
        drawStems(this.plot, (k) => fn(k, this.params), sup, { color: 'var(--accent)' });
      } else {
        drawStep(this.plot, (k) => fn(k, this.params), sup, { color: 'var(--accent)' });
      }
      this._legend();
      this._a11y();
      return;
    }

    const series = this.pins.map((p, i) => ({
      fn: (x) => fn(x, p), color: PIN_COLORS[i % PIN_COLORS.length], width: 1.6, muted: true,
    }));
    series.push({
      fn: (x) => fn(x, this.params), color: 'var(--accent)', width: 2.4,
      fill: this.mode === 'pdf' && this.pins.length === 0,
    });

    this.plot.setRanges(xRange, yRange).setSeries(series).draw();
    this._legend();
    this._a11y();
  }

  _legend() {
    const box = $('#dist-legend', this.host);
    if (!box) return;
    box.innerHTML = '';
    const label = (p) => (this.dist.params || [])
      .map((q) => `${q.nameKo.replace(/\s*\(.*\)$/, '')}=${fmtNum(p[q.symbol], 3)}`).join(', ') || '고정 없음';
    this.pins.forEach((p, i) => {
      box.appendChild(el('span', { class: 'legend-item' }, [
        el('i', { class: 'legend-swatch', style: `background:${PIN_COLORS[i % PIN_COLORS.length]}` }),
        el('span', { text: label(p) }),
        el('button', {
          class: 'legend-x', type: 'button', title: '해제', text: '×',
          onclick: () => { this.pins.splice(i, 1); this._update(); },
        }),
      ]));
    });
    if (this.pins.length) {
      box.appendChild(el('span', { class: 'legend-item legend-current' }, [
        el('i', { class: 'legend-swatch', style: 'background:var(--accent)' }),
        el('span', { text: `현재 · ${label(this.params)}` }),
      ]));
    }
  }

  /** Canvas 는 스크린리더가 읽지 못하므로 데이터 요약을 숨김 텍스트로 제공한다 (§8.4) */
  _a11y() {
    const box = $('#plot-a11y', this.host);
    if (!box) return;
    const m = getMoments(this.dist.id, this.params);
    const f = pdf[this.dist.id];
    const [lo, hi] = this._lastX;
    let mode = lo, mx = -1;
    if (this.dist.discrete) {
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
        const v = f(k, this.params);
        if (Number.isFinite(v) && v > mx) { mx = v; mode = k; }
      }
    } else {
      for (let i = 0; i <= 400; i++) {
        const x = lo + ((hi - lo) * i) / 400;
        const v = f(x, this.params);
        if (Number.isFinite(v) && v > mx) { mx = v; mode = x; }
      }
    }
    box.textContent = `${this.dist.nameKo} ${this.dist.discrete && this.mode === 'pdf' ? 'PMF' : this.mode.toUpperCase()} 그래프. `
      + `x 범위 ${fmtNum(lo)}부터 ${fmtNum(hi)}. `
      + `평균 ${m.mean === null ? '존재하지 않음' : fmtNum(m.mean)}, `
      + `분산 ${m.variance === null ? '존재하지 않음' : fmtNum(m.variance)}, `
      + `최빈값 약 ${fmtNum(mode)}. `
      + `왜도 ${m.skewness === null ? '존재하지 않음' : fmtNum(m.skewness)}.`;
  }

  _hoverText(x) {
    const d = this.dist;
    if (d.discrete) {
      const k = Math.round(x);
      const pk = pdf[d.id](k, this.params);
      const Fk = cdf[d.id](k, this.params);
      if (!Number.isFinite(pk)) return null;
      return `<b>k</b> ${k} &nbsp; <b>P(X=k)</b> ${fmtNum(pk)} &nbsp; <b>P(X≤k)</b> ${fmtNum(Fk)}`;
    }
    const f = pdf[d.id](x, this.params);
    const F = cdf[d.id](x, this.params);
    if (!Number.isFinite(f) && !Number.isFinite(F)) return null;
    return `<b>x</b> ${fmtNum(x)} &nbsp; <b>f(x)</b> ${fmtNum(f)} &nbsp; <b>F(x)</b> ${fmtNum(F)}`;
  }

  _edgeLists(inbound, outbound) {
    const item = (r, dir) => el('li', {}, [
      el('button', {
        class: 'edge-item', type: 'button',
        onclick: () => this.onSelectEdge(r.id),
      }, [
        el('span', { class: 'edge-item-id', text: r.id }),
        el('span', { class: `edge-item-type type-${r.type}`, text: TYPE_KO[r.type] }),
        el('span', { class: 'edge-item-text' }, boldParts(r.summaryKo)),
      ]),
    ]);
    return el('div', { class: 'edge-lists' }, [
      el('h3', { text: `들어오는 관계 (${inbound.length})` }),
      inbound.length
        ? el('ul', { class: 'edge-list' }, inbound.map((r) => item(r, 'in')))
        : el('p', { class: 'muted', text: '없음' }),
      el('h3', { text: `나가는 관계 (${outbound.length})` }),
      outbound.length
        ? el('ul', { class: 'edge-list' }, outbound.map((r) => item(r, 'out')))
        : el('p', { class: 'muted', text: '없음' }),
    ]);
  }
}

export const TYPE_KO = { transform: '변환', special: '특수화', limit: '극한' };
