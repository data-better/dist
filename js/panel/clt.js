// 중심극한정리 시뮬레이터 (PRD F4.7) — 독립 화면.
//
// CLT 는 관계도의 엣지가 아니다. 유한 분산을 갖는 모든 분포에 동시에 적용되는 메타 관계이므로
// 엣지로 그리면 11개 노드에서 N(0,1)로 향하는 화살표가 생겨 그래프가 무너진다 (PRD §3.4).
//
// 이 화면의 존재 이유는 교육 장치 4종이다. 하나라도 빠지면 기능이 목적을 잃는다.
//   ① n 과 R 의 구분   ② 대수의 법칙과의 구분   ③ 수렴 속도와 왜도   ④ CLT 가 실패하는 경우

import { $, el, fmtNum } from '../util/dom.js';
import { texToHtml } from '../util/latex.js';
import { density as pdf, momentsOf as getMoments, isDiscrete }
  from '../distributions/registry.js';
import { createRng, sampleGamma, sampleStdNormal } from '../distributions/sample.js';
import { sampler as allSamplers } from '../distributions/registry.js';
import { cltExtraSamplers } from '../distributions/sample.js';

/** 연속·이산·교육용 특수분포를 모두 아우르는 표본생성기 조회 */
function getSampler(id) {
  return allSamplers[id] || cltExtraSamplers[id] || null;
}
import { CurvePlot, drawStems } from '../plot/curve.js';
import { Histogram, drawHistogram, drawHistogramOutline } from '../plot/histogram.js';
import { defaultXRange, defaultYRange } from '../plot/range.js';

const N_STEPS = [1, 2, 3, 5, 10, 30, 50, 100];
// 애니메이션 전용 — 슬라이더보다 촘촘하게 밟아야 모양이 부드럽게 변한다.
// 반복횟수 R 은 사용자가 정한 값 그대로 고정하고 n 만 키운다.
const N_SWEEP = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 65, 80, 100];
const SWEEP_DWELL_MS = 420;
const R_STEPS = [100, 1000, 10000, 50000];
const CHUNK_THRESHOLD = 1_000_000;   // 이 이상이면 청크 + rAF 점진 렌더링
const BINS = 60;

export class CltSimulator {
  constructor(host, { dists, extras }) {
    this.host = host;
    this.dists = dists;
    this.extras = extras;
    this.sourceId = 'exponential';
    this.nIdx = 0;          // 기본 n = 1 — 원천분포와 똑같이 나오는 출발점을 먼저 보여 준다
    this.rIdx = 2;          // 기본 R = 10,000
    this.standardize = true;
    this.seed = 20260904;
    this.params = null;
  }

  mount() {
    this._build();
    this._readHash();
    this.run();
  }

  // ── 원천분포 해석 ────────────────────────────────────────────────────────
  get source() {
    const d = this.dists.find((x) => x.id === this.sourceId);
    if (d) return { kind: 'dist', dist: d };
    const e = this.extras.find((x) => x.id === this.sourceId);
    return e ? { kind: 'extra', extra: e } : { kind: 'dist', dist: this.dists[0] };
  }

  /** 현재 원천분포의 이론 모멘트. 존재하지 않으면 null 이 섞인다. */
  get sourceMoments() {
    const s = this.source;
    if (s.kind === 'extra') {
      if (s.extra.baseDist) return getMoments(s.extra.baseDist, s.extra.baseParams);
      return { mean: s.extra.mean, variance: s.extra.variance, skewness: s.extra.skewness };
    }
    return getMoments(s.dist.id, this.params);
  }

  /** 표본 하나를 뽑는 함수 */
  get drawOne() {
    const s = this.source;
    const rng = this.rng;
    if (s.kind === 'extra') {
      const e = s.extra;
      if (e.baseDist) return () => sampleGamma(rng, e.baseParams.r, e.baseParams.lambda);
      if (e.id === 'bimodal') return () => (rng() < 0.5 ? -2 : 2) + 0.5 * sampleStdNormal(rng);
      if (e.id === 'dice') return () => Math.floor(6 * rng()) + 1;
    }
    const fn = getSampler(s.dist.id);
    const p = this.params;
    return () => fn(rng, p);
  }

