// 보너스 xdr-01 제작 1: brute-force 경보 읽기 모듈(확인용). decide.mjs는 이 파일을 불러오지 않습니다.
// xdr/fixtures/brute-force.json을 읽기만 하고 고치지 않습니다. 판단에 쓸 칸만 뽑습니다:
// id, 시각, 출발 주소, 계정, 규칙 수준, 설명, MITRE 번호 목록, 실패 건수(숫자), 계정 목록 개수.
// 계정 목록(data.accounts)은 내용 없이 개수만 셉니다. 비밀값처럼 보이는 글자는 출력하지 않고 [가림]으로 바꿉니다.
// 실행: node xdr/brute-force/read-alerts.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/brute-force.json', import.meta.url));
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S{8,}|\beyJ[A-Za-z0-9_-]{8,}|\bsb_(?:secret|publishable)_\S{8,}|\bsk[-_][A-Za-z0-9_-]{12,}|\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/iu;
const HIDDEN = '[가림]';

const text = value => {
  if (typeof value !== 'string') return '';
  return SECRET.test(value) ? HIDDEN : value.replace(/[\r\n\t]+/gu, ' ');
};

// data.count는 글자로 들어 있습니다. 0 이상 정수 글자일 때만 숫자로 바꾸고, 아니면 비웁니다(null).
const countOf = value => (typeof value === 'string' && /^\d{1,9}$/u.test(value.trim()) ? Number(value.trim()) : null);

// data.accounts가 있으면 쉼표로 나눈 빈칸 아닌 항목 개수만 셉니다. 없으면 비웁니다(null).
const accountCountOf = value => (typeof value === 'string' ? value.split(',').filter(item => item.trim()).length : null);

export function pickAlert(alert) {
  const rule = alert?.rule ?? {};
  const data = alert?.data ?? {};
  return {
    id: text(alert?.id),
    timestamp: text(alert?.timestamp),
    srcip: text(data.srcip),
    srcuser: text(data.srcuser),
    level: Number.isFinite(rule.level) ? rule.level : null,
    description: text(rule.description),
    mitre: Array.isArray(rule.mitre) ? rule.mitre.map(text).filter(Boolean) : [],
    count: countOf(data.count),
    accountCount: accountCountOf(data.accounts),
  };
}

export async function readAlerts(file = FIXTURE) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }
  return { total: fixture.alerts.length, rows: fixture.alerts.map(pickAlert) };
}

const COLUMNS = [
  ['id', row => row.id],
  ['시각', row => row.timestamp],
  ['출발 주소', row => row.srcip],
  ['계정', row => row.srcuser],
  ['수준', row => (row.level ?? '')],
  ['MITRE', row => row.mitre.join(',')],
  ['실패 건수', row => (row.count ?? '')],
  ['계정 수', row => (row.accountCount ?? '')],
  ['설명', row => row.description],
];

export function formatTable(rows) {
  const lines = [`| ${COLUMNS.map(([name]) => name).join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`];
  for (const row of rows) lines.push(`| ${COLUMNS.map(([, cell]) => String(cell(row)).replace(/\|/gu, '/')).join(' | ')} |`);
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
