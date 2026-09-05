// 두 분포 사이 최단 경로 — 무향 BFS.
// 결과에는 각 엣지의 실제 방향과 변환식을 순서대로 담는다.

/**
 * @returns {{nodes: string[], edges: Array<{id:string, forward:boolean, rel:object}>}|null}
 */
export function findPath(rels, fromId, toId) {
  if (!fromId || !toId) return null;
  if (fromId === toId) return { nodes: [fromId], edges: [] };

  const adj = new Map();
  for (const r of rels) {
    if (r.from === r.to) continue;
    if (!adj.has(r.from)) adj.set(r.from, []);
    if (!adj.has(r.to)) adj.set(r.to, []);
    adj.get(r.from).push({ to: r.to, rel: r, forward: true });
    adj.get(r.to).push({ to: r.from, rel: r, forward: false });
  }

  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toId) break;
    for (const e of adj.get(cur) || []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, { from: cur, rel: e.rel, forward: e.forward });
      queue.push(e.to);
    }
  }
  if (!prev.has(toId)) return null;

  const nodes = [];
  const edges = [];
  let cur = toId;
  while (cur != null) {
    nodes.unshift(cur);
    const step = prev.get(cur);
    if (!step) break;
    edges.unshift({ id: step.rel.id, forward: step.forward, rel: step.rel });
    cur = step.from;
  }
  return { nodes, edges };
}

/** 경로를 사람이 읽는 한 줄 설명 배열로 */
export function describePath(path, nodeById) {
  if (!path) return [];
  return path.edges.map((e, i) => {
    const a = nodeById.get(path.nodes[i]);
    const b = nodeById.get(path.nodes[i + 1]);
    const via = e.rel.transformLatex || e.rel.conditionLatex || '';
    return {
      id: e.id,
      fromKo: a?.nameKo ?? path.nodes[i],
      toKo: b?.nameKo ?? path.nodes[i + 1],
      forward: e.forward,
      viaLatex: via,
      summaryKo: e.rel.summaryKo,
      reversedWarn: !e.forward,
    };
  });
}
