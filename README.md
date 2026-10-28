# 온톨로지 챗봇 — 보험 데이터로 재 보기

보험 회사 DB(13개 테이블)에 질문하는 챗봇을 클로드 코드로 만들고, 프롬프트에 넣는 자료만 바꿔 같은 질문 44개를 채점했다.

| 모드 | 넣는 자료 |
|---|---|
| schema | `data/schema.ddl` |
| ontology | 스키마 + `data/ontology.ttl` + `data/mapping.r2rml` (공개 벤치마크 원본) |
| guide | 스키마 + `docs/data-guide.md` (클로드가 온톨로지·매핑을 사람 말로 다시 씀) |
| built | 스키마 + `built/ontology.md` (공개 온톨로지 없이 클로드가 DB만 보고 7단계로 구축) |

## 결과 (2026-10-28, Sonnet, 44문항 × 3회, `runs/results.jsonl`)
| 모드 | 전체 | LQLS | LQHS | HQLS | HQHS | 질문당 비용($) |
|---|---|---|---|---|---|---|
| 스키마만 | 62% | 74% | 37% | 82% | 50% | 0.0231 |
| +온톨로지 | 77% | 90% | 57% | 94% | 63% | 0.0568 |
| +데이터 설명서 | 74% | 79% | 53% | 91% | 70% | 0.0329 |
| +직접 만든 온톨로지 | 82% | 77% | 90% | 91% | 70% | 0.0547 |

L/H = 쉬움/어려움, Q = 질문, S = 스키마. 비용은 SQL 작성 + 답 작성 두 번 호출의 합(같은 자료가 반복돼 캐시가 적용된 값).

## 실행
```bash
npm run db                      # data/csv → data/acme.db
node server.mjs                 # http://localhost:5180 채팅 화면
node bench.mjs --reps 3         # 채점 → runs/results.jsonl (claude CLI 로그인 필요, 비용 발생)
node report.mjs
```

## 채점 방식
`oracle/grade.mjs` — 챗봇 SQL의 실행 결과와 정답 SQL의 실행 결과를 비교한다. 열 이름·행 순서는 보지 않고, 숫자는 소수 둘째 자리, 챗봇이 열을 더 보여도 정답 값이 모두 있으면 맞음. 정답은 녹화 중 챗봇 작업 폴더에 없었고 채점 단계에서만 넣었다.

## 데이터 출처
data.world, Chat with the Data Benchmark — `ACME_Insurance` (Apache-2.0, `data/LICENSE-cwd-benchmark.txt`). Sequeda·Allemang·Jacob (2023) arXiv:2311.07509.
정답 SQL 1개(평균 처리 일수)는 SQL Server용 `DATE_DIFF`를 SQLite `julianday(close) − julianday(open)`로 바꿨다. 나머지 43개는 원문 그대로.
