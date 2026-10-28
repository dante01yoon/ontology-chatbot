// data/csv/*.csv → data/acme.db (SQLite). 숫자처럼 보이는 값은 숫자로 넣는다(문자 '100'과 숫자 100 비교가 엇갈리지 않게).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const out = path.join(DATA, 'acme.db');
fs.rmSync(out, { force: true });
const db = new DatabaseSync(out);
const val = (v) => (v === '' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
for (const f of fs.readdirSync(path.join(DATA, 'csv')).filter((f) => f.endsWith('.csv'))) {
  const table = f.slice(0, -4);
  const [head, ...rows] = fs.readFileSync(path.join(DATA, 'csv', f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(','));
  db.exec(`CREATE TABLE ${table} (${head.join(', ')})`);
  const ins = db.prepare(`INSERT INTO ${table} VALUES (${head.map(() => '?').join(', ')})`);
  for (const r of rows) ins.run(...r.map(val));
  console.log(table, rows.length);
}
db.close();
