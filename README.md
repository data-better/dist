# 확률분포 관계 탐색기

확률분포 21종(연속 14 · 이산 7)과 그 사이의 관계 61개를 인터랙티브하게 탐색하는 교육용 정적 사이트.
원본 참조 다이어그램을 그대로 옮긴 **전체 관계도** 하나와, 이산분포만 크게 본 **이산 관계도** 하나로 이루어져 있다.

- **전체 관계도** — 원본 다이어그램 배치를 재현한 SVG 그래프. 연속 14종 + 이산 6종, 관계 59개. 노드/화살표 클릭, 줌·팬, 키보드 내비게이션, 경로 찾기
- **이산 관계도** — 이산분포 7종 + 연결 지점이 되는 연속분포 5종(다리 노드), 관계 22개. 전체 관계도와 **같은 데이터 파일**을 부분집합으로 읽는다
- **분포 패널** — 모수 슬라이더, PDF/CDF(이산은 PMF/CDF 계단) 플롯, 곡선 고정 3개, 교재 그림 프리셋
- **관계 패널** — 단계별 유도, 극한 관계의 수렴 시연, 27종 몬테카를로 시뮬레이션(연속 21 + 이산 6)
- **중심극한정리 시뮬레이터** — 관계도의 21종 전부를 원천분포로 지원. n/R 구분, n 스윕 애니메이션, 대수의 법칙 대비, 왜도별 수렴 속도, 코시 반례
- **학습 경로** 3종, 검색·필터

### 연결

- https://databetter25.github.io/dist/

## 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000/
```

| 경로 | 내용 |
|---|---|
| `test/numeric.html` | 연속 수치 라이브러리 정확도 (CDF·적분·정합·극단모수·샘플러·PRNG) |
| `test/discrete.html` | 이산 PMF·CDF 정확도, 극단 모수, 샘플러 카이제곱, 관계 시뮬레이션, 근사 수렴, 데이터 정합성 |
| `test/data.html` | 데이터 정합성, 61개 엣지 목록 |
| `test/clt.html` | CLT 시뮬레이터 수용 기준 |
| `test/sim.html` | 연속 시뮬레이션 레시피 21종의 KS 검정 |
| `test/font-audit.html` | 수식 파싱 + KaTeX 폰트 누락 검사 |

참조값 재생성:

```bash
Rscript tools/make_reference.R              # 또는 python3 tools/make_reference.py
Rscript tools/make_discrete_reference.R     # 또는 python3 tools/make_discrete_reference.py
```

## 배포

`main` 브랜치를 GitHub Pages 소스로 지정하면 끝. `.nojekyll` 이 있어 `vendor/` 가 그대로 서빙된다.

## 라이선스

코드 MIT / 콘텐츠 CC BY 4.0
