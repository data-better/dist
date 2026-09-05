// 관계도 SVG 렌더링 — 순수 SVG. D3 등 라이브러리를 쓰지 않는다 (PRD §6.2).
// 노드 배치는 데이터에 고정된 좌표를 그대로 쓴다. 자동 배치(force layout)를 구현하지 않는다.

import { svgEl } from '../util/dom.js';
import { texToHtml } from '../util/latex.js';

export const VIEWBOX = { w: 780, h: 610 };
const VB_PAD = 26;   // 자기 순환 라벨이 위아래로 잘리지 않도록 여백을 둔다
const NODE_W = 96;
const LABEL_GAP = 13;   // 라벨을 곡선에서 띄우는 거리(px). 크게 두면 어느 화살표의 조건인지 흐려진다
const NODE_H = 30;

/** 노드 사각형의 경계와 (cx,cy)→(px,py) 방향 직선의 교점 */
function boundaryPoint(node, px, py, pad = 3) {
  const cx = node.position.x, cy = node.position.y;
  const dx = px - cx, dy = py - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = NODE_W / 2 + pad, hh = NODE_H / 2 + pad;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** 2차 베지어 제어점 — bend 만큼 수직 방향으로 민다 */
function controlPoint(a, b, bend) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: mx - dy * bend, y: my + dx * bend };
}