  /** 원천분포의 이론 PDF (교육용 특수 분포 포함) */
  get sourcePdf() {
    const s = this.source;
    if (s.kind === 'extra') {
      const e = s.extra;
      if (e.baseDist) return (x) => pdf[e.baseDist](x, e.baseParams);
      if (e.pdfKind === 'mixture') {
        return (x) => 0.5 * pdf.normal(x, { mu: -2, sigma: 0.5 })
          + 0.5 * pdf.normal(x, { mu: 2, sigma: 0.5 });
      }
      return null;   // 이산분포는 곡선을 그리지 않는다
    }
    return (x) => pdf[s.dist.id](x, this.params);
  }

  // ── 화면 구성 ────────────────────────────────────────────────────────────
  _build() {
    const cont = this.dists.filter((d) => !d.discrete);
    const disc = this.dists.filter((d) => d.discrete);
    const opts = [
      '<optgroup label="연속분포">',
      ...cont.map((d) => `<option value="${d.id}">${d.nameKo}</option>`),
      '</optgroup>',
      disc.length ? '<optgroup label="이산분포">' : '',
      ...disc.map((d) => `<option value="${d.id}">${d.nameKo}</option>`),
      disc.length ? '</optgroup>' : '',
      '<optgroup label="교육용 특수 분포">',
      ...this.extras.map((e) => `<option value="${e.id}">${e.nameKo}</option>`),
      '</optgroup>',
    ].join('');

    this.host.innerHTML = `
      <section class="clt-controls">
        <div class="clt-source">
          <label for="clt-src">원천분포</label>
          <select id="clt-src">${opts}</select>
          <div id="clt-params" class="clt-params"></div>
        </div>

        <div class="clt-sliders">
          <div class="clt-slider clt-n">
            <div class="clt-slider-head">
              <span class="clt-sym">n</span>
              <b>표본크기</b>
              <output id="clt-n-val">1</output>
            </div>
            <input type="range" id="clt-n" min="0" max="${N_STEPS.length - 1}" step="1" value="0"
                   aria-label="표본크기 n">
            <p class="clt-hint">평균 <b>하나</b>를 만드는 데 쓰는 관측값 개수 —
              <b>이것이 커져야 정규에 가까워집니다.</b></p>
          </div>
          <div class="clt-slider clt-r">
            <div class="clt-slider-head">
              <span class="clt-sym">R</span>
              <b>반복횟수</b>
              <output id="clt-r-val">10,000</output>
            </div>
            <input type="range" id="clt-r" min="0" max="${R_STEPS.length - 1}" step="1" value="2"
                   aria-label="반복횟수 R">
            <p class="clt-hint">평균을 <b>몇 번</b> 반복해 만들었는가 —
              커져도 매끄러워질 뿐 <b>모양은 안 변합니다.</b></p>
          </div>
        </div>

        <div class="clt-actions">
          <label class="chk"><input type="checkbox" id="clt-std" checked><span>표준화</span></label>
          <label class="chk"><input type="checkbox" id="clt-seed" checked><span>seed 고정</span></label>
          <button class="btn btn-sm" id="clt-run" type="button">다시 생성</button>
          <button class="btn btn-sm btn-play" id="clt-sweep" type="button">▶ n 늘리기 <i>(R 고정)</i></button>
          <button class="btn btn-sm btn-ghost" id="clt-anim" type="button">▶ R 쌓기 <i>(n 고정)</i></button>
          <span class="clt-progress" id="clt-progress" hidden></span>
        </div>

        <div class="clt-presets">
          <span class="presets-label">왜도 비교 (같은 n에서 눌러 보세요)</span>
          <button class="btn btn-sm btn-preset" data-src="unif01">U(0,1) · γ₁=0</button>
          <button class="btn btn-sm btn-preset" data-src="exponential">Exp · γ₁=2</button>
          <button class="btn btn-sm btn-preset" data-src="skewed">Gamma(0.5) · γ₁≈2.83</button>
        </div>
      </section>

      <div class="clt-banner" id="clt-banner" hidden></div>

      <section class="clt-panels">
        <figure class="clt-panel">
          <figcaption><b>① 원천분포</b><span id="clt-cap1"></span></figcaption>
          <div class="plot-host" id="clt-plot1"></div>
          <div class="clt-stats" id="clt-stat1"></div>
        </figure>
        <figure class="clt-panel">
          <figcaption><b>② 표본평균 <span class="tex" id="clt-xbar"></span>의 분포</b><span id="clt-cap2"></span></figcaption>
          <div class="plot-host" id="clt-plot2"></div>
          <div class="clt-stats" id="clt-stat2"></div>
        </figure>
        <figure class="clt-panel clt-panel-key">
          <figcaption><b>③ 표준화 후</b><span id="clt-cap3"></span></figcaption>
          <div class="plot-host" id="clt-plot3"></div>
          <div class="clt-stats" id="clt-stat3"></div>
        </figure>
      </section>

      <p class="clt-lln" id="clt-lln"></p>
      <p class="visually-hidden" id="clt-a11y" aria-live="polite"></p>`;

    $('#clt-xbar', this.host).innerHTML = texToHtml('\\bar{X}');

    this.plot1 = new CurvePlot($('#clt-plot1', this.host), { height: 200 });
    this.plot2 = new CurvePlot($('#clt-plot2', this.host), { height: 200 });
    this.plot3 = new CurvePlot($('#clt-plot3', this.host), { height: 200 });

    const src = $('#clt-src', this.host);
    src.value = this.sourceId;
    src.addEventListener('change', () => {
      this.sourceId = src.value;
      this._syncHash();
      this._buildParams();
      this.run();
    });
    $('#clt-n', this.host).addEventListener('input', (e) => {
      this.nOverride = null;
      this.nIdx = Number(e.target.value);
      this._syncHash();
      this.run();
    });
    $('#clt-r', this.host).addEventListener('input', (e) => {
      this.rIdx = Number(e.target.value);
      this.run();
    });
    $('#clt-std', this.host).addEventListener('change', (e) => {
      this.standardize = e.target.checked;
      this.run();
    });
    $('#clt-run', this.host).addEventListener('click', () => {
      if (!$('#clt-seed', this.host).checked) this.seed = (Math.random() * 2 ** 31) | 0;
      this.run();
    });
    $('#clt-anim', this.host).addEventListener('click', () => this.animate());
    $('#clt-sweep', this.host).addEventListener('click', () => this.toggleSweep());
    this.host.querySelectorAll('[data-src]').forEach((b) => {
      b.addEventListener('click', () => {
        this.sourceId = b.dataset.src;
        $('#clt-src', this.host).value = this.sourceId;
        this._buildParams();
        this._syncHash();
        this.run();
      });
    });
    this._buildParams();
  }

