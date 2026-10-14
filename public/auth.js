// 이메일·비밀번호 로그인·로그아웃과 가상 메모 추가·수정·삭제 화면입니다.
// 5단계 보완: 이 파일은 Supabase를 직접 부르지 않습니다. 주소·키·SDK 없이
// 이 사이트의 서버 함수 /api/auth/login·refresh·logout만 부릅니다.
// access token은 메모리에만 두고, refresh token은 서버가 HttpOnly 쿠키로 다룹니다.
// 비밀번호와 토큰은 저장·출력하지 않습니다.
// 11단계: 로그인 뒤 꺼낼 수 없는 기기 키를 메모리에만 만들고, 보호 경로와 /api/devices/* 요청은 모두 signedApi로 서명합니다.
// 서버가 GET /api/devices/status에서 approved: true라고 답할 때만 자료실을 열고 그때 처음 메모를 불러옵니다.
// 승인 버튼의 응답만으로는 열지 않습니다. 키·토큰·자료는 브라우저 저장소·쿠키·캐시에 넣지 않습니다.
import { createDeviceKey, signRequest } from './device-sign.js';
import { createOpsRoom } from './ops-room.js';

const form = document.querySelector('#login-form');
const email = document.querySelector('#login-email');
const password = document.querySelector('#login-password');
const signedIn = document.querySelector('#signed-in');
const signedInEmail = document.querySelector('#signed-in-email');
const logout = document.querySelector('#logout');
const message = document.querySelector('#auth-error');

const REASONS = {
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
  email_not_confirmed: '이메일 인증이 아직 끝나지 않았습니다.',
  user_banned: '사용이 중지된 계정입니다.',
  over_request_rate_limit: '로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.',
  validation_failed: '이메일과 비밀번호를 확인해 주세요.',
};

// 서버 함수가 돌려준 오류 코드(code)나 연결 실패를 화면 문장으로 바꿉니다.
function reason(error) {
  const known = REASONS[error?.code];
  if (known) return `로그인 실패: ${known}`;
  if (error instanceof TypeError) {
    return '로그인 실패: 로그인 서버에 연결하지 못했습니다. 네트워크를 확인하세요.';
  }
  if (error?.status === 429) return `로그인 실패: ${REASONS.over_request_rate_limit}`;
  if (error?.status >= 500) return '로그인 실패: 로그인 서버에 문제가 있습니다. 잠시 뒤 다시 시도하세요.';
  return `로그인 실패: ${error?.code ? `오류 코드 ${error.code}` : '알 수 없는 오류'}`;
}

// 로그인 서버 함수 호출. 성공하면 {accessToken, expiresAt, email}을 돌려줍니다.
async function authCall(path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method: 'POST', cache: 'no-store', credentials: 'same-origin', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('auth'), { status: response.status, code: data?.code ?? null });
  return data;
}

const vault = document.querySelector('#vault');
const list = document.querySelector('#notes');
const noteForm = document.querySelector('#note-form');
const noteTitle = document.querySelector('#note-title');
const noteBody = document.querySelector('#note-body');
const noteMessage = document.querySelector('#note-error');

const gate = document.querySelector('#device-gate');
const gateDeviceId = document.querySelector('#device-id');
const gateStatus = document.querySelector('#device-server-status');
const approveForm = document.querySelector('#approve-form');
const approvePassword = document.querySelector('#approve-password');
const deviceError = document.querySelector('#device-error');
const approvalBadge = document.querySelector('#device-approval');

let accessToken = null;
let deviceKey = null; // {privateKey(꺼낼 수 없음), publicKeyJwk, deviceId} — 메모리에만 둡니다.
let vaultOpen = false;
let flowId = 0;

function showNotesMessage(text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.replaceChildren(item);
}

