// 보너스 xdr-06 제작 1: exfiltration 경보 읽기 모듈(확인용). decide.mjs는 이 파일을 불러오지 않습니다.
// xdr/fixtures/exfiltration.json을 읽기만 하고 고치지 않습니다. 카드대로 다섯 칸만 뽑습니다:
// 시각(timestamp, 원문 그대로·시간대 표시 포함), 출발 주소(data.srcip), 계정(data.srcuser, 없으면 "-"), 규칙 수준(rule.level), 설명(rule.description).
// 비밀번호·토큰·키처럼 보이는 값은 출력하지 않고 [가림]으로 바꿉니다:
//   /RP·/P 뒤 값, password=·token= 등의 값, Bearer 토큰, net user <이름> <비밀번호>의 비밀번호 자리, echo <값> | sudo -S의 값, /p: 뒤 값,
//   URL 서명·토큰 쿼리 값(X-Amz-Signature=, X-Amz-Credential=, sig=, signature=, token=, access_token=, key=).
// 실행: node xdr/exfiltration/read-alerts.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/exfiltration.json', import.meta.url));
const HIDDEN = '[가림]';
const VALUE = '("[^"]*"|\'[^\']*\'|[^\\s"\']+)';
// 앞부분(키·명령)은 남기고 값만 [가림]으로 바꾸는 규칙들입니다.
const VALUE_RULES = [
  // URL 쿼리의 서명·토큰 값: ?X-Amz-Signature=값, &sig=값 등. & · 공백 · # 전까지 가립니다.
  /([?&](?:x-amz-signature|x-amz-credential|x-amz-security-token|sig|signature|token|access_token|key)=)([^&\s#]+)/giu,
  // net user <이름> <비밀번호> : 이름 다음 자리가 /로 시작하는 옵션이 아니면 비밀번호로 봅니다.
  new RegExp(`(\\bnet\\s+user\\s+(?:"[^"]*"|\\S+)\\s+)(?!/)${VALUE}`, 'giu'),
  // echo <값> | sudo -S : 파이프로 sudo에 넘긴 값.
  new RegExp(`(\\becho\\s+)${VALUE}(?=\\s*\\|\\s*sudo\\b[^\\n]*\\s-S\\b)`, 'giu'),
  // /p:값, /password:값
  new RegExp(`((?:^|\\s)/(?:p|password):)${VALUE}`, 'giu'),
  // /RP 값, /P 값
  new RegExp(`((?:^|\\s)/(?:RP|P)\\s+)${VALUE}`, 'giu'),
  // password=값, token: 값 등
  new RegExp(`(\\b(?:password|passwd|pwd|secret|token|session|sid|jwt|api[_-]?key|key)\\s*[:=]\\s*)${VALUE}`, 'giu'),
];
// 글자 전체를 가리는 모양(토큰·키).
const SECRET_SHAPE = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S{8,}|\beyJ[A-Za-z0-9_-]{8,}|\bsb_(?:secret|publishable)_\S{8,}|\bsk[-_][A-Za-z0-9_-]{12,}/iu;

export function maskSecrets(value) {
  if (typeof value !== 'string') return '';
  if (SECRET_SHAPE.test(value)) return HIDDEN;
  let out = value;
  for (const rule of VALUE_RULES) out = out.replace(rule, (_, keep) => `${keep}${HIDDEN}`);
  return out.replace(/[\r\n\t]+/gu, ' ');
}

export function pickAlert(alert) {
  const rule = alert?.rule ?? {};
  const data = alert?.data ?? {};
  return {
    timestamp: typeof alert?.timestamp === 'string' ? maskSecrets(alert.timestamp) : '',
    srcip: maskSecrets(data.srcip),
    srcuser: maskSecrets(data.srcuser) || '-',
    level: Number.isFinite(rule.level) ? rule.level : null,
    description: maskSecrets(rule.description),
  };
}

export async function readAlerts(file = FIXTURE) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'exfiltration' || !Array.isArray(fixture.alerts)) {
    throw new Error('exfiltration 경보 묶음 형식이 아닙니다.');
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