/** 2차 베지어 위의 점 */
function quadAt(a, c, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/** 엣지 하나의 기하 정보 (path d 문자열 + 라벨 위치) */
export function edgeGeometry(rel, nodeById) {
  const from = nodeById.get(rel.from);
  const to = nodeById.get(rel.to);
  if (!from || !to) return null;

  if (rel.from === rel.to) {
    // 자기 순환 — 노드 위(또는 아래)에 원형 루프
    const below = !!rel.selfLoopBelow;
    const cx = from.position.x, cy = from.position.y;
    const dir = below ? 1 : -1;
    const y0 = cy + dir * (NODE_H / 2 + 2);
    const r = 26;
    const d = `M ${cx - 16} ${y0} C ${cx - 40} ${y0 + dir * r * 1.6}, `
      + `${cx + 40} ${y0 + dir * r * 1.6}, ${cx + 16} ${y0}`;
    return { d, label: { x: cx, y: y0 + dir * (r + 8) }, mid: { x: cx, y: y0 + dir * r } };
  }

  const bend = rel.bend ?? 0.12;
  const rough = controlPoint(from.position, to.position, bend);
  const a = boundaryPoint(from, rough.x, rough.y);
  const b = boundaryPoint(to, rough.x, rough.y);
  const c = controlPoint(a, b, bend);
  const d = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} `
    + `${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  const mid = quadAt(a, c, b, 0.5);

  // 라벨은 곡선 중점에서 **바깥쪽 법선 방향으로 조금만** 띄운다.
  // 화살표에 붙어 있어야 어느 화살표의 조건인지 헷갈리지 않는다 (그래서 값이 작다).
  // 방향은 곡선이 부푼 쪽 — 직선이면 진행 방향의 왼쪽 법선.
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = (c.x - (a.x + b.x) / 2), ny = (c.y - (a.y + b.y) / 2);
  const nlen = Math.hypot(nx, ny);
  if (nlen < 1) { nx = -dy / len; ny = dx / len; } else { nx /= nlen; ny /= nlen; }
  const label = { x: mid.x + nx * LABEL_GAP, y: mid.y + ny * LABEL_GAP };

  return { d, mid, label, start: a, end: b };
}

/**
 * 관계도를 그린다.
 * @returns {{svg: SVGSVGElement, viewport: SVGGElement, nodeEls: Map, edgeEls: Map, labelEls: Map}}
 */
export function renderGraph(container, dists, rels, opts = {}) {
  container.innerHTML = '';
  const nodeById = new Map(dists.map((d) => [d.id, d]));
  const vb = opts.viewBox || VIEWBOX;

  const svg = svgEl('svg', {
    viewBox: `0 ${-VB_PAD} ${vb.w} ${vb.h + VB_PAD * 2}`,
    class: 'graph-svg',
    role: 'group',
    'aria-label': '확률분포 관계도',
    preserveAspectRatio: 'xMidYMid meet',
  });

  // 화살촉 — 실선용/점선용을 색으로 구분하되, 엣지 자체는 선 스타일로 구분한다(§8.4)
  const defs = svgEl('defs', {}, [
    marker('arrow-solid', 'var(--edge)'),
    marker('arrow-limit', 'var(--edge-limit)'),
    marker('arrow-hl', 'var(--accent)'),
  ]);
  svg.appendChild(defs);

  const viewport = svgEl('g', { id: 'viewport' });
  const gEdges = svgEl('g', { id: 'edges' });
  const gLabels = svgEl('g', { id: 'edge-labels' });
  const gNodes = svgEl('g', { id: 'nodes' });
  viewport.append(gEdges, gLabels, gNodes);
  svg.appendChild(viewport);

  const edgeEls = new Map();
  const labelEls = new Map();
  const nodeEls = new Map();
  const anchors = new Map();   // 라벨이 원래 있어야 할 자리 — 겹침을 풀 때 여기로 당긴다

  // ── 엣지 ────────────────────────────────────────────────────────────────
  for (const rel of rels) {
    const geo = edgeGeometry(rel, nodeById);
    if (!geo) continue;
    const isLimit = rel.type === 'limit';
    const g = svgEl('g', {
      class: `edge edge-${rel.type}${rel.isAugmented ? ' edge-augmented' : ''}`,
      'data-edge': rel.id,
    });
    // 넓은 투명 히트영역 — 얇은 곡선도 쉽게 클릭되게 한다
    g.appendChild(svgEl('path', { d: geo.d, class: 'edge-hit', fill: 'none' }));
    g.appendChild(svgEl('path', {
      d: geo.d, class: 'edge-line', fill: 'none',
      'marker-end': `url(#${isLimit ? 'arrow-limit' : 'arrow-solid'})`,
    }));
    if (rel.isBinary && geo.start) {
      // 이항 관계 표시 — 시작점에 두 갈래 (PRD §11.4)
      g.appendChild(svgEl('circle', { cx: geo.start.x, cy: geo.start.y, r: 3.2, class: 'edge-binary-dot' }));
      g.appendChild(svgEl('circle', { cx: geo.start.x, cy: geo.start.y, r: 6.2, class: 'edge-binary-ring', fill: 'none' }));
    }
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `관계 ${rel.id}: ${rel.summaryKo}`);
    gEdges.appendChild(g);
    edgeEls.set(rel.id, g);

    // 라벨 (조건 또는 변환식)
    // 관계도에는 짧은 라벨을 쓴다. 전체 조건·변환식은 상세 패널에서 보여 준다.
    const tex = rel.edgeLabelLatex || rel.transformLatex || rel.conditionLatex;
    if (tex) {
      const off = rel.labelOffset || { dx: 0, dy: 0 };  // 미세 조정용. 기본 위치는 법선 오프셋이 잡는다
      const fo = svgEl('foreignObject', {
        x: geo.label.x + (off.dx || 0) - 70,
        y: geo.label.y + (off.dy || 0) - 15,
        width: 140, height: 30,
        class: 'edge-label-fo', 'data-edge': rel.id,
      });
      const div = document.createElement('div');
      div.className = 'edge-label';
      div.innerHTML = texToHtml(tex);
      fo.appendChild(div);
      gLabels.appendChild(fo);
      labelEls.set(rel.id, fo);
      anchors.set(rel.id, { x: geo.label.x + (off.dx || 0), y: geo.label.y + (off.dy || 0) });
    }
  }

  // ── 노드 ────────────────────────────────────────────────────────────────
  const degree = new Map();
  for (const r of rels) {
    degree.set(r.from, (degree.get(r.from) || 0) + 1);
    if (r.to !== r.from) degree.set(r.to, (degree.get(r.to) || 0) + 1);
  }

  for (const d of dists) {
    const g = svgEl('g', {
      class: `node node-${d.family}${d.isAugmented ? ' node-augmented' : ''}`,
      'data-node': d.id,
      tabindex: '0',
      role: 'button',
      'aria-label': `${d.nameKo} 노드, 연결된 관계 ${degree.get(d.id) || 0}개`,
      transform: `translate(${d.position.x} ${d.position.y})`,
    });
    g.appendChild(svgEl('rect', {
      x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H,
      rx: 6, class: 'node-box',
    }));
    const fo = svgEl('foreignObject', {
      x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H,
      class: 'node-label-fo',
    });
    const div = document.createElement('div');
    div.className = 'node-label';
    div.innerHTML = texToHtml(d.notation);
    fo.appendChild(div);
    g.appendChild(fo);
    gNodes.appendChild(g);
    nodeEls.set(d.id, g);
  }

  container.appendChild(svg);
  relaxLabels({ svg, viewport, labelEls, anchors, dists });
  // KaTeX 폰트가 늦게 도착하면 글자 폭이 달라진다. 그때 한 번 더 푼다.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => relaxLabels({ svg, viewport, labelEls, anchors, dists }));
  }
  return { svg, viewport, nodeEls, edgeEls, labelEls, nodeById };
}