  /** 관계도의 분포를 고른 경우 모수 슬라이더를 붙인다 */
  _buildParams() {
    const box = $('#clt-params', this.host);
    box.innerHTML = '';
    const s = this.source;
    if (s.kind !== 'dist' || !(s.dist.params || []).length) {
      this.params = s.kind === 'dist' ? {} : null;
      return;
    }
    this.params = Object.fromEntries(s.dist.params.map((p) => [p.symbol, p.default]));
    for (const p of s.dist.params) {
      const out = el('output', { class: 'ctrl-val', text: String(p.default) });
      const range = el('input', {
        type: 'range', min: p.min, max: p.max, step: p.step, value: p.default,
        class: 'ctrl-range', 'aria-label': `${p.nameKo} 슬라이더`,
        oninput: (e) => {
          this.params[p.symbol] = Number(e.target.value);
          out.textContent = e.target.value;
          this.run();
        },
      });
      box.appendChild(el('div', { class: 'ctrl ctrl-inline' }, [
        el('label', { class: 'ctrl-label' }, [
          el('span', { html: texToHtml(p.notation) }), out,
        ]),
        range,
      ]));
    }
  }

  // ── 실행 ────────────────────────────────────────────────────────────────
  get n() { return this.nOverride ?? N_STEPS[this.nIdx]; }
  get R() { return R_STEPS[this.rIdx]; }

