// 보험 질문 44개를 챗봇 모드마다 던지고, 정답 SQL의 실행 결과와 비교해 채점한다.
// 사용: node bench.mjs [모드…] [--reps 3]   → runs/results.jsonl
// 정답(oracle/)은 채점할 때만 읽는다. 챗봇(lib/ask.mjs)은 질문 글만 받는다.
import fs from 'node:fs';
import { ask } from './lib/ask.mjs';
import { open, goldRows, same } from './oracle/grade.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const reps = Number(opt('--reps', 3)), par = Number(opt('--parallel', 4));
const modes = args.length ? args : ['schema', 'ontology', 'guide'];
const Q = JSON.parse(fs.readFileSync(new URL('oracle/questions.json', import.meta.url)));
const db = open(new URL('data/acme.db', import.meta.url).pathname);
fs.mkdirSync(new URL('runs/', import.meta.url), { recursive: true });
const out = new URL('runs/results.jsonl', import.meta.url);

for (const mode of modes) {
  for (let rep = 1; rep <= reps; rep++) {
    const jobs = Q.map((q) => async () => {
      const t0 = Date.now();
      let r = {}, err = null;
      try { r = await ask(q.question, mode); } catch (e) { err = String(e.message || e).slice(0, 200); }
      const ok = !err && same(goldRows(db, q.gold_sql), r.rows);
      const row = { mode, rep, id: q.id, level: q.level, ok, sql: r.sql ?? null, costUsd: r.costUsd ?? null, seconds: (Date.now() - t0) / 1000, err };
      fs.appendFileSync(out, JSON.stringify(row) + '\n');
      return ok;
    });
    let i = 0, pass = 0;
    await Promise.all(Array.from({ length: par }, async () => { while (i < jobs.length) { const j = jobs[i++]; if (await j()) pass++; } }));
    console.log(`${mode} #${rep}  ${pass}/${Q.length}`);
  }
}