/**
 * 라벨 겹침 풀기.
 *
 * 라벨은 자기 화살표 옆에 **붙어 있어야** 어느 관계의 조건인지 알 수 있다.
 * 그래서 자유 배치가 아니라, 원래 자리(anchor)로 당기는 용수철을 걸어 둔 채
 * 겹치는 것만 조금씩 밀어낸다. 이동 거리는 MAX_DRIFT 로 묶어 두므로
 * 어떤 라벨도 자기 화살표에서 멀어지지 않는다.
 *
 * 겹침 판정과 밀어내기는 축 정렬 사각형(AABB) 기준이고,
 * 침투가 얕은 축으로만 민다 — 그래야 라벨이 원래 자리에서 최소로 벗어난다.
 */
const MAX_DRIFT = 30;      // 앵커에서 벗어날 수 있는 최대 거리 (viewBox 단위)
const LABEL_PAD = 2;       // 라벨 사이 최소 간격
const NODE_PAD = 4;        // 노드 상자와의 최소 간격

function relaxLabels({ svg, viewport, labelEls, anchors, dists }) {
  if (!labelEls.size) return;
  const ctm = viewport.getScreenCTM();
  const scale = ctm && ctm.a ? ctm.a : (svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1));
  if (!Number.isFinite(scale) || scale <= 0) return;

  const items = [];
  for (const [id, fo] of labelEls) {
    const anchor = anchors.get(id);
    if (!anchor) continue;
    // 실제로 보이는 것은 KaTeX 조각(배경 칩)이다. foreignObject 는 140px 고정이라
    // 그 폭으로 재면 겹치지도 않는 라벨을 밀어내게 된다.
    const div = fo.firstChild;
    const r = (div.querySelector('.katex') || div).getBoundingClientRect();
    const hw = (r.width / scale) / 2 + LABEL_PAD;
    const hh = (r.height / scale) / 2 + LABEL_PAD;
    if (!(hw > 0) || !(hh > 0)) continue;
    items.push({ fo, ax: anchor.x, ay: anchor.y, x: anchor.x, y: anchor.y, hw, hh });
  }
  const boxes = dists.map((d) => ({
    x: d.position.x, y: d.position.y, hw: NODE_W / 2 + NODE_PAD, hh: NODE_H / 2 + NODE_PAD,
  }));

  /** a 를 bx 밖으로 민다. movable 이면 bx 도 반대로 같은 만큼 민다(라벨끼리). */
  const push = (a, bx, movable) => {
    const ox = a.hw + bx.hw - Math.abs(a.x - bx.x);
    const oy = a.hh + bx.hh - Math.abs(a.y - bx.y);
    if (ox <= 0 || oy <= 0) return;                  // 겹치지 않음
    const share = movable ? 0.5 : 1;
    if (ox < oy) {                                   // 침투가 얕은 축으로만 민다
      const s = (a.x < bx.x ? -1 : 1) * ox * share;
      a.x += s; if (movable) bx.x -= s;
    } else {
      const s = (a.y < bx.y ? -1 : 1) * oy * share;
      a.y += s; if (movable) bx.y -= s;
    }
  };

  for (let it = 0; it < 90; it++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) push(items[i], items[j], true);
      for (const bx of boxes) push(items[i], bx, false);
    }
    // 용수철 — 원래 자리로 당기고, 이탈 거리를 묶는다
    for (const a of items) {
      a.x += (a.ax - a.x) * 0.10;
      a.y += (a.ay - a.y) * 0.10;
      const dx = a.x - a.ax, dy = a.y - a.ay;
      const d = Math.hypot(dx, dy);
      if (d > MAX_DRIFT) { a.x = a.ax + (dx / d) * MAX_DRIFT; a.y = a.ay + (dy / d) * MAX_DRIFT; }
    }
  }

  for (const a of items) {
    a.fo.setAttribute('x', (a.x - 70).toFixed(1));
    a.fo.setAttribute('y', (a.y - 15).toFixed(1));
  }
}

function marker(id, color) {
  return svgEl('marker', {
    id, viewBox: '0 0 10 10', refX: '9', refY: '5',
    markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse',
  }, [svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color })]);
}