  run() {
    if (this._raf) cancelAnimationFrame(this._raf);
    $('#clt-n-val', this.host).textContent = String(this.n);
    $('#clt-r-val', this.host).textContent = this.R.toLocaleString('ko-KR');

    const m = this.sourceMoments;
    // ④ CLT 가 실패하는 경우 — 평균·분산이 존재하지 않는 분포
    this.cltValid = m.mean !== null && m.variance !== null && Number.isFinite(m.variance);
    this._banner(m);

    this.rng = createRng(this.seed);
    const draw = this.drawOne;
    const n = this.n, R = this.R;

    // 축 범위를 먼저 잡는다 (빈 경계를 고정해야 카운트만 누적할 수 있다).
    // cltValid 이면 히스토그램은 항상 표준화된 값 Z 를 담는다. ②패널의 원래 스케일 뷰는
    // _unstdHist() 로 되돌려 만든다 — 표본을 두 번 뽑지 않기 위해서다.
    this.mu = m.mean;
    this.se = this.cltValid ? Math.sqrt(m.variance / n) : null;
    const range = this._meanRange(m, n);
    this.hist = new Histogram(BINS).reset(range[0], range[1]);
    this.srcHist = new Histogram(BINS).reset(...this._sourceRange(m));

    const total = R * n;
    // n 스윕 중에는 청크(비동기) 경로를 쓰지 않는다. 프레임마다 결과가 완성되어 있어야
    // 다음 n 으로 넘어가는 타이밍이 맞는다.
    if (total > CHUNK_THRESHOLD && !this.sweeping) this._runChunked(draw, n, R);
    else { this._runSync(draw, n, R); this._render(); }
  }

