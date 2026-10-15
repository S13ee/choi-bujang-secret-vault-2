// 보너스 xdr-02 제작 1: web-injection 경보 읽기 모듈(확인용). decide.mjs는 이 파일을 불러오지 않습니다.
// xdr/fixtures/web-injection.json을 읽기만 하고 고치지 않습니다. 카드대로 다섯 칸만 뽑습니다:
// 시각(timestamp), 출발 주소(data.srcip), 계정(data.srcuser, 없으면 "-"), 규칙 수준(rule.level), 설명(rule.description).
// 토큰·세션·비밀번호·키처럼 보이는 글자는 출력하지 않고 [가림]으로 바꿉니다.
// 실행: node xdr/web-injection/read-alerts.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/web-injection.json', import.meta.url));
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S{8,}|\beyJ[A-Za-z0-9_-]{8,}|\bsb_(?:secret|publishable)_\S{8,}|\bsk[-_][A-Za-z0-9_-]{12,}|\b(?:password|passwd|pwd|secret|token|session|sessid|sid|jwt|api[_-]?key|key)\s*[:=]\s*\S+/iu;
const HIDDEN = '[가림]';

const text = value => {
  if (typeof value !== 'string') return '';
  return SECRET.test(value) ? HIDDEN : value.replace(/[\r\n\t]+/gu, ' ');
};

export function pickAlert(alert) {
  const rule = alert?.rule ?? {};
  const data = alert?.data ?? {};
  return {
    timestamp: text(alert?.timestamp),
    srcip: text(data.srcip),
    srcuser: text(data.srcuser) || '-',
    level: Number.isFinite(rule.level) ? rule.level : null,
    description: text(rule.description),
  };
}

export async function readAlerts(file = FIXTURE) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'web-injection' || !Array.isArray(fixture.alerts)) {
    throw new Error('web-injection 경보 묶음 형식이 아닙니다.');
  }
  return { total: fixture.alerts.length, rows: fixture.alerts.map(pickAlert) };
}

const COLUMNS = [
  ['시각', row => row.timestamp],
  ['출발 주소', row => row.srcip],
  ['계정', row => row.srcuser],
  ['수준', row => (row.level ?? '')],
  ['설명', row => row.description],
];

export function formatTable(rows) {
  const lines = [`| 줄 | ${COLUMNS.map(([name]) => name).join(' | ')} |`, `|---|${COLUMNS.map(() => '---').join('|')}|`];
  rows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${COLUMNS.map(([, cell]) => String(cell(row)).replace(/\|/gu, '/')).join(' | ')} |`);
  });
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { total, rows } = await readAlerts();
    process.stdout.write(`${formatTable(rows)}\n경보 ${total}건 / 뽑은 줄 ${rows.length}줄\n`);
    if (total !== rows.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`경보 읽기 중 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
