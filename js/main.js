// 앱 진입점 — 데이터 로드 → 정합성 검사 → 렌더 → 상호작용 바인딩 → 해시 라우팅.

import { $, el, clearColorCache } from './util/dom.js';
import { canParseTex, texToHtml } from './util/latex.js';
import { validateData, reportValidation } from './util/validate.js';
import { loadGraphData, selectGraph } from './util/graphdata.js';
import { renderGraph } from './graph/render.js';
import { attachInteraction } from './graph/interaction.js';
import { findPath, describePath } from './graph/pathfind.js';
import { GraphFilter } from './graph/filter.js';
import { TourRunner, tourMenu } from './graph/tour.js';
import { DistributionPanel } from './panel/distribution.js';
import { RelationPanel } from './panel/relation.js';

const app = {};

async function boot() {
  const [data, tours] = await Promise.all([
    loadGraphData(),
    fetch('data/tours.json').then((r) => r.json()).catch(() => []),
  ]);
  const { dists, rels } = selectGraph(data, 'full');
  app.dists = dists;
  app.rels = rels;
  app.tours = tours;
  app.byId = new Map(dists.map((d) => [d.id, d]));

  reportValidation(validateData(dists, rels, canParseTex));

  const graph = renderGraph($('#graph'), dists, rels, { viewBox: { w: 1200, h: 900 } });
  app.graph = graph;
  const host = $('#app');
  app.ui = attachInteraction(graph, dists, rels, host);

  // 이산 노드는 테두리를 진하게 — 전체 관계도에서 두 세계를 구분해 준다
  for (const d of dists) {
    if (d.discrete) graph.nodeEls.get(d.id)?.classList.add('node-discrete');
  }

  const panelHost = $('#panel-body');
  app.distPanel = new DistributionPanel(panelHost, {
    dists, rels, onSelectEdge: (id) => selectEdge(id),
  });
  app.relPanel = new RelationPanel(panelHost, {
    dists, rels, onSelectNode: (id) => selectNode(id),
  });

  host.addEventListener('node-selected', (e) => showNode(e.detail.id));
  host.addEventListener('edge-selected', (e) => showEdge(e.detail.id));

  app.filter = new GraphFilter(graph, dists, rels);
  app.tour = new TourRunner($('#tour'), {
    tours,
    onGoto: (kind, id) => (kind === 'node' ? selectNode(id) : selectEdge(id)),
    onHighlight: (path) => app.ui.showPath(path),
  });

  // 머리말의 개수는 데이터에서 채운다 — 관계가 늘 때 문구가 어긋나지 않게
  const sub = $('#head-sub');
  if (sub) {
    const nd = dists.filter((d) => d.discrete).length;
    sub.textContent = `연속 ${dists.length - nd} · 이산 ${nd} · 관계 ${rels.length}`;
  }

  buildLegend();
  buildToolbar();
  buildPathfinder();
  bindChrome();

  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
}

// ── 라우팅 ────────────────────────────────────────────────────────────────
function routeFromHash() {
  const m = /^#\/(node|edge)\/([A-Za-z0-9_]+)$/.exec(location.hash);
  if (!m) { showEmpty(); app.ui.select('node', null, { silent: true }); return; }
  const [, kind, id] = m;
  if (kind === 'node' && app.byId.has(id)) {
    app.ui.select('node', id, { silent: true });
    showNode(id);
  } else if (kind === 'edge' && app.rels.some((r) => r.id === id)) {
    app.ui.select('edge', id, { silent: true });
    showEdge(id);
  }
}
const selectNode = (id) => { location.hash = `#/node/${id}`; };
const selectEdge = (id) => { location.hash = `#/edge/${id}`; };

