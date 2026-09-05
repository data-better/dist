// 연속·이산 분포를 하나의 이름공간으로 묶는다.
//
// 패널·플롯·검증 코드가 "이게 연속인가 이산인가"를 매번 분기하지 않도록,
// id 하나로 밀도(또는 질량)·누적·모멘트·표본생성에 접근할 수 있게 한다.
// 연속과 이산의 id 는 겹치지 않는다 (겹치면 아래 assert 가 잡는다).

import { pdf } from './pdf.js';
import { cdf } from './cdf.js';
import { getMoments as contMoments } from './moments.js';
import { sample } from './sample.js';
import { pmf, cdfD, momentsD, sampleD, isDiscreteId, supportRange } from './discrete.js';

const clash = Object.keys(pmf).filter((k) => k in pdf);
if (clash.length) console.warn(`[registry] 연속·이산 id 충돌: ${clash.join(', ')}`);

/** 밀도함수(연속) 또는 확률질량함수(이산) */
export const density = { ...pdf, ...pmf };
/** 누적분포함수 */
export const cumulative = { ...cdf, ...cdfD };
/** 표본생성 */
export const sampler = { ...sample, ...sampleD };

export const isDiscrete = isDiscreteId;
export { supportRange };

/** @returns {{mean:number|null, variance:number|null, skewness:number|null}} */
export function momentsOf(id, params = {}) {
  if (isDiscreteId(id)) {
    const fn = momentsD[id];
    return fn ? fn(params) : { mean: null, variance: null, skewness: null };
  }
  return contMoments(id, params);
}

/** CLT 전제(유한 평균·분산)를 만족하는가 — 연속·이산 공통 */
export function hasFiniteMoments(id, params = {}) {
  const m = momentsOf(id, params);
  return m.mean !== null && m.variance !== null && Number.isFinite(m.variance);
}

/**
 * 플롯용 x 범위.
 * 이산분포는 막대가 잘리지 않도록 정수 지지집합의 양옆에 0.5씩 여유를 둔다.
 */
export function plotRange(dist, params) {
  if (dist.discrete) {
    const [lo, hi] = supportRange(dist.id, params);
    return [lo - 0.5, hi + 0.5];
  }
  return null;   // 연속은 range.js 가 처리한다
}
