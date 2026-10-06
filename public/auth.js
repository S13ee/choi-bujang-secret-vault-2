// 3단계: Supabase Auth 이메일·비밀번호 로그인·로그아웃과 가상 메모 추가·수정·삭제 화면입니다.
// Project URL과 publishable key는 브라우저용 공개 값입니다. 서버 전용 키는 여기에 넣지 않습니다.
// 비밀번호와 세션 토큰은 공식 SDK가 처리하며, 이 파일은 저장·출력하지 않습니다.
const SUPABASE_URL = 'https://yldhutxatzstfanadlsg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XYiIMi_9LEfzyCiB16zeXQ_BGhkxIto';

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
};

function reason(error) {
  const known = REASONS[error?.code];
  if (known) return `로그인 실패: ${known}`;
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
    return '로그인 실패: 로그인 서버에 연결하지 못했습니다. 네트워크를 확인하세요.';
  }
  return `로그인 실패: ${error?.message || '알 수 없는 오류'}`;
}

const list = document.querySelector('#notes');
const noteSection = document.querySelector('#note-section');
const noteForm = document.querySelector('#note-form');
const noteTitle = document.querySelector('#note-title');
const noteBody = document.querySelector('#note-body');
const noteMessage = document.querySelector('#note-error');

let accessToken = null;

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

// 세션의 access token만 Authorization 헤더로 보냅니다. userId·role·owner_id는 보내지 않습니다.
async function api(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method, cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(API_ERRORS[response.status] ?? data?.message ?? `요청 실패 (HTTP ${response.status})`);
  return data;
}

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
  if (!accessToken) {
    showNotesMessage('로그인하면 가상 메모를 볼 수 있습니다.');
    return;
  }
  try {
    const notes = await api('/api/notes');
    if (current !== loadId) return;
    if (!Array.isArray(notes)) throw new Error('자료 형식이 맞지 않습니다.');
    if (!notes.length) showNotesMessage('아직 내 메모가 없습니다.');
    else list.replaceChildren(...notes.map(noteItem));
  } catch (error) {
    if (current === loadId) showNotesMessage(error.message);
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

function render(session) {
  const user = session?.user;
  const tokenChanged = accessToken !== (session?.access_token ?? null);
  accessToken = session?.access_token ?? null;
  form.hidden = Boolean(user);
  signedIn.hidden = !user;
  noteSection.hidden = !user;
  signedInEmail.textContent = user?.email ?? '';
  if (!user) noteMessage.textContent = '';
  // 토큰 갱신만 있을 때는 수정 중인 화면을 지우지 않습니다.
  if (tokenChanged && (!user || list.querySelector('.note-edit') === null)) {
    showNotesMessage(user ? '가상 자료를 불러오는 중입니다.' : '');
    loadNotes();
  }
}

try {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  // INITIAL_SESSION·SIGNED_IN·TOKEN_REFRESHED·SIGNED_OUT마다 화면과 메모를 다시 맞춥니다.
  supabase.auth.onAuthStateChange((_event, session) => render(session));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value.trim(), password: password.value,
      });
      if (error) message.textContent = reason(error);
    } catch (error) {
      message.textContent = reason(error);
    } finally {
      password.value = '';
      button.disabled = false;
    }
  });

  logout.addEventListener('click', async () => {
    message.textContent = '';
    const { error } = await supabase.auth.signOut();
    if (error) message.textContent = `로그아웃 실패: ${error.message}`;
  });
} catch {
  form.hidden = true;
  message.textContent = '로그인 화면을 불러오지 못했습니다. 새로고침해 주세요.';
  showNotesMessage('로그인 화면을 불러오지 못해 메모를 볼 수 없습니다.');
}