function showNode(id) {
  location.hash = `#/node/${id}`;
  openPanel();
  app.distPanel.show(id);
}
function showEdge(id) {
  location.hash = `#/edge/${id}`;
  openPanel();
  app.relPanel.show(id);
}
function showEmpty() {
  $('#panel-body').innerHTML = '';
  $('#panel-body').append(el('div', { class: 'panel-empty' }, [
    el('h2', { text: '분포 관계 탐색기' }),
    el('p', { text: '연속분포 14종과 이산분포 6종을 한 장에 담은 전체 관계도입니다. 노드를 클릭하면 분포의 정의와 밀도(질량)함수를, 화살표를 클릭하면 두 분포를 잇는 관계와 그 유도 과정을 볼 수 있습니다.' }),
    el('ul', { class: 'hint-list' }, [
      el('li', { text: '실선 화살표는 변환·특수화, 점선 화살표는 극한 관계입니다.' }),
      el('li', { text: '테두리가 진한 노드가 이산분포입니다. 이산분포만 크게 보려면 상단의 이산 관계도로 가세요.' }),
      el('li', { text: '노드에 마우스를 올리면 연결된 관계만 남고 나머지는 흐려집니다.' }),
      el('li', { text: '툴바의 확장 체크를 켜면 참조 다이어그램에 없던 보강 관계 11개가 함께 나타납니다.' }),
      el('li', { text: '휠로 확대, 드래그로 이동합니다. Tab 키로도 이동할 수 있습니다.' }),
    ]),
    tourMenu(app.tours, (id) => app.tour.start(id)),
    el('a', { class: 'btn btn-cta', href: 'clt.html', text: '중심극한정리 시뮬레이터 열기 →' }),
  ]));
}

// ── 화면 구성 요소 ────────────────────────────────────────────────────────
function buildLegend() {
  $('#legend').innerHTML = `
    <span class="lg"><i class="lg-line lg-solid"></i>변환·특수화</span>
    <span class="lg"><i class="lg-line lg-dash"></i>극한</span>
    <span class="lg"><i class="lg-dot"></i>이항 관계</span>
    <span class="lg"><i class="lg-box lg-box-d"></i>이산</span>`;
}

function buildToolbar() {
  const bar = $('#toolbar');
  bar.innerHTML = `
    <div class="tb-group tb-search">
      <label for="tb-q">검색</label>
      <input type="search" id="tb-q" placeholder="분포명·표기 (예: 감마, chi, t)" aria-label="분포 검색">
    </div>
    <div class="tb-group" role="group" aria-label="관계 유형 필터">
      <label>관계</label>
      <label class="chk"><input type="checkbox" data-type="transform" checked><span>변환</span></label>
      <label class="chk"><input type="checkbox" data-type="special" checked><span>특수화</span></label>
      <label class="chk"><input type="checkbox" data-type="limit" checked><span>극한</span></label>
    </div>
    <div class="tb-group">
      <label for="tb-sup">지지집합</label>
      <select id="tb-sup" aria-label="지지집합 필터">
        <option value="all">전체</option>
        <option value="line">실수 전체</option>
        <option value="halfline">양의 반직선</option>
        <option value="bounded">유계 구간</option>
      </select>
    </div>
    <div class="tb-group">
      <label class="chk"><input type="checkbox" id="tb-aug" checked><span>보강</span></label>
      <label class="chk"><input type="checkbox" id="tb-ext"><span>확장</span></label>
      <label class="chk"><input type="checkbox" id="tb-lab" checked><span>라벨</span></label>
    </div>
    <div class="tb-group">
      <label for="tb-tour">학습 경로</label>
      <select id="tb-tour" aria-label="학습 경로 선택"></select>
    </div>
    <span class="spacer"></span>
    <span class="tb-count" id="tb-count"></span>
    <button class="btn btn-sm btn-ghost" id="tb-reset" type="button">필터 해제</button>`;

  const refresh = () => {
    const r = app.filter.apply();
    $('#tb-count').textContent = `분포 ${r.nodes} · 관계 ${r.edges}`;
  };
  $('#tb-q').addEventListener('input', (e) => { app.filter.state.query = e.target.value; refresh(); });
  bar.querySelectorAll('[data-type]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const t = e.target.dataset.type;
      if (e.target.checked) app.filter.state.types.add(t); else app.filter.state.types.delete(t);
      refresh();
    });
  });
  $('#tb-sup').addEventListener('change', (e) => { app.filter.state.support = e.target.value; refresh(); });
  $('#tb-aug').addEventListener('change', (e) => { app.filter.state.showAugmented = e.target.checked; refresh(); });
  $('#tb-ext').addEventListener('change', (e) => { app.filter.state.showExtended = e.target.checked; refresh(); });
  $('#tb-lab').addEventListener('change', (e) => { app.filter.state.showLabels = e.target.checked; refresh(); });
  $('#tb-reset').addEventListener('click', () => {
    $('#tb-q').value = '';
    $('#tb-sup').value = 'all';
    bar.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = c.id !== 'tb-ext'; });
    app.filter.state.showLabels = true;
    app.filter.reset();
    refresh();
  });

  // 학습 경로 — 툴바의 선택 상자에서 언제든 시작할 수 있다
  const sel = $('#tb-tour');
  sel.innerHTML = '<option value="">선택…</option>'
    + app.tours.map((t) => `<option value="${t.id}">${t.titleKo}</option>`).join('');
  sel.addEventListener('change', (e) => {
    if (e.target.value) app.tour.start(e.target.value);
    e.target.value = '';
  });
  refresh();
}

