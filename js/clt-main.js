// clt.html 진입점.

import { $, clearColorCache } from './util/dom.js';
import { CltSimulator } from './panel/clt.js';

async function boot() {
  // 중심극한정리는 연속·이산을 가리지 않는다. 관계도의 분포 전부를 원천분포로 제공한다.
  const [all, extras] = await Promise.all([
    fetch('data/distributions.json').then((r) => r.json()),
    fetch('data/clt-sources.json').then((r) => r.json()),
  ]);
  const dists = all;
  const sim = new CltSimulator($('#clt'), { dists, extras });
  sim.mount();

  const themeBtn = $('#btn-theme');
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    themeBtn.textContent = next === 'dark' ? '라이트' : next === 'light' ? '시스템' : '다크';
    clearColorCache();
    sim.run();
  });
  window.addEventListener('resize', () => sim.run(), { passive: true });
  window.__clt = sim;   // test/clt.html 에서 검사에 쓴다
}

boot().catch((e) => {
  console.error('[clt] 초기화 실패', e);
  $('#clt').innerHTML = `<p class="callout callout-warn">데이터를 불러오지 못했습니다. `
    + `<code>python3 -m http.server</code> 로 실행 중인지 확인하세요.<br>${e.message}</p>`;
});
