// 검색 및 필터 (PRD F5) — 관계도에서 무엇을 보여 줄지 결정한다.
// 필터는 노드·엣지를 지우지 않고 흐리게(dim) 처리한다. 지도에서 위치를 잃지 않게 하기 위해서다.

const SUPPORT_KO = {
  all: '전체',
  line: '실수 전체 (−∞, ∞)',
  halfline: '양의 반직선 (0, ∞)',
  bounded: '유계 구간',
};

export class GraphFilter {
  constructor(graph, dists, rels) {
    this.graph = graph;
    this.dists = dists;
    this.rels = rels;
    this.state = {
      query: '',
      types: new Set(['transform', 'special', 'limit']),
      support: 'all',
      showAugmented: true,
      showExtended: false,   // 화면을 가로지르는 긴 확장 관계는 기본 숨김
      showLabels: true,
    };
  }

  /** 검색어가 이 분포에 걸리는가 — 한글명·영문명·표기·id 를 모두 본다 */
  _matches(d, q) {
    if (!q) return true;
    const hay = [d.id, d.nameKo, d.nameEn, d.notation, ...(d.aliases || [])]
      .join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  _supportOk(d) {
    return this.state.support === 'all' || d.support.type === this.state.support;
  }

  apply() {
    const { nodeEls, edgeEls, labelEls, svg } = this.graph;
    const s = this.state;
    const q = s.query.trim();

    // 지지집합은 하드 필터(노드를 감춘다), 검색어는 소프트 필터다.
    // 검색은 걸린 노드뿐 아니라 **그 노드에 연결된 관계와 이웃**까지 남긴다.
    // 그러지 않으면 분포 하나를 검색했을 때 관계가 0개가 되어 지도로서 쓸모가 없다.
    const supportOk = new Set(this.dists.filter((d) => this._supportOk(d)).map((d) => d.id));
    const hits = new Set(this.dists.filter((d) => supportOk.has(d.id) && this._matches(d, q)).map((d) => d.id));

    let shownEdges = 0;
    const keepNodes = new Set(hits);
    const edgeOn = new Map();
    for (const r of this.rels) {
      const typeOk = s.types.has(r.type);
      const augOk = s.showAugmented || !r.isAugmented;
      const extOk = s.showExtended || !r.isExtended;
      const endsOk = supportOk.has(r.from) && supportOk.has(r.to);
      // 검색 중이면 한쪽 끝만 걸려도 그 관계를 보여 준다
      const queryOk = !q || hits.has(r.from) || hits.has(r.to);
      const on = typeOk && augOk && extOk && endsOk && queryOk;
      edgeOn.set(r.id, on);
      if (on) { shownEdges++; keepNodes.add(r.from); keepNodes.add(r.to); }
    }

    for (const d of this.dists) {
      const on = supportOk.has(d.id) && (!q || keepNodes.has(d.id));
      const g = nodeEls.get(d.id);
      if (!g) continue;
      g.classList.toggle('filtered-out', !on);
      g.classList.toggle('search-hit', !!q && hits.has(d.id));
      g.classList.toggle('search-near', !!q && on && !hits.has(d.id));
    }
    for (const r of this.rels) {
      const on = edgeOn.get(r.id);
      edgeEls.get(r.id)?.classList.toggle('filtered-out', !on);
      labelEls.get(r.id)?.classList.toggle('filtered-out', !on);
    }
    const visibleNodes = new Set([...keepNodes].filter((id) => supportOk.has(id)));

    svg.classList.toggle('hide-labels', !s.showLabels);
    svg.classList.toggle('filtering',
      !!q || s.support !== 'all' || s.types.size < 3 || !s.showAugmented);

    return { nodes: visibleNodes.size, edges: shownEdges };
  }

  reset() {
    this.state.query = '';
    this.state.types = new Set(['transform', 'special', 'limit']);
    this.state.support = 'all';
    this.state.showAugmented = true;
    this.state.showExtended = false;
    return this.apply();
  }
}

export { SUPPORT_KO };