const API_ERRORS = {
  401: '로그인 확인에 실패했습니다. 다시 로그인해 주세요.',
  404: '메모를 찾을 수 없습니다. 이미 지워졌을 수 있습니다.',
  409: '같은 ID의 메모가 이미 있습니다.',
};
const DEVICE_ERRORS = {
  DEVICE_SIGNATURE_REQUIRED: '기기 서명이 없습니다.',
  DEVICE_SIGNATURE_INVALID: '기기 서명을 확인하지 못했습니다.',
  DEVICE_SIGNATURE_EXPIRED: '기기 서명 시각이 맞지 않습니다. 기기 시계를 확인하세요.',
  DEVICE_NONCE_REUSED: '같은 요청이 다시 보내졌습니다.',
  DEVICE_NOT_REGISTERED: '서버에 등록되지 않은 기기입니다.',
  DEVICE_NOT_APPROVED: '서버가 아직 이 기기를 승인하지 않았습니다.',
  DEVICE_REVOKED: '권한이 회수된 기기입니다.',
  PASSWORD_INVALID: '비밀번호가 맞지 않습니다.',
  PASSWORD_REQUIRED: '비밀번호를 입력해 주세요.',
  APPROVAL_REQUIRES_PASSWORD: '이 로그인으로는 기기를 승인할 수 없습니다.',
};
const isDeviceRejection = error => (error?.status === 401 && String(error.code).startsWith('DEVICE_'))
  || (error?.status === 403 && ['DEVICE_NOT_APPROVED', 'DEVICE_NOT_REGISTERED', 'DEVICE_REVOKED'].includes(error.code));

// 보호 경로와 /api/devices/* 요청은 모두 이 함수를 거쳐 기기 키로 서명합니다.
// 경로는 fetch에 넣는 문자열(쿼리 포함) 그대로 서명하고, 본문은 canonical JSON 문자열 그대로 보냅니다.
// 로그인 만료(401 LOGIN_REQUIRED)면 토큰을 한 번 갱신하고 새 서명으로 다시 보냅니다.
async function signedApi(path, { method = 'GET', body } = {}, retried = false) {
  if (!deviceKey) throw Object.assign(new Error(DEVICE_ERRORS.DEVICE_SIGNATURE_REQUIRED), { status: 401, code: 'DEVICE_SIGNATURE_REQUIRED' });
  const signed = await signRequest(deviceKey, { method, url: path, body });
  const headers = { Authorization: `Bearer ${accessToken}`, ...signed.headers };
  if (signed.bodyText !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, cache: 'no-store', headers, body: signed.bodyText });
  const data = await response.json().catch(() => null);
  if (response.status === 401 && data?.error === 'LOGIN_REQUIRED' && !retried && await refreshSession()) {
    return signedApi(path, { method, body }, true);
  }
  if (!response.ok) {
    const code = data?.error ?? null;
    const text = DEVICE_ERRORS[code] ?? API_ERRORS[response.status] ?? data?.message ?? `요청 실패 (HTTP ${response.status})`;
    throw Object.assign(new Error(text), { status: response.status, code });
  }
  return data;
}

// 보호 자료 요청. 기기 서명·승인 거부면 자료실을 닫고 승인 화면으로 돌아갑니다.
async function api(path, options) {
  try {
    return await signedApi(path, options);
  } catch (error) {
    if (isDeviceRejection(error)) {
      closeVault();
      startDeviceFlow(error.message);
    }
    throw error;
  }
}

// 기기 승인 상태 표시: 서버 응답으로만 바꿉니다(설치·독립 창 여부와 무관).
function setApprovalBadge(serverStatus) {
  approvalBadge.textContent = serverStatus === 'approved' ? '서버가 승인 확인'
    : serverStatus === 'pending' ? '승인 대기'
      : serverStatus === 'revoked' ? '회수됨' : '확인 전';
}

// 12단계 작전실: GET·HEAD 점검 요청을 같은 기기 키로 서명해 보내고, 응답(Response)을 그대로 돌려줍니다.
// 경로만 서명하므로 작전실이 붙이는 X-Request-Id·X-Aleph-Attack-Id 헤더는 서명과 상관없습니다. 본문은 보내지 않습니다.
async function signedRaw(path, { method = 'GET', headers = {} } = {}) {
  if (!deviceKey || !accessToken || !vaultOpen) throw new Error('승인된 자료실이 열려 있지 않습니다.');
  if (!['GET', 'HEAD'].includes(method)) throw new Error('작전실은 GET·HEAD만 보냅니다.');
  const signed = await signRequest(deviceKey, { method, url: path });
  return fetch(path, { method, cache: 'no-store', headers: { ...headers, Authorization: `Bearer ${accessToken}`, ...signed.headers } });
}
const opsRoom = createOpsRoom({ root: document.querySelector('#ops-room'), signedFetch: signedRaw });

