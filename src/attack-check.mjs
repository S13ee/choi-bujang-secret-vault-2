// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 실제로 보낸 요청의 결과만 기록합니다. 심판의 판정이 아닙니다.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 2) return runStepTwoChecks(app, config);
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 비로그인 GET 한 번의 결과를 상태 코드와 메모 개수로만 요약합니다. 본문은 남기지 않습니다.
async function anonymousNotes(url, config) {
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch (error) {
    return { reached: false, summary: `요청 실패 (${error.name})` };
  }
  let count = 0;
  try {
    const data = await response.json();
    if (data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)) count = data.notes.length;
  } catch {
    // JSON이 아니면 메모가 없는 응답으로 기록합니다.
  }
  return { reached: true, status: response.status, count,
    summary: `HTTP ${response.status}, 가상 메모 ${count}건` };
}

async function runStepTwoChecks(app, config) {
  const file = await anonymousNotes(new URL('/data.json', app), config);
  const api = await anonymousNotes(new URL('/api/notes', app), config);
  return [
    { attackId: 'anonymous_data_json_read', expected: '비로그인 /data.json 요청에 가상 메모가 없음',
      observed: !file.reached ? `비로그인 /data.json ${file.summary}`
        : file.count > 0 ? `비로그인 /data.json에서 메모가 보임 (${file.summary})`
          : `비로그인 /data.json에서 메모가 보이지 않음 (${file.summary})` },
    { attackId: 'anonymous_api_notes_read', expected: '2단계 남은 약점: 비로그인 /api/notes 요청이 아직 열림',
      observed: !api.reached ? `비로그인 /api/notes ${api.summary}`
        : api.status === 200 && api.count > 0 ? `비로그인 /api/notes가 열려 메모가 보임 (${api.summary})`
          : `비로그인 /api/notes에서 메모가 보이지 않음 (${api.summary})` },
  ];
}
