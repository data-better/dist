// 관계도 상호작용 — 호버 강조, 선택, 줌·팬, 키보드 내비게이션.
// 선택은 커스텀 이벤트로만 알린다. 패널 렌더링은 이 모듈의 책임이 아니다.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

export function attachInteraction(graph, dists, rels, host) {
  const { svg, viewport, nodeEls, edgeEls, labelEls } = graph;
  const neighbors = buildNeighbors(rels);
  const state = { k: 1, tx: 0, ty: 0, selected: null, hovered: null };

  // ── 줌·팬 ───────────────────────────────────────────────────────────────
  function applyTransform() {
    viewport.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.k})`);
  }
  function reset() { state.k = 1; state.tx = 0; state.ty = 0; applyTransform(); }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nk = clamp(state.k * factor, ZOOM_MIN, ZOOM_MAX);
    const ratio = nk / state.k;
    state.tx = pt.x - ratio * (pt.x - state.tx);
    state.ty = pt.y - ratio * (pt.y - state.ty);
    state.k = nk;
    applyTransform();
  }, { passive: false });

  let dragging = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.node, .edge')) return;
    dragging = { x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const s = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    state.tx = dragging.tx + (e.clientX - dragging.x) / s;
    state.ty = dragging.ty + (e.clientY - dragging.y) / s;
    applyTransform();
  });
  const endDrag = () => { dragging = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // ── 호버 강조 ───────────────────────────────────────────────────────────
  function highlight(nodeId) {
    state.hovered = nodeId;
    if (!nodeId) {
      svg.classList.remove('has-focus');
      nodeEls.forEach((g) => g.classList.remove('dim', 'near'));
      edgeEls.forEach((g) => g.classList.remove('dim', 'near'));
      labelEls.forEach((g) => g.classList.remove('dim'));
      return;
    }
    svg.classList.add('has-focus');
    const nb = neighbors.get(nodeId) || { nodes: new Set(), edges: new Set() };
    nodeEls.forEach((g, id) => {
      const on = id === nodeId || nb.nodes.has(id);
      g.classList.toggle('dim', !on);
      g.classList.toggle('near', on);
    });
    edgeEls.forEach((g, id) => {
      const on = nb.edges.has(id);
      g.classList.toggle('dim', !on);
      g.classList.toggle('near', on);
    });
    labelEls.forEach((g, id) => g.classList.toggle('dim', !nb.edges.has(id)));
  }

  // ── 선택 ────────────────────────────────────────────────────────────────
  function select(kind, id, { silent = false } = {}) {
    state.selected = id ? { kind, id } : null;
    nodeEls.forEach((g, k) => g.classList.toggle('selected', kind === 'node' && k === id));
    edgeEls.forEach((g, k) => g.classList.toggle('selected', kind === 'edge' && k === id));
    if (!silent) {
      host.dispatchEvent(new CustomEvent(kind === 'node' ? 'node-selected' : 'edge-selected',
        { detail: { id } }));
    }
  }

  nodeEls.forEach((g, id) => {
    g.addEventListener('pointerenter', () => highlight(id));
    g.addEventListener('pointerleave', () => highlight(null));
    g.addEventListener('focus', () => highlight(id));
    g.addEventListener('blur', () => highlight(null));
    g.addEventListener('click', () => select('node', id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select('node', id); }
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); moveFocus(id, e.key); }
    });
  });

  edgeEls.forEach((g, id) => {
    g.addEventListener('click', () => select('edge', id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select('edge', id); }
    });
  });

  /** 방향키로 가장 가까운 인접 노드로 포커스 이동 */
  function moveFocus(fromId, key) {
    const byId = new Map(dists.map((d) => [d.id, d]));
    const cur = byId.get(fromId);
    const nb = [...(neighbors.get(fromId)?.nodes || [])].map((i) => byId.get(i)).filter(Boolean);
    const want = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key];
    if (!want || !cur) return;
    let best = null, bestScore = -Infinity;
    for (const n of nb) {
      const dx = n.position.x - cur.position.x, dy = n.position.y - cur.position.y;
      const len = Math.hypot(dx, dy) || 1;
      const align = (dx / len) * want[0] + (dy / len) * want[1];
      if (align < 0.35) continue;
      const score = align - len / 2000;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (best) nodeEls.get(best.id)?.focus();
  }

  /** 경로 강조 — pathfind 결과를 받아 표시한다 */
  function showPath(path) {
    nodeEls.forEach((g) => g.classList.remove('on-path'));
    edgeEls.forEach((g) => g.classList.remove('on-path'));
    if (!path) { svg.classList.remove('has-path'); return; }
    svg.classList.add('has-path');
    for (const n of path.nodes) nodeEls.get(n)?.classList.add('on-path');
    for (const e of path.edges) edgeEls.get(e.id)?.classList.add('on-path');
  }

  return { select, highlight, reset, showPath, state };
}

function buildNeighbors(rels) {
  const map = new Map();
  const touch = (id) => {
    if (!map.has(id)) map.set(id, { nodes: new Set(), edges: new Set() });
    return map.get(id);
  };
  for (const r of rels) {
    const a = touch(r.from), b = touch(r.to);
    a.edges.add(r.id); b.edges.add(r.id);
    if (r.from !== r.to) { a.nodes.add(r.to); b.nodes.add(r.from); }
  }
  return map;
}

function svgPoint(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
  const offX = (rect.width - vb.width * scale) / 2;
  const offY = (rect.height - vb.height * scale) / 2;
  return { x: (clientX - rect.left - offX) / scale, y: (clientY - rect.top - offY) / scale };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