// 자료실을 닫고 화면에 있던 메모와 작전실 기록표를 지웁니다.
function closeVault() {
  vaultOpen = false;
  loadId += 1;
  vault.hidden = true;
  list.replaceChildren();
  noteMessage.textContent = '';
  noteForm.reset();
  opsRoom.clear();
}

function showGate(serverStatus, errorText = '') {
  gate.hidden = false;
  gateDeviceId.textContent = deviceKey?.deviceId ?? '-';
  gateStatus.textContent = serverStatus === 'pending' ? '승인 대기(pending)'
    : serverStatus === 'revoked' ? '회수됨(revoked)' : serverStatus ? serverStatus : '확인 중';
  deviceError.textContent = errorText;
}

function openVault() {
  gate.hidden = true;
  deviceError.textContent = '';
  vaultOpen = true;
  vault.hidden = false;
  showNotesMessage('가상 자료를 불러오는 중입니다.');
  loadNotes();
  opsRoom.show();
}

// 서버에 상태를 물어 approved: true일 때만 자료실을 엽니다.
async function checkDeviceStatus(current, errorText = '') {
  const status = await signedApi('/api/devices/status');
  if (current !== flowId) return;
  setApprovalBadge(status?.status);
  if (status?.approved === true && status.status === 'approved') openVault();
  else { closeVault(); showGate(status?.status, errorText); }
}

// 로그인 확인 뒤: 키 생성(처음 한 번) → 등록 요청 → 상태 확인.
async function startDeviceFlow(errorText = '') {
  const current = ++flowId;
  closeVault();
  setApprovalBadge(null);
  showGate(null, errorText);
  try {
    deviceKey ??= await createDeviceKey();
    if (current !== flowId) return;
    gateDeviceId.textContent = deviceKey.deviceId;
    const requested = await signedApi('/api/devices/request', {
      method: 'POST', body: { deviceId: deviceKey.deviceId, publicKeyJwk: deviceKey.publicKeyJwk },
    });
    if (current !== flowId) return;
    showGate(requested?.status, errorText);
    await checkDeviceStatus(current, errorText);
  } catch (error) {
    if (current === flowId && accessToken) showGate(null, `기기 확인 실패: ${error.message}`);
  }
}

approveForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = approveForm.querySelector('button');
  const secret = approvePassword.value;
  approvePassword.value = '';
  deviceError.textContent = '';
  button.disabled = true;
  const current = flowId;
  try {
    // 승인 응답만으로는 열지 않고, 서버에 상태를 다시 물어 approved: true일 때만 엽니다.
    await signedApi('/api/devices/approve', { method: 'POST', body: { password: secret } });
    await checkDeviceStatus(current);
  } catch (error) {
    if (current === flowId) deviceError.textContent = `승인 실패: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

function noteItem(note) {
  const item = document.createElement('li');
  const title = document.createElement('strong');
  const content = document.createElement('span');
  const actions = document.createElement('div');
  const edit = document.createElement('button');
  const remove = document.createElement('button');
  title.textContent = note.title;
  content.textContent = note.body;
  actions.className = 'note-actions';
  edit.type = remove.type = 'button';
  edit.textContent = '수정';
  remove.textContent = '삭제';
  remove.className = 'danger';
  actions.append(edit, remove);
  item.append(title, content, actions);

  edit.addEventListener('click', () => item.replaceWith(editItem(note)));
  remove.addEventListener('click', async () => {
    if (!confirm(`「${note.title}」 메모를 삭제할까요?`)) return;
    noteMessage.textContent = '';
    try {
      await api(`/api/notes/${note.id}`, { method: 'DELETE' });
      await loadNotes();
    } catch (error) {
      noteMessage.textContent = `삭제 실패: ${error.message}`;
    }
  });
  return item;
}

function editItem(note) {
  const item = document.createElement('li');
  const form = document.createElement('form');
  const title = document.createElement('input');
  const body = document.createElement('textarea');
  const actions = document.createElement('div');
  const save = document.createElement('button');
  const cancel = document.createElement('button');
  form.className = 'note-edit';
  title.value = note.title;
  title.required = true;
  title.maxLength = 200;
  title.setAttribute('aria-label', '제목');
  body.value = note.body;
  body.maxLength = 5000;
  body.rows = 3;
  body.setAttribute('aria-label', '내용');
  actions.className = 'note-actions';
  save.type = 'submit';
  save.textContent = '저장';
  cancel.type = 'button';
  cancel.textContent = '취소';
  actions.append(save, cancel);
  form.append(title, body, actions);
  item.append(form);

  cancel.addEventListener('click', () => item.replaceWith(noteItem(note)));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    noteMessage.textContent = '';
    save.disabled = true;
    try {
      const updated = await api(`/api/notes/${note.id}`, {
        method: 'PUT', body: { title: title.value, body: body.value },
      });
      item.replaceWith(noteItem(updated));
    } catch (error) {
      noteMessage.textContent = `수정 실패: ${error.message}`;
      save.disabled = false;
    }
  });
  return item;
}

let loadId = 0;
async function loadNotes() {
  const current = ++loadId;
  // 승인된 자료실이 열려 있을 때만 메모를 요청합니다.
  if (!accessToken || !vaultOpen) return;
  try {
    const notes = await api('/api/notes');
    if (current !== loadId || !vaultOpen) return;
    if (!Array.isArray(notes)) throw new Error('자료 형식이 맞지 않습니다.');
    if (!notes.length) showNotesMessage('아직 내 메모가 없습니다.');
    else list.replaceChildren(...notes.map(noteItem));
  } catch (error) {
    if (current === loadId && vaultOpen) showNotesMessage(error.message);
  }
}

noteForm.addEventListener('submit', async event => {
  event.preventDefault();
  noteMessage.textContent = '';
  const button = noteForm.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/notes', { method: 'POST', body: { title: noteTitle.value, body: noteBody.value } });
    noteForm.reset();
    await loadNotes();
  } catch (error) {
    noteMessage.textContent = `추가 실패: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

// session: {accessToken, expiresAt, email} 또는 null
let refreshTimer = null;
function render(session) {
  const signed = Boolean(session?.accessToken);
  const wasSigned = Boolean(accessToken);
  accessToken = session?.accessToken ?? null;
  form.hidden = signed;
  signedIn.hidden = !signed;
  if (signed) signedInEmail.textContent = session.email ?? '';
  else signedInEmail.textContent = '';
  // 만료 1분 전에 서버 함수로 토큰을 갱신합니다.
  clearTimeout(refreshTimer);
  if (signed && Number.isFinite(session.expiresAt)) {
    const wait = Math.max(30, session.expiresAt - Math.floor(Date.now() / 1000) - 60) * 1000;
    refreshTimer = setTimeout(refreshSession, Math.min(wait, 2 ** 31 - 1));
  }
  if (!signed) {
    // 로그아웃·세션 만료: 자료실을 닫고 메모리의 기기 키도 버립니다.
    flowId += 1;
    closeVault();
    deviceKey = null;
    gate.hidden = true;
    gateDeviceId.textContent = '-';
    gateStatus.textContent = '확인 중';
    approvePassword.value = '';
    deviceError.textContent = '';
    setApprovalBadge(null);
  } else if (!wasSigned) {
    // 새 로그인(또는 새로 고침 뒤 세션 복구): 기기 확인부터 합니다. 토큰 갱신만 있을 때는 화면을 그대로 둡니다.
    startDeviceFlow();
  }
}

let refreshing = null;
async function refreshSession() {
  refreshing ??= authCall('/api/auth/refresh')
    .then(session => { render(session); return true; })
    .catch(() => { render(null); return false; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    render(await authCall('/api/auth/login', { body: { email: email.value.trim(), password: password.value } }));
  } catch (error) {
    message.textContent = reason(error);
  } finally {
    password.value = '';
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  message.textContent = '';
  const token = accessToken;
  render(null);
  try {
    await authCall('/api/auth/logout', { token });
  } catch {
    message.textContent = '로그아웃 요청이 서버에 닿지 않았습니다. 새로고침 후 다시 시도하세요.';
  }
});

// 처음 열 때: HttpOnly 쿠키가 있으면 서버 함수가 새 access token을 돌려줍니다.
await refreshSession();
