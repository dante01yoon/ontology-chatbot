// runs/results.jsonl → 모드별·난이도별 정답률과 평균 비용
import fs from 'node:fs';
const rows = fs.readFileSync(new URL('runs/results.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
const LABEL = { schema: '스키마만', ontology: '+온톨로지', guide: '+데이터 설명서' };
const LV = ['LQLS', 'LQHS', 'HQLS', 'HQHS'];
const pct = (g) => g.length ? `${(g.filter((r) => r.ok).length / g.length * 100).toFixed(0)}%` : '-';
console.log('모드'.padEnd(12), '전체', ...LV.map((l) => l.padStart(6)), '  비용($)', '회');
for (const [m, label] of Object.entries(LABEL)) {
  const g = rows.filter((r) => r.mode === m);
  if (!g.length) continue;
  const cost = g.reduce((s, r) => s + (r.costUsd || 0), 0) / g.length;
  console.log(label.padEnd(10), pct(g).padStart(5), ...LV.map((l) => pct(g.filter((r) => r.level === l)).padStart(6)), cost.toFixed(4).padStart(9), String(new Set(g.map((r) => r.rep)).size).padStart(3));
}
