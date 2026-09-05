# CLAUDE.md

## 프로젝트

대학 통계 수강생용 확률분포 관계 탐색 사이트.

- 배포: GitHub Pages → https://databetter25.github.io/distribution/
- **사양의 유일한 출처는 `PRD_distribution_explorer.md` 다.** 사양이 모호하면 추측하지 말고 질문한다.

## 절대 규칙

- **빌드 스텝 없음.** 번들러·트랜스파일러·npm 의존성을 도입하지 않는다. 브라우저가 그대로 실행하는 ES2022 모듈만 쓴다.
- **외부 CDN 링크 금지.** 모든 자원은 리포지토리 안에 있어야 한다 (오프라인 동작이 요구사항).
- **D3, jQuery, 차트/통계 라이브러리 금지.** 전부 자체 구현한다.
- **localStorage / sessionStorage 금지.** 상태는 메모리와 URL 해시로만 표현한다.
- **감마 계열은 rate 모수화로 통일한다.**
  `f(x) = λ^r/Γ(r)·x^(r−1)·e^(−λx)`, 평균 `r/λ`, 분산 `r/λ²`
  scale 모수화(평균 `rλ`)를 쓰면 안 된다. PRD §11.2 참조.
- **기하·음이항은 "시행 횟수" 규약으로 통일한다.**
  `Geom(p)` 는 첫 성공까지의 시행 횟수 `k = 1,2,…`, 평균 `1/p`
  `NB(r,p)` 는 r번째 성공까지의 시행 횟수 `k = r,r+1,…`, 평균 `r/p`
  "실패 횟수" 규약(지지집합이 0부터)을 쓰면 안 된다.

## 코드 규약

- 들여쓰기 2칸, 세미콜론 사용, 작은따옴표
- 모든 공개 함수에 JSDoc. 수치 함수에는 알고리즘 출처를 주석으로 남긴다
- 파일 하나가 300줄을 넘으면 분리를 검토한다
- 주석과 UI 문자열은 한국어, 변수·함수명은 영어
- 사용자에게 보이는 문자열을 JS에 하드코딩하지 않는다 — `data/*.json` 또는 모듈 상단 상수 객체로 모은다
- 조건부 자식을 붙일 때는 `Element.append()` 대신 `appendChildren()` 을 쓴다.
  `append()` 는 `null` 을 문자열 "null" 로 바꿔 화면에 찍는다

## 수치 계산 규칙

- 모든 PDF는 로그 스케일에서 계산 후 `exp` 한다 (오버플로 방지)
- 지지집합 밖에서는 예외 없이 0을 반환한다. `NaN`·`Infinity`를 반환하지 않는다
- 계산 결과가 유한하지 않으면 플롯에서 해당 점을 건너뛴다

## 검증

- `test/numeric.html` 을 브라우저로 열어 A~F 전 항목 PASS 확인
- `test/data.html` 로 데이터 정합성 확인
- `test/discrete.html` 로 이산분포 PMF·CDF·샘플러·관계 확인
- `test/clt.html` 로 CLT 시뮬레이터 수용 기준 확인
- `test/sim.html` 로 연속 시뮬레이션 레시피 21종의 KS 검정 확인
- `test/font-audit.html` 로 수식 파싱과 폰트 누락 확인
- **수식(LaTeX)을 추가하면 반드시 `test/font-audit.html` 을 확인한다.**
  `vendor/katex/fonts/` 에는 실사용 4종만 두었으므로 새 기호가 다른 폰트를 요구하면 이 페이지가 잡는다.
  AMS 폰트를 부르는 기호(`\therefore`, `\gtrsim` 등)는 쓰지 말고 Main 폰트에 있는 것으로 바꾼다
- **시뮬레이션 레시피를 추가·수정하면 반드시 `test/sim.html` 을 다시 확인한다**
- **수치 코드를 수정하면 반드시 `test/numeric.html` 을 다시 확인한다**
- **이산 수치·데이터를 수정하면 반드시 `test/discrete.html` 을 다시 확인한다**

## 로컬 실행

```bash
python3 -m http.server 8000
```

## 데이터 구조

관계도 두 장(`index.html` 전체 / `discrete.html` 이산)은 **같은 파일 두 개**를 읽는다.
데이터를 나눠 두면 두 화면의 설명이 어긋나므로, 파일을 늘리지 말고 필드로 구분한다.

- `data/distributions.json` — 분포 21종. `data/relations.json` — 관계 61개
- 노드·엣지의 `graphs` 배열이 어느 관계도에 나타나는지 정한다: `["full"]` · `["full","discrete"]` · `["discrete"]`
- 관계도마다 다른 값은 접미사로 둔다 — 노드는 `positionDiscrete`, 엣지는 `bendDiscrete` · `labelOffsetDiscrete`
- `isExtendedInFull` — 참조 다이어그램에 없는 보강 관계. 전체 관계도에서만 기본 숨김
- 부분집합을 만드는 곳은 `js/util/graphdata.js` 하나뿐이다. 페이지가 직접 fetch 하지 않는다
- **왕복 관계 쌍(A→B, B→A)은 `bend` 부호를 같게** 둬야 서로 반대편으로 갈라진다. 부호를 반대로 주면 겹친다

## 관계도 라벨 배치

- 라벨은 곡선 중점에서 바깥쪽 법선으로 `LABEL_GAP`(13px)만 띄운다. **화살표에 붙어 있어야** 어느 관계의 조건인지 읽힌다
- 겹침은 `relaxLabels()` 가 자동으로 푼다 — 원래 자리로 당기는 용수철 + AABB 밀어내기, 이탈 거리는 `MAX_DRIFT`(30)로 묶는다
- 그래서 `labelOffset` 은 **거의 필요 없다.** 겹침을 손으로 고치려 하지 말고, 정말 안 풀릴 때만 `bend` 를 조정한다
- 겹침 판정은 `.edge-label .katex`(실제 보이는 배경 칩) 기준이다. `foreignObject` 는 140px 고정이라 그 폭으로 재면 안 된다
- 첨자 확률변수는 **대문자** `X_i` 로 쓴다 (`x_i` 아님)
