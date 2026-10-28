// 채팅 서버: GET / → public/index.html, POST /api/ask {question, mode} → ask() 결과
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ask, MODES } from './lib/ask.mjs';

const PORT = 5180;
const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname), 'public');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && req.url === '/api/ask') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return send(res, 413, { error: '요청이 너무 큽니다.' });
      }
      const { question, mode } = JSON.parse(body || '{}');
      if (!question?.trim()) return send(res, 400, { error: '질문이 비어 있습니다.' });
      if (!MODES.includes(mode)) return send(res, 400, { error: `mode는 ${MODES.join(', ')} 중 하나여야 합니다.` });
      return send(res, 200, await ask(question.trim(), mode));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
