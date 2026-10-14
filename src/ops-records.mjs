// 12단계 제작 2: 시험 목록(src/ops-catalog.mjs)과 실제 점검 결과(attackId·observed)로 기록표 행을 만드는 순수 함수입니다.
// - 실제로 보낸 요청의 결과만 적습니다. observed가 "not_run"이거나 결과가 없는 항목은 「미실행」이고 결과 칸은 비웁니다.
// - 상태·오류 코드·요청 ID·확인 시각은 observed 문자열에서 그대로 옮깁니다. 숫자를 추정하거나 계산해 채우지 않습니다.
// - 수치(counts)는 행을 센 값뿐입니다. 미실행을 성공으로 세지 않습니다.
// - 응답 본문은 다루지 않으므로 메모 본문·토큰·개인정보가 들어올 칸이 없고, 쓰기 전 비밀값 패턴을 다시 검사합니다.

export const RECORDS_SCHEMA = 'aleph.ops.records.v1';
const NOT_RUN = 'not_run';
const FIELDS = ['requestId', 'responseIds', 'method', 'status', 'error', 'checkedAt', 'url'];
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsb_publishable_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;

// "requestId=… responseIds=… method=… status=… error=… checkedAt=… url=…"를 칸으로 나눕니다(url은 맨 뒤 전체).
export function parseObserved(observed) {
  if (typeof observed !== 'string' || observed === NOT_RUN) return null;
  const urlAt = observed.indexOf(' url=');
  if (urlAt < 0) return null;
  const parsed = { url: observed.slice(urlAt + 5) };
  for (const part of observed.slice(0, urlAt).split(' ')) {
    const at = part.indexOf('=');
    const name = part.slice(0, at);
    if (at > 0 && FIELDS.includes(name)) parsed[name] = part.slice(at + 1);
  }
  const status = Number(parsed.status);
  if (!parsed.requestId || !parsed.method || !Number.isInteger(status) || !parsed.checkedAt || !parsed.url) return null;
  return { requestId: parsed.requestId, responseIds: parsed.responseIds ?? null, method: parsed.method, status,
    error: parsed.error ?? null, checkedAt: parsed.checkedAt, url: parsed.url };
}

function notRunReason(row, source) {
  if (row.notRunReason) return row.notRunReason;
  if (!row.bundle) return row.run?.auth === 'device' ? '로그인 + 승인된 기기 서명이 필요해 작전실 화면에서만 실행'
    : '제출 묶음 점검 항목이 아니라 작전실 화면에서만 실행';
  return source === 'bundle' ? '제출 묶음에서 요청을 보내지 못함(not_run)' : '요청을 보내지 못함(not_run)';
}

// attempts: [{attackId, observed}] (bundle 결과 또는 같은 함수로 새로 돌린 결과). catalog의 bundle 항목과 attackId가 정확히 같아야 합니다.
export function buildRecordRows(catalog, attempts, source) {
  const bundleIds = catalog.filter(row => row.bundle).map(row => row.attackId);
  const attemptIds = attempts.map(item => item.attackId);
  if (JSON.stringify(bundleIds) !== JSON.stringify(attemptIds)) {
    throw new Error('점검 결과의 attackId가 시험 목록의 제출 묶음 항목과 다릅니다.');
  }
  const byId = new Map(attempts.map(item => [item.attackId, item.observed]));
  return catalog.map(row => {
    const observed = row.bundle ? byId.get(row.attackId) : undefined;
    const result = parseObserved(observed);
    if (row.bundle && observed !== NOT_RUN && !result) throw new Error(`${row.attackId}: observed 형식을 읽을 수 없습니다.`);
    return {
      attackId: row.attackId,
      step: row.step,
      kind: row.kind === 'normal' ? '정상' : '금지',
      expected: row.expected,
      expectStatus: row.expectStatus ? [...row.expectStatus] : null,
      executed: result ? '실행' : '미실행',
      status: result?.status ?? null,
      error: result?.error ?? null,
      requestId: result?.requestId ?? null,
      responseIds: result?.responseIds ?? null,
      checkedAt: result?.checkedAt ?? null,
      method: result?.method ?? null,
      url: result?.url ?? null,
      statusMatches: result && row.expectStatus ? row.expectStatus.includes(result.status) : null,
      notRunReason: result ? null : notRunReason(row, source),
    };
  });
}

// 행을 센 값만 돌려줍니다.
export function countRows(rows) {
  return {
    rows: rows.length,
    executed: rows.filter(row => row.executed === '실행').length,
    notRun: rows.filter(row => row.executed === '미실행').length,
    statusMatched: rows.filter(row => row.statusMatches === true).length,
    statusMismatched: rows.filter(row => row.statusMatches === false).length,
  };
}

export function buildRecordTable({ catalog, attempts, source, commit, publicAppUrl, generatedAt }) {
  const rows = buildRecordRows(catalog, attempts, source);
  const table = { schema: RECORDS_SCHEMA, source, commit, publicAppUrl, generatedAt, counts: countRows(rows), rows };
  if (SECRET.test(JSON.stringify(table))) throw new Error('기록표에 비밀값 또는 연락처로 보이는 값이 있어 만들지 않습니다.');
  return table;
}

const cell = value => (value === null || value === undefined ? '' : String(value).replace(/\|/gu, '\\|'));

export function recordTableMarkdown(table) {
  const lines = [
    '# 1~11단계 정상·금지 요청 기록표',
    '',
    `근거: ${table.source === 'bundle' ? '제출 묶음(npm run bundle) 결과 그대로' : '같은 점검을 새로 실행(live)한 결과'} · 커밋 ${table.commit} · 만든 시각 ${table.generatedAt}`,
    '',
    `행 ${table.counts.rows} · 실행 ${table.counts.executed} · 미실행 ${table.counts.notRun} · 기대 상태와 같음 ${table.counts.statusMatched} · 다름 ${table.counts.statusMismatched} (행을 센 값, 미실행은 성공으로 세지 않음)`,
    '',
    '| attackId | 단계 | 구분 | 기대 결과 | 실제 API 결과 | 요청 ID | 확인 시각 | 실행 여부 |',
    '|---|---|---|---|---|---|---|---|',
    ...table.rows.map(row => `| ${cell(row.attackId)} | ${row.step} | ${row.kind} | ${cell(row.expected)} | ${
      row.executed === '실행' ? `${row.status}${row.error ? ` ${row.error}` : ''}` : ''} | ${cell(row.requestId)} | ${cell(row.checkedAt)} | ${
      row.executed}${row.notRunReason ? ` (${cell(row.notRunReason)})` : ''} |`),
    '',
  ];
  return lines.join('\n');
}
