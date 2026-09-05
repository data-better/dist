// 통합 데이터셋에서 한 관계도가 쓸 부분집합을 만든다.
//
// data/distributions.json 과 data/relations.json 하나가 두 관계도의 유일한 출처다.
// 노드·엣지마다 graphs 배열이 붙어 있어 어느 관계도에 나타나는지 정한다.
//   "full"     — index.html, 참조 다이어그램 전체 (연속 14 + 이산 6)
//   "discrete" — discrete.html, 이산 7종 + 연속 다리 5종
// 좌표와 곡률은 관계도마다 다르므로 positionDiscrete / bendDiscrete 로 따로 둔다.

const GRAPHS = ['full', 'discrete'];

/**
 * 통합 데이터를 읽는다.
 * @param {string} base 데이터 폴더 경로. 검증 페이지(test/)에서는 '../data/' 를 넘긴다.
 */
export async function loadGraphData(base = 'data/') {
  const [dists, rels] = await Promise.all([
    fetch(`${base}distributions.json`).then((r) => r.json()),
    fetch(`${base}relations.json`).then((r) => r.json()),
  ]);
  return { dists, rels };
}

/**
 * 한 관계도가 그릴 노드·엣지를 고르고, 그 관계도용 좌표·곡률을 적용한다.
 * 원본 객체를 건드리지 않도록 얕은 복사본을 돌려준다.
 * @param {{dists: object[], rels: object[]}} data
 * @param {'full'|'discrete'} graph
 */
export function selectGraph(data, graph) {
  if (!GRAPHS.includes(graph)) throw new Error(`알 수 없는 관계도: ${graph}`);
  const inGraph = (o) => !o.graphs || o.graphs.includes(graph);
  const discrete = graph === 'discrete';

  const dists = data.dists.filter(inGraph).map((d) => {
    const o = { ...d };
    if (discrete && d.positionDiscrete) o.position = d.positionDiscrete;
    // 이산 관계도에서 연속분포는 '다리' 노드다
    o.isBridge = discrete && !d.discrete;
    return o;
  });

  const ids = new Set(dists.map((d) => d.id));
  const rels = data.rels.filter((r) => inGraph(r) && ids.has(r.from) && ids.has(r.to)).map((r) => {
    const o = { ...r };
    if (discrete) {
      if (r.bendDiscrete !== undefined) o.bend = r.bendDiscrete;
      if (r.labelOffsetDiscrete) o.labelOffset = r.labelOffsetDiscrete;
    } else if (r.isExtendedInFull) {
      // 참조 다이어그램에 없는 보강 관계 — 전체 관계도에서는 기본으로 숨긴다
      o.isExtended = true;
    }
    return o;
  });

  return { dists, rels };
}
