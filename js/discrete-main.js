// discrete.html 진입점 — 관계도 렌더링·상호작용·패널은 연속 페이지와 같은 모듈을 쓴다.
// 다른 것은 데이터 파일과, 이산/다리 노드를 구분해 보여 주는 범례뿐이다.

import { $, el, clearColorCache } from './util/dom.js';
import { canParseTex, texToHtml } from './util/latex.js';
import { validateData, reportValidation } from './util/validate.js';
import { loadGraphData, selectGraph } from './util/graphdata.js';
import { renderGraph } from './graph/render.js';
import { attachInteraction } from './graph/interaction.js';
import { findPath, describePath } from './graph/pathfind.js';
import { GraphFilter } from './graph/filter.js';
import { DistributionPanel } from './panel/distribution.js';
import { RelationPanel } from './panel/relation.js';

const app = {};

async function boot() {
  const { dists, rels } = selectGraph(await loadGraphData(), 'discrete');
  app.dists = dists;
  app.rels = rels;
  app.byId = new Map(dists.map((d) => [d.id, d]));

  reportValidation(validateData(dists, rels, canParseTex));

  const graph = renderGraph($('#graph'), dists, rels);
  app.graph = graph;
  const host = $('#app');
  app.ui = attachInteraction(graph, dists, rels, host);
  app.filter = new GraphFilter(graph, dists, rels);

  // 다리 노드에 표시를 남긴다 — 이 관계도의 주인공은 이산분포다
  for (const d of dists) {
    if (d.isBridge) graph.nodeEls.get(d.id)?.classList.add('node-bridge');
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

  buildLegend();
  buildToolbar();
  buildPathfinder();
  bindChrome();

  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
}

function routeFromHash() {
  const m = /^#\/(node|edge)\/([A-Za-z0-9_]+)$/.exec(location.hash);
  if (!m) { showEmpty(); app.ui.select('node', null, { silent: true }); return; }
  const [, kind, id] = m;
  if (kind === 'node' && app.byId.has(id)) { app.ui.select('node', id, { silent: true }); showNode(id); }
  else if (kind === 'edge' && app.rels.some((r) => r.id === id)) {
    app.ui.select('edge', id, { silent: true }); showEdge(id);
  }
}
const selectNode = (id) => { location.hash = `#/node/${id}`; };
const selectEdge = (id) => { location.hash = `#/edge/${id}`; };
function showNode(id) { location.hash = `#/node/${id}`; openPanel(); app.distPanel.show(id); }
function showEdge(id) { location.hash = `#/edge/${id}`; openPanel(); app.relPanel.show(id); }

function showEmpty() {
  const box = $('#panel-body');
  box.innerHTML = '';
  box.append(el('div', { class: 'panel-empty' }, [
    el('h2', { text: '이산분포 관계 탐색기' }),
    el('p', { text: '이산분포 7종과, 이들이 연속 세계로 건너가는 다리 5종을 함께 그렸습니다. 노드를 클릭하면 확률질량함수를, 화살표를 클릭하면 관계와 유도 과정을 볼 수 있습니다.' }),
    el('ul', { class: 'hint-list' }, [
      el('li', { text: '테두리가 진한 노드가 이산분포, 점선 테두리가 연속 쪽으로 건너가는 다리입니다.' }),
      el('li', { text: '이산분포는 곡선이 아니라 막대(스템)로 그립니다. 정수에서만 확률이 정의되기 때문입니다.' }),
      el('li', { text: '실선 화살표는 변환·특수화, 점선 화살표는 극한 관계입니다.' }),
    ]),
    el('p', { class: 'callout callout-info' }, [
      el('b', { text: '중심극한정리는 이 관계도의 7개 분포 전부에 적용됩니다. ' }),
      el('span', { text: '이항·포아송·음이항에서 정규로 가는 점선 셋은 그중 이름이 붙은 사례일 뿐입니다. 어느 노드를 열든 패널 맨 아래의 버튼으로 직접 확인할 수 있습니다.' }),
    ]),
    el('a', { class: 'btn btn-cta', href: 'clt.html', text: '중심극한정리 시뮬레이터 열기 →' }),
    el('a', { class: 'btn btn-cta', href: 'index.html', text: '연속분포 관계도 →' }),
  ]));
}

function buildLegend() {
  $('#legend').innerHTML = `
    <span class="lg"><i class="lg-line lg-solid"></i>변환·특수화</span>
    <span class="lg"><i class="lg-line lg-dash"></i>극한</span>
    <span class="lg"><i class="lg-box lg-box-d"></i>이산</span>
    <span class="lg"><i class="lg-box lg-box-b"></i>연속(다리)</span>`;
}

function buildToolbar() {
  const bar = $('#toolbar');
  bar.innerHTML = `
    <div class="tb-group tb-search">
      <label for="tb-q">검색</label>
      <input type="search" id="tb-q" placeholder="분포명·표기 (예: 포아송, binom)" aria-label="분포 검색">
    </div>
    <div class="tb-group" role="group" aria-label="관계 유형 필터">
      <label>관계</label>
      <label class="chk"><input type="checkbox" data-type="transform" checked><span>변환</span></label>
      <label class="chk"><input type="checkbox" data-type="special" checked><span>특수화</span></label>
      <label class="chk"><input type="checkbox" data-type="limit" checked><span>극한</span></label>
    </div>
    <div class="tb-group">
      <label class="chk"><input type="checkbox" id="tb-ext"><span>확장</span></label>
      <label class="chk"><input type="checkbox" id="tb-lab" checked><span>라벨</span></label>
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
  $('#tb-ext').addEventListener('change', (e) => { app.filter.state.showExtended = e.target.checked; refresh(); });
  $('#tb-lab').addEventListener('change', (e) => { app.filter.state.showLabels = e.target.checked; refresh(); });
  $('#tb-reset').addEventListener('click', () => {
    $('#tb-q').value = '';
    bar.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = c.id !== 'tb-ext'; });
    app.filter.state.showLabels = true;
    app.filter.reset();
    refresh();
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
  $('#pf-from').value = 'bernoulli';
  $('#pf-to').value = 'gamma';
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
    el('button', { class: 'path-step', type: 'button', onclick: () => selectEdge(s.id) }, [
      el('span', { class: 'path-num', text: s.id }),
      el('span', { text: `${s.fromKo} → ${s.toKo}` }),
      s.viaLatex ? el('span', { class: 'path-tex', html: texToHtml(s.viaLatex) }) : null,
      s.reversedWarn ? el('span', { class: 'path-warn', text: '역방향' }) : null,
    ]),
  ]))));
}

function bindChrome() {
  $('#btn-reset').addEventListener('click', () => app.ui.reset());
  $('#btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-collapsed'));
  const themeBtn = $('#btn-theme');
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    themeBtn.textContent = next === 'dark' ? '라이트' : next === 'light' ? '시스템' : '다크';
    clearColorCache();
    window.dispatchEvent(new Event('resize'));
  });
}

function openPanel() { document.body.classList.remove('panel-collapsed'); }

boot().catch((e) => {
  console.error('[discrete] 초기화 실패', e);
  const box = $('#panel-body');
  if (box) box.innerHTML = `<p class="callout callout-warn">데이터를 불러오지 못했습니다. `
    + `<code>python3 -m http.server</code> 로 실행 중인지 확인하세요.<br>${e.message}</p>`;
});
