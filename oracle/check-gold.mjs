// 정답 SQL 44개가 이 SQLite DB에서 모두 도는지 확인
import fs from 'node:fs';
import { open, goldRows } from './grade.mjs';
const db = open(new URL('../data/acme.db', import.meta.url).pathname);
const Q = JSON.parse(fs.readFileSync(new URL('questions.json', import.meta.url)));
let ok = 0;
for (const q of Q) { try { goldRows(db, q.gold_sql); ok++; } catch (e) { console.log('FAIL', q.id, e.message); } }
console.log(`${ok}/${Q.length}`);
