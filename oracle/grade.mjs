// 채점: 챗봇 SQL의 실행 결과와 정답 SQL의 실행 결과를 비교한다(열 이름·행 순서는 보지 않는다).
// 같다고 보는 조건: 행 수가 같고, 행을 정렬했을 때 정답 행의 값이 모두 챗봇 행에 들어 있다(챗봇이 열을 더 보여 줘도 됨). 숫자는 소수 둘째 자리까지.
import { DatabaseSync } from 'node:sqlite';

const norm = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : v == null ? 'null' : String(v).trim());
const key = (row) => Object.values(row).map(norm).sort().join('|');

export function goldRows(db, sql) {
  return db.prepare(sql).all();
}

export function same(gold, got) {
  if (!Array.isArray(got) || gold.length !== got.length) return false;
  const g = [...gold].map((r) => Object.values(r).map(norm)).sort((a, b) => a.join('|').localeCompare(b.join('|')));
  const left = got.map((r) => Object.values(r).map(norm));
  // 정답 행마다, 그 값을 모두 담은 챗봇 행을 하나씩 짝짓는다
  return g.every((gr) => {
    const i = left.findIndex((pr) => gr.every((v) => { const k = pr.indexOf(v); return k >= 0; }));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

export const open = (file) => new DatabaseSync(file, { readOnly: true });

// 자체 검사: 열 순서·이름이 달라도 같고, 값이 다르면 다르다
const a = [{ x: 1, y: 'A' }, { x: 2.004, y: 'B' }];
console.assert(same(a, [{ q: 'B', p: 2 }, { p: 1, q: 'A', extra: 9 }]), 'same 1');
console.assert(!same(a, [{ x: 1, y: 'A' }, { x: 3, y: 'B' }]), 'same 2');
console.assert(!same(a, [{ x: 1, y: 'A' }]), 'same 3');
