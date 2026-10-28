// 질문 → (클로드가 SQL 작성) → SQLite 읽기 전용 실행 → (클로드가 결과로 답 작성)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

export const MODES = ['schema', 'ontology', 'guide', 'built'];

// 모드마다 프롬프트에 넣을 자료. 시스템 프롬프트는 모든 모드에서 같다.
function materials(mode) {
  const schema = ['### data/schema.ddl', read('data/schema.ddl')];
  if (mode === 'schema') return schema;
  if (mode === 'ontology') return [...schema, '### data/ontology.ttl', read('data/ontology.ttl'), '### data/mapping.r2rml', read('data/mapping.r2rml')];
  if (mode === 'guide') return [...schema, '### docs/data-guide.md', read('docs/data-guide.md')];
  if (mode === 'built') return [...schema, '### built/ontology.md', read('built/ontology.md')];
  throw new Error(`알 수 없는 mode: ${mode} (가능: ${MODES.join(', ')})`);
}

const SYSTEM_PROMPT = `당신은 보험 회사 SQLite 데이터베이스로 질문에 답하는 도우미입니다.
일은 두 가지이고, 사용자 메시지가 둘 중 무엇을 원하는지 알려 줍니다.
1. SQL 작성: 주어진 자료를 보고 질문에 답하는 SQLite SELECT 문 한 개를 \`\`\`sql 코드 블록 하나에 담아 답합니다. 데이터를 바꾸는 문장은 쓰지 않습니다. 설명은 붙이지 않습니다.
2. 답 작성: 질문, 실행한 SQL, 결과 행을 보고 한국어로 짧고 정확하게 답합니다. 결과에 없는 내용은 지어내지 않습니다.`;

// 빈 임시 폴더에서 claude -p 실행. 프롬프트는 stdin으로 넘긴다.
function callClaude(prompt) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-'));
  const args = ['-p', '--model', 'sonnet', '--tools', '', '--system-prompt', SYSTEM_PROMPT, '--output-format', 'json', '--no-session-persistence'];
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.rmSync(cwd, { recursive: true, force: true });
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(`claude 오류: ${j.result}`));
        resolve({ text: j.result ?? '', costUsd: j.total_cost_usd ?? 0 });
      } catch {
        reject(new Error(`claude 실행 실패 (code ${code}): ${(err || out).slice(0, 500)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

function extractSql(text) {
  const m = text.match(/```(?:sql)?\s*\n?([\s\S]*?)```/i);
  return (m ? m[1] : text).trim().replace(/;\s*$/, '');
}

function runSelect(sql) {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('SELECT 문만 실행할 수 있습니다.');
  if (sql.includes(';')) throw new Error('SQL 문은 한 개만 실행할 수 있습니다.');
  const db = new DatabaseSync(path.join(ROOT, 'data/acme.db'), { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

export async function ask(question, mode = 'schema') {
  const ctx = materials(mode);
  let costUsd = 0;

  const gen = await callClaude([
    '## 자료', ...ctx, '',
    '## 할 일: SQL 작성',
    `질문: ${question}`,
  ].join('\n'));
  costUsd += gen.costUsd;
  const sql = extractSql(gen.text);

  let rows;
  try {
    rows = runSelect(sql);
  } catch (e) {
    return { sql, rows: [], answer: `SQL 실행 오류: ${e.message}`, costUsd, error: e.message };
  }

  const ans = await callClaude([
    '## 할 일: 답 작성',
    `질문: ${question}`,
    '', '실행한 SQL:', '```sql', sql, '```',
    '', `결과 (${rows.length}행${rows.length > 100 ? ', 앞 100행만 표시' : ''}):`,
    JSON.stringify(rows.slice(0, 100)),
  ].join('\n'));
  costUsd += ans.costUsd;

  return { sql, rows, answer: ans.text.trim(), costUsd };
}
