// 가이드 투어 (PRD F6) — 미리 정의된 학습 경로를 한 단계씩 안내한다.
// 각 단계는 특정 노드/엣지로 이동하며 설명 카드를 띄운다.

import { el, $ } from '../util/dom.js';

export class TourRunner {
  /**
   * @param {HTMLElement} host 투어 카드를 붙일 컨테이너
   * @param {object} deps { tours, onGoto(kind,id), onHighlight(path|null) }
   */
  constructor(host, { tours, onGoto, onHighlight }) {
    this.host = host;
    this.tours = tours;
    this.onGoto = onGoto;
    this.onHighlight = onHighlight;
    this.tour = null;
    this.idx = 0;
  }

  get active() { return this.tour !== null; }

  start(tourId) {
    const t = this.tours.find((x) => x.id === tourId);
    if (!t) return;
    this.tour = t;
    this.idx = 0;
    this._highlight();
    this._render();
    this._goto();
  }

  stop() {
    this.tour = null;
    this.host.hidden = true;
    this.host.innerHTML = '';
    this.onHighlight(null);
  }

  next() { if (this.idx < this.tour.steps.length - 1) { this.idx++; this._render(); this._goto(); } }
  prev() { if (this.idx > 0) { this.idx--; this._render(); this._goto(); } }

  _goto() {
    const st = this.tour.steps[this.idx];
    this.onGoto(st.kind, st.id);
  }

  /** 투어에 등장하는 노드·엣지 전체를 경로로 강조한다 */
  _highlight() {
    const nodes = this.tour.steps.filter((s) => s.kind === 'node').map((s) => s.id);
    const edges = this.tour.steps.filter((s) => s.kind === 'edge').map((s) => ({ id: s.id }));
    this.onHighlight({ nodes, edges });
  }

  _render() {
    const t = this.tour;
    const st = t.steps[this.idx];
    const n = t.steps.length;
    this.host.hidden = false;
    this.host.innerHTML = '';
    this.host.append(
      el('div', { class: 'tour-bar' }, [
        el('div', { class: 'tour-meta' }, [
          el('span', { class: 'tour-name', text: t.titleKo }),
          el('span', { class: 'tour-count', text: `${this.idx + 1} / ${n}` }),
        ]),
        el('div', { class: 'tour-progress' }, [
          el('i', { style: `width:${((this.idx + 1) / n) * 100}%` }),
        ]),
        el('h3', { class: 'tour-step-title' }, [
          el('span', { class: `tour-kind tour-kind-${st.kind}`, text: st.kind === 'node' ? '분포' : '관계' }),
          el('span', { text: st.titleKo }),
        ]),
        el('p', { class: 'tour-body', text: st.bodyKo }),
        el('div', { class: 'tour-actions' }, [
          el('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', text: '← 이전',
            disabled: this.idx === 0 ? '' : null,
            onclick: () => this.prev(),
          }),
          this.idx < n - 1
            ? el('button', { class: 'btn btn-sm', type: 'button', text: '다음 →', onclick: () => this.next() })
            : el('button', { class: 'btn btn-sm', type: 'button', text: '투어 마치기', onclick: () => this.stop() }),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: '닫기', onclick: () => this.stop() }),
        ]),
      ]),
    );
  }
}

/** 투어 선택 목록을 만든다 */
export function tourMenu(tours, onPick) {
  return el('div', { class: 'tour-menu' }, [
    el('span', { class: 'presets-label', text: '학습 경로' }),
    ...tours.map((t) => el('button', {
      class: 'btn btn-sm btn-tour', type: 'button',
      title: t.descriptionKo,
      onclick: () => onPick(t.id),
    }, [
      el('b', { text: t.titleKo }),
      el('span', { class: 'tour-sub', text: t.subtitleKo }),
    ])),
  ]);
}