function buildPathfinder() {
  const opts = app.dists.map((d) => `<option value="${d.id}">${d.nameKo}</option>`).join('');
  const bar = $('#pathbar');
  bar.innerHTML = `
    <label>경로 찾기</label>
    <select id="pf-from" aria-label="출발 분포">${opts}</select>
    <span aria-hidden="true">→</span>
    <select id="pf-to" aria-label="도착 분포">${opts}</select>
    <button class="btn btn-sm" id="pf-go" type="button">찾기</button>
    <button class="btn btn-sm btn-ghost" id="pf-clear" type="button">지우기</button>`;
  $('#pf-from').value = 'unif01';
  $('#pf-to').value = 'f';
  $('#pf-go').addEventListener('click', () => {
    const path = findPath(app.rels, $('#pf-from').value, $('#pf-to').value);
    app.ui.showPath(path);
    renderPathResult(path);
  });
  $('#pf-clear').addEventListener('click', () => {
    app.ui.showPath(null);
    $('#path-result').innerHTML = '';
  });
}

function renderPathResult(path) {
  const box = $('#path-result');
  box.innerHTML = '';
  if (!path) { box.textContent = '연결 경로를 찾지 못했습니다.'; return; }
  if (!path.edges.length) { box.textContent = '같은 분포입니다.'; return; }
  const steps = describePath(path, app.byId);
  box.appendChild(el('ol', { class: 'path-steps' }, steps.map((s) => el('li', {}, [
    el('button', {
      class: 'path-step', type: 'button', onclick: () => selectEdge(s.id),
    }, [
      el('span', { class: 'path-num', text: s.id }),
      el('span', { text: `${s.fromKo} → ${s.toKo}` }),
      s.viaLatex ? el('span', { class: 'path-tex', html: texToHtml(s.viaLatex) }) : null,
      s.reversedWarn ? el('span', { class: 'path-warn', text: '역방향' }) : null,
    ]),
  ]))));
}

function bindChrome() {
  $('#btn-reset').addEventListener('click', () => app.ui.reset());
  $('#btn-panel').addEventListener('click', () => togglePanel());
  const themeBtn = $('#btn-theme');
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    clearColorCache();
    window.dispatchEvent(new Event('resize'));
    themeBtn.textContent = next === 'dark' ? '라이트' : next === 'light' ? '시스템' : '다크';
  });
}

function openPanel() { document.body.classList.remove('panel-collapsed'); }
function togglePanel() { document.body.classList.toggle('panel-collapsed'); }

boot().catch((e) => {
  console.error('[main] 초기화 실패', e);
  const box = $('#panel-body');
  if (box) box.innerHTML = `<p class="callout callout-warn">데이터를 불러오지 못했습니다. `
    + `<code>python3 -m http.server</code> 로 실행 중인지 확인하세요.<br>${e.message}</p>`;
});
