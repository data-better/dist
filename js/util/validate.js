// 데이터 정합성 검사 (PRD §5.3).
// 앱 시작 시 자동 실행한다. 실패해도 throw 하지 않고 콘솔 경고만 남긴 뒤 앱은 계속 동작한다.

import { density as pdf, cumulative as cdf, sampler as sample }
  from '../distributions/registry.js';

/**
 * @param {Array} dists  data/distributions.json
 * @param {Array} rels   data/relations.json
 * @param {(tex:string)=>boolean} [texOk] LaTeX 파싱 가능 여부 판정 함수 (KaTeX 래퍼)
 * @returns {{checks: Array<{id:string,nameKo:string,pass:boolean,detail:string}>, allPass:boolean}}
 */
export function validateData(dists, rels, texOk = null) {
  const checks = [];
  const add = (id, nameKo, pass, detail = '') => checks.push({ id, nameKo, pass, detail });

  const ids = new Set(dists.map((d) => d.id));

  // 1. 노드 id 중복
  const dupD = dists.map((d) => d.id).filter((v, i, a) => a.indexOf(v) !== i);
  add('node-unique', '노드 id 중복 없음', dupD.length === 0, dupD.join(', '));

  // 2. 엣지 id 중복
  const dupR = rels.map((r) => r.id).filter((v, i, a) => a.indexOf(v) !== i);
  add('edge-unique', '엣지 id 중복 없음', dupR.length === 0, dupR.join(', '));

  // 3. 엣지 끝점이 존재하는 노드인가
  const badEnds = rels.filter((r) => !ids.has(r.from) || !ids.has(r.to))
    .map((r) => `${r.id}(${r.from}→${r.to})`);
  add('edge-endpoints', '엣지 끝점이 존재하는 노드', badEnds.length === 0, badEnds.join(', '));

  // 4. pdf/cdf/sampler 함수명이 실제로 등록되어 있는가
  const badFn = [];
  for (const d of dists) {
    if (!pdf[d.pdf]) badFn.push(`${d.id}.pdf=${d.pdf}`);
    if (!cdf[d.cdf]) badFn.push(`${d.id}.cdf=${d.cdf}`);
    if (!sample[d.sampler]) badFn.push(`${d.id}.sampler=${d.sampler}`);
  }
  add('fn-registered', 'pdf/cdf/sampler 함수 등록됨', badFn.length === 0, badFn.join(', '));

  // 5. 고아 노드 (엣지에 한 번도 등장하지 않는 노드)
  const touched = new Set();
  for (const r of rels) { touched.add(r.from); touched.add(r.to); }
  const orphans = [...ids].filter((i) => !touched.has(i));
  add('no-orphan', '고아 노드 없음', orphans.length === 0, orphans.join(', '));

  // 6. 무향 연결성
  const adj = new Map([...ids].map((i) => [i, []]));
  for (const r of rels) {
    if (adj.has(r.from) && adj.has(r.to) && r.from !== r.to) {
      adj.get(r.from).push(r.to);
      adj.get(r.to).push(r.from);
    }
  }
  const seen = new Set();
  const queue = [dists[0]?.id].filter(Boolean);
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nb of adj.get(cur) || []) if (!seen.has(nb)) queue.push(nb);
  }
  const unreached = [...ids].filter((i) => !seen.has(i));
  add('connected', '그래프가 연결됨(무향)', unreached.length === 0, unreached.join(', '));

  // 7. 모수 기본값이 슬라이더 범위 안에 있는가
  const badParam = [];
  for (const d of dists) {
    for (const p of d.params || []) {
      if (p.default < p.min || p.default > p.max) badParam.push(`${d.id}.${p.symbol}`);
    }
  }
  add('param-range', '모수 기본값이 범위 안', badParam.length === 0, badParam.join(', '));

  // 8. 유도가 비어 있는 엣지 (limit 타입은 limitDemo 로 대체 가능)
  const noDeriv = rels.filter((r) =>
    (!r.derivation || r.derivation.length === 0) && !r.limitDemo).map((r) => r.id);
  add('derivation', '모든 엣지에 유도 또는 수렴시연 존재', noDeriv.length === 0, noDeriv.join(', '));

  // 9. LaTeX 파싱 (KaTeX 래퍼가 주어졌을 때만)
  if (typeof texOk === 'function') {
    const badTex = [];
    const tryTex = (tex, where) => {
      if (tex && !texOk(tex)) badTex.push(where);
    };
    for (const d of dists) {
      tryTex(d.notation, `${d.id}.notation`);
      tryTex(d.pdfLatex, `${d.id}.pdfLatex`);
      for (const k of ['meanLatex', 'varianceLatex', 'mgfLatex']) {
        tryTex(d.moments?.[k], `${d.id}.${k}`);
      }
      for (const p of d.params || []) tryTex(p.notation, `${d.id}.param.${p.symbol}`);
    }
    for (const r of rels) {
      tryTex(r.conditionLatex, `${r.id}.condition`);
      tryTex(r.transformLatex, `${r.id}.transform`);
      (r.derivation || []).forEach((s, i) => tryTex(s.latex, `${r.id}.derivation[${i}]`));
    }
    add('latex', 'LaTeX 파싱 통과', badTex.length === 0, badTex.join(', '));
  }

  return { checks, allPass: checks.every((c) => c.pass) };
}

/** 콘솔에 결과를 남긴다. 실패해도 throw 하지 않는다. */
export function reportValidation(result) {
  for (const c of result.checks) {
    if (!c.pass) console.warn(`[validate] FAIL ${c.id} — ${c.nameKo}: ${c.detail}`);
  }
  return result.allPass;
}
