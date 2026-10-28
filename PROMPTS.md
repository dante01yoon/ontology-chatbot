# 영상에서 쓴 프롬프트

## 1. 데이터 설명서 만들기 (클로드 코드)
```
data/ontology.ttl과 data/mapping.r2rml을 읽고, 같은 내용을 사람이 읽는 데이터 설명서로 docs/data-guide.md에 써 줘. 개념마다 무슨 뜻인지, 어느 테이블·칸·코드값으로 저장되는지 적어 줘.
```

## 2. 챗봇 만들기 (클로드 코드)
```
data/acme.db 보험 회사 DB로 질문에 답하는 챗봇을 만들어 줘.
- lib/ask.mjs에 ask(question, mode)를 export. { sql, rows, answer, costUsd }를 돌려줘.
- 클로드가 SQLite SELECT 한 개를 쓰게 해. 빈 임시 폴더에서 claude -p --model sonnet --tools "" --system-prompt로 부르고, --output-format json으로 비용도 받아. SQL은 node:sqlite 읽기 전용으로 실행해.
- mode마다 프롬프트에 넣을 자료: schema = data/schema.ddl, ontology = 스키마 + data/ontology.ttl + data/mapping.r2rml, guide = 스키마 + docs/data-guide.md. 시스템 프롬프트는 세 모드가 똑같게.
- server.mjs(node 기본 모듈만, 포트 5180)와 public/index.html 채팅 화면. 모드를 고를 수 있고, 답 아래에 SQL과 결과 표를 보여 줘.
- 다 만들면 질문 하나로 세 모드를 직접 돌려서 확인해 줘.
```

## 3. 채점 (터미널)
```
node bench.mjs --reps 3
node report.mjs
```