  _runSync(draw, n, R) {
    const h = this.hist, sh = this.srcHist;
    const z = this._standardizer();
    for (let r = 0; r < R; r++) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const v = draw();
        s += v;
        if (r < 400) sh.push(v);      // 좌측 패널 표시용 표본 일부
      }
      h.push(z(s / n));
    }
  }

  /** 표본평균 → 히스토그램에 담을 값. CLT 전제가 깨지면 원래 값 그대로. */
  _standardizer() {
    if (!this.cltValid) return (v) => v;
    const mu = this.mu, se = this.se;
    return (v) => (v - mu) / se;
  }

  /** 표본 500만 개 조건에서도 UI 가 멈추지 않도록 청크 + rAF (PRD F4.7.8) */
  _runChunked(draw, n, R) {
    const prog = $('#clt-progress', this.host);
    prog.hidden = false;
    const chunk = Math.max(1, Math.floor(200000 / n));
    let done = 0;
    const step = () => {
      const end = Math.min(R, done + chunk);
      const h = this.hist, sh = this.srcHist;
      const z = this._standardizer();
      for (let r = done; r < end; r++) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = draw();
          s += v;
          if (r < 400) sh.push(v);
        }
        h.push(z(s / n));
      }
      done = end;
      prog.textContent = `생성 중… ${Math.round((done / R) * 100)}%`;
      this._render();
      if (done < R) this._raf = requestAnimationFrame(step);
      else { prog.hidden = true; this._render(); }
    };
    this._raf = requestAnimationFrame(step);
  }

  // ── n 스윕 애니메이션 ────────────────────────────────────────────────────
  //
  // 표본크기 n 을 키우면서 표본평균의 분포 모양이 어떻게 변하는지 보여 준다.
  // **반복횟수 R 은 사용자가 정한 값에 고정**되고 n 만 움직인다 —
  // 이 화면이 가르치려는 것이 바로 "모양을 바꾸는 것은 R 이 아니라 n" 이기 때문이다.
  // 재생 중에는 R 슬라이더와 원천분포를 잠가서 그 사실을 조작으로도 못 박는다.

  toggleSweep() {
    if (this.sweeping) this.stopSweep(); else this.startSweep();
  }

  startSweep() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.sweeping = true;
    this.sweepIdx = 0;
    this.refFrame = null;              // n=1 시점의 모양 (잔상으로 남긴다)
    this._lockControls(true);
    $('#clt-sweep', this.host).innerHTML = '■ 정지';
    $('#clt-sweep', this.host).classList.add('on');
    this._sweepStep();
  }

  stopSweep() {
    this.sweeping = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._sweepTimer) clearTimeout(this._sweepTimer);
    this._lockControls(false);
    const b = $('#clt-sweep', this.host);
    if (b) { b.innerHTML = '▶ n 늘리기 <i>(R 고정)</i>'; b.classList.remove('on'); }
    $('#clt-progress', this.host).hidden = true;
    this.nOverride = null;
    this._syncNSlider(N_STEPS[this.nIdx]);
    this.run();
  }

  _sweepStep() {
    if (!this.sweeping) return;
    const n = N_SWEEP[this.sweepIdx];
    this.nOverride = n;
    this._syncNSlider(n);

    const t0 = performance.now();
    this.run();                        // R 은 그대로, n 만 바뀐 상태로 재생성
    if (this.sweepIdx === 0 && this.cltValid) {
      // 출발 모양을 저장해 이후 프레임에 잔상으로 겹쳐 그린다
      this.refFrame = { lo: this.hist.lo, hi: this.hist.hi, densities: this.hist.densities(), n };
      this._render();
    }
    const elapsed = performance.now() - t0;

    const prog = $('#clt-progress', this.host);
    prog.hidden = false;
    prog.textContent = `n = ${n} 재생 중 · R = ${this.R.toLocaleString('ko-KR')} 고정 `
      + `(${this.sweepIdx + 1}/${N_SWEEP.length})`;

    this.sweepIdx++;
    if (this.sweepIdx >= N_SWEEP.length) {
      // 마지막 프레임은 잠시 머무른 뒤 종료
      this._sweepTimer = setTimeout(() => {
        prog.textContent = `n = ${n} 까지 완료 · R = ${this.R.toLocaleString('ko-KR')} 은 처음부터 끝까지 고정이었습니다`;
        this.sweeping = false;
        this._lockControls(false);
        const b = $('#clt-sweep', this.host);
        if (b) { b.innerHTML = '▶ 다시 재생 <i>(R 고정)</i>'; b.classList.remove('on'); }
      }, SWEEP_DWELL_MS * 2);
      return;
    }
    this._sweepTimer = setTimeout(() => this._sweepStep(), Math.max(60, SWEEP_DWELL_MS - elapsed));
  }

  /** 재생 중에는 R·원천분포를 잠가 "R 고정"을 조작으로도 드러낸다 */
  _lockControls(lock) {
    for (const sel of ['#clt-r', '#clt-src', '#clt-n', '#clt-run', '#clt-anim']) {
      const el2 = $(sel, this.host);
      if (el2) el2.disabled = lock;
    }
    this.host.querySelectorAll('#clt-params input').forEach((i) => { i.disabled = lock; });
    this.host.querySelectorAll('[data-src]').forEach((b) => { b.disabled = lock; });
    $('.clt-r', this.host)?.classList.toggle('locked', lock);
  }

  /** 슬라이더를 가장 가까운 눈금으로 맞추고, 실제 n 값을 표시한다 */
  _syncNSlider(n) {
    let best = 0;
    for (let i = 0; i < N_STEPS.length; i++) {
      if (Math.abs(N_STEPS[i] - n) < Math.abs(N_STEPS[best] - n)) best = i;
    }
    const r = $('#clt-n', this.host);
    if (r) r.value = String(best);
    const o = $('#clt-n-val', this.host);
    if (o) o.textContent = String(n);
  }

  /** 애니메이션 — 표본을 점진적으로 누적하며 수렴 과정을 보여 준다 */
  animate() {
    if (this._raf) cancelAnimationFrame(this._raf);
    const m = this.sourceMoments;
    this.cltValid = m.mean !== null && m.variance !== null && Number.isFinite(m.variance);
    this.rng = createRng(this.seed);
    const draw = this.drawOne;
    const n = this.n, R = this.R;
    this.mu = m.mean;
    this.se = this.cltValid ? Math.sqrt(m.variance / n) : null;
    this.hist = new Histogram(BINS).reset(...this._meanRange(m, n));
    this.srcHist = new Histogram(BINS).reset(...this._sourceRange(m));
    const z = this._standardizer();
    let done = 0;
    const per = Math.max(20, Math.floor(R / 90));
    const step = () => {
      const end = Math.min(R, done + per);
      for (let r = done; r < end; r++) {
        let s = 0;
        for (let i = 0; i < n; i++) { const v = draw(); s += v; if (r < 400) this.srcHist.push(v); }
        this.hist.push(z(s / n));
      }
      done = end;
      this._render();
      if (done < R) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  // ── 범위 ────────────────────────────────────────────────────────────────
  _sourceRange(m) {
    const s = this.source;
    if (s.kind === 'extra') return s.extra.xRange;
    if (this.cltValid) {
      const sd = Math.sqrt(m.variance);
      const lo = s.dist.support.type === 'halfline' ? 0 : m.mean - 4 * sd;
      return [lo, m.mean + 4 * sd];
    }
    // 평균·분산이 없으면 분위수 기반 (PRD F4.7.6)
    return defaultXRange(s.dist, this.params);
  }

  _meanRange(m, n) {
    // cltValid 이면 히스토그램은 표준화된 Z 를 담으므로 범위도 표준화 스케일이다.
    if (this.cltValid) return [-4.2, 4.2];
    // 코시 등 — 표본 분위수로 축을 고정한다. 자동 범위는 극단값 때문에 무의미하다.
    const rng = createRng(this.seed ^ 0x5bf03635);
    const drawOne = (() => {
      const s = this.source;
      const fn = getSampler(s.dist.id);
      return () => fn(rng, this.params);
    })();
    const buf = [];
    for (let i = 0; i < 4000; i++) {
      let acc = 0;
      for (let k = 0; k < n; k++) acc += drawOne();
      if (Number.isFinite(acc)) buf.push(acc / n);
    }
    buf.sort((a, b) => a - b);
    const q = (p) => buf[Math.min(buf.length - 1, Math.max(0, Math.floor(p * buf.length)))];
    const lo = q(0.01), hi = q(0.99);
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────
  _render() {
    const m = this.sourceMoments;
    const n = this.n;

    // ① 원천분포
    const srcPdf = this.sourcePdf;
    const srcDiscrete = this.source.kind === 'dist' && !!this.source.dist.discrete;
    const r1 = this.srcHist.hi > this.srcHist.lo ? [this.srcHist.lo, this.srcHist.hi] : [0, 1];
    const yMax1 = Math.max(this.srcHist.maxDensity,
      srcPdf ? maxOf(srcPdf, r1, srcDiscrete) : 0) * 1.2 || 1;
    // 이산 원천분포는 곡선이 아니라 스템으로 그린다
    this.plot1.setRanges(r1, [0, yMax1]).setSeries(
      srcPdf && !srcDiscrete ? [{ fn: srcPdf, color: 'var(--fam-gamma)', width: 2.2 }] : []
    ).draw();
    drawHistogram(this.plot1, this.srcHist, { color: 'var(--muted-line)', alpha: 0.35 });
    if (srcPdf && srcDiscrete) {
      drawStems(this.plot1, srcPdf, [Math.ceil(r1[0]), Math.floor(r1[1])],
        { color: 'var(--fam-gamma)', width: 3 });
    }
    this._rug(this.plot1);

    const h = this.hist;

    // ② 표본평균 — 항상 원래 스케일로 보여 준다.
    //   표준화 ON  : 축이 μ ± 4.5·σ/√n 로 함께 줄어든다 → 모양이 그대로로 보인다 (CLT 관점)
    //   표준화 OFF : 축을 n=1 스케일(μ ± 4.5σ)에 고정한다 → 눈에 띄게 좁아진다 (대수의 법칙)
    if (this.cltValid) {
      const sd = Math.sqrt(m.variance);
      const view = this.standardize
        ? [m.mean - 4.5 * this.se, m.mean + 4.5 * this.se]
        : [m.mean - 4.5 * sd, m.mean + 4.5 * sd];
      const rawTheory = (x) => pdf.normal(x, { mu: m.mean, sigma: this.se });
      const yMax2 = Math.max(maxOf(rawTheory, view), h.maxDensity / this.se) * 1.2 || 1;
      this.plot2.setRanges(view, [0, yMax2])
        .setSeries([{ fn: rawTheory, color: 'var(--muted-line)', width: 2, dash: [5, 4] }])
        .draw();
      drawHistogram(this.plot2, this._unstdHist(), { color: 'var(--accent)', alpha: 0.45 });
    } else {
      const view = [h.lo, h.hi];
      this.plot2.setRanges(view, [0, h.maxDensity * 1.2 || 1]).setSeries([]).draw();
      drawHistogram(this.plot2, h, { color: 'var(--accent)', alpha: 0.45 });
    }

    // ③ 표준화 후 — 이 패널이 핵심이다. n 이 바뀌어도 축과 수렴 목표가 고정된다.
    const theory = this.cltValid ? (x) => pdf.stdnormal(x) : null;
    const yMax3 = Math.max(h.maxDensity, theory ? 0.4 : 0) * 1.2 || 1;
    this.plot3.setRanges([h.lo, h.hi], [0, yMax3])
      .setSeries(theory ? [{ fn: theory, color: 'var(--fg)', width: 2.2, dash: [5, 4] }] : [])
      .draw();
    // n 스윕 중이면 출발 모양(n=1)을 잔상으로 겹쳐, 얼마나 달라졌는지 보이게 한다
    if (this.refFrame && this.refFrame.n !== n) {
      drawHistogramOutline(this.plot3, this.refFrame, { color: 'var(--pin-2)' });
    }
    drawHistogram(this.plot3, h, { color: 'var(--accent)', alpha: 0.5 });

    this._stats(m, n);
  }

  /** 표준화된 히스토그램을 원래 스케일로 되돌린 뷰 (②용). 표본을 다시 뽑지 않는다. */
  _unstdHist() {
    const out = new Histogram(this.hist.bins);
    out.lo = this.mu + this.hist.lo * this.se;
    out.hi = this.mu + this.hist.hi * this.se;
    out.counts = this.hist.counts;
    out.n = this.hist.n;
    return out;
  }

  _rug(plot) {
    const ctx = plot.canvas.getContext('2d');
    const rng = createRng(this.seed ^ 0x1234);
    const draw = (() => {
      const s = this.source;
      if (s.kind === 'extra') {
        const e = s.extra;
        if (e.baseDist) return () => sampleGamma(rng, e.baseParams.r, e.baseParams.lambda);
        if (e.id === 'bimodal') return () => (rng() < 0.5 ? -2 : 2) + 0.5 * sampleStdNormal(rng);
        return () => Math.floor(6 * rng()) + 1;
      }
      const fn = getSampler(s.dist.id);
      return () => fn(rng, this.params);
    })();
    ctx.save();
    ctx.strokeStyle = 'rgba(120,140,180,.75)';
    ctx.lineWidth = 1;
    const y = plot.sy(0);
    for (let i = 0; i < Math.min(this.n, 60); i++) {
      const v = draw();
      if (!Number.isFinite(v)) continue;
      const px = plot.sx(v);
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y - 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  _banner(m) {
    const box = $('#clt-banner', this.host);
    const s = this.source;
    if (!this.cltValid) {
      box.hidden = false;
      box.className = 'clt-banner clt-banner-warn';
      box.innerHTML = '<b>중심극한정리가 적용되지 않습니다.</b> 이 분포는 '
        + (m.mean === null ? '평균과 분산이' : '분산이')
        + ' 존재하지 않아 정리의 전제가 깨집니다. '
        + 'n을 아무리 키워도 표본평균의 분포는 좁아지지 않고 원래 분포와 같은 모양을 유지합니다. '
        // 자유도 안내는 t분포에서만 뜻이 있다. 코시분포에는 그런 모수가 없다.
        + (s.dist?.id === 't'
          ? '자유도를 3 이상으로 올리면 수렴이 살아나는 것을 볼 수 있습니다.'
          : '원천분포를 t분포로 바꾸고 자유도를 3 이상으로 올리면 수렴이 살아나는 것을 볼 수 있습니다.');
      return;
    }
    const note = s.kind === 'extra' ? s.extra.noteKo : null;
    if (note) {
      box.hidden = false;
      box.className = 'clt-banner clt-banner-info';
      box.textContent = note;
      return;
    }
    // ① n 과 R 의 혼동 교정 — R 만 키우고 있을 때 안내
    if (this.n <= 5 && this.R >= 10000) {
      box.hidden = false;
      box.className = 'clt-banner clt-banner-info';
      box.innerHTML = '반복을 늘려도 <b>모양은 그대로</b>입니다. 히스토그램이 매끄러워질 뿐이죠. '
        + '정규에 가까워지게 하려면 <b>n</b>을 올려 보세요.';
      return;
    }
    box.hidden = true;
  }

  _stats(m, n) {
    const h = this.hist;
    const set = (id, html) => { $(id, this.host).innerHTML = html; };

    const g1 = m.skewness;
    set('#clt-stat1', row([
      ['평균 μ', m.mean === null ? '존재하지 않음' : fmtNum(m.mean)],
      ['표준편차 σ', m.variance === null ? '존재하지 않음' : fmtNum(Math.sqrt(m.variance))],
      ['왜도 γ₁', g1 === null || !Number.isFinite(g1) ? '존재하지 않음' : fmtNum(g1, 3)],
    ]));
    $('#clt-cap1', this.host).textContent = ` · 표본 ${Math.min(n, 60)}개 표시`;

    if (this.cltValid) {
      const se = Math.sqrt(m.variance / n);
      set('#clt-stat2', row([
        ['이론 평균', fmtNum(m.mean)],
        ['이론 표준편차 σ/√n', fmtNum(se)],
        ['표본 표준편차', fmtNum(h.sd * se)],
        ['축', this.standardize ? 'n에 따라 축소' : 'n=1 스케일 고정'],
      ]));
      const skewTheory = g1 !== null && Number.isFinite(g1) ? g1 / Math.sqrt(n) : null;
      set('#clt-stat3', row([
        ['n', String(n)],
        ['표본평균', fmtNum(h.mean, 3)],
        ['표본표준편차', fmtNum(h.sd, 4)],
        ['표본왜도', fmtNum(h.skewness, 3)],
        ['이론 γ₁/√n', skewTheory === null ? '—' : fmtNum(skewTheory, 3)],
      ]));
      $('#clt-cap3', this.host).innerHTML = ` · ${texToHtml('Z=\\frac{\\bar{X}-\\mu}{\\sigma/\\sqrt{n}}')} vs N(0,1)`
        + (this.refFrame && this.refFrame.n !== n
          ? ` · <span class="ref-key">점선 윤곽 = n=${this.refFrame.n} 시점</span>` : '');
    } else {
      set('#clt-stat2', '<span class="muted">이론 분포가 존재하지 않습니다.</span>');
      set('#clt-stat3', row([
        ['표본 사분위범위', fmtNum(h.quantile(0.75) - h.quantile(0.25), 4)],
        ['n', String(n)],
      ]) + ' <span class="muted">n을 키워도 좁아지지 않습니다.</span>');
      $('#clt-cap3', this.host).textContent = ' · 표준화 불가 (비표준화 표시)';
    }
    $('#clt-cap2', this.host).textContent = this.standardize
      ? ' · 원래 스케일 (축이 함께 축소)'
      : ' · 원래 스케일 (축 고정 — 좁아지는 것이 보입니다)';

    // ② 대수의 법칙과의 구분
    const lln = $('#clt-lln', this.host);
    lln.innerHTML = this.cltValid
      ? '<b>대수의 법칙은 어디로</b> 모이는지, <b>중심극한정리는 어떤 모양으로</b> 모이는지를 말합니다. '
        + `표준화를 끄면 ②의 분포가 μ 주위로 좁아지는 것(σ/√n = ${fmtNum(Math.sqrt(m.variance / n))})을, `
        + '켜면 ③의 모양이 N(0,1)로 고정되는 것을 볼 수 있습니다.'
      : '평균이 존재하지 않으므로 대수의 법칙도 성립하지 않습니다. 표본평균은 아무 곳으로도 모이지 않습니다.';

    $('#clt-a11y', this.host).textContent =
      `원천분포 ${this.source.kind === 'extra' ? this.source.extra.nameKo : this.source.dist.nameKo}, `
      + `표본크기 ${n}, 반복 ${this.R}회. `
      + (this.cltValid
        ? `표준화된 표본평균의 평균 ${fmtNum(h.mean, 3)}, 표준편차 ${fmtNum(h.sd, 3)}, 왜도 ${fmtNum(h.skewness, 3)}.`
        : '이 분포는 중심극한정리의 전제를 만족하지 않습니다.');
  }

  // ── 라우팅 ──────────────────────────────────────────────────────────────
  _readHash() {
    const m = /#\/clt\?(.*)$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    const src = q.get('source');
    if (src && (this.dists.some((d) => d.id === src) || this.extras.some((e) => e.id === src))) {
      this.sourceId = src;
      $('#clt-src', this.host).value = src;
      this._buildParams();
    }
    const n = Number(q.get('n'));
    if (n && N_STEPS.includes(n)) {
      this.nIdx = N_STEPS.indexOf(n);
      $('#clt-n', this.host).value = this.nIdx;
    }
  }

  _syncHash() {
    history.replaceState(null, '', `#/clt?source=${this.sourceId}&n=${this.n}`);
  }
}

function row(pairs) {
  return pairs.map(([k, v]) => `<span class="stat"><i>${k}</i><b>${v}</b></span>`).join('');
}
function maxOf(fn, [lo, hi], discrete = false, n = 300) {
  let m = 0;
  if (discrete) {
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
