// 3단계: Supabase Auth 이메일·비밀번호 로그인과 로그아웃 화면입니다.
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

function showNotesMessage(text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.replaceChildren(item);
}

// 세션의 access token만 Authorization 헤더로 보냅니다. userId·role은 보내지 않습니다.
let loadId = 0;
async function loadNotes(session) {
  const current = ++loadId;
  if (!session?.access_token) {
    showNotesMessage('로그인하면 가상 메모를 볼 수 있습니다.');
    return;
  }
  showNotesMessage('가상 자료를 불러오는 중입니다.');
  try {
    const response = await fetch('/api/notes', {
      cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (current !== loadId) return;
    if (response.status === 401) throw new Error('로그인 확인에 실패해 메모를 볼 수 없습니다. 다시 로그인해 주세요.');
    if (!response.ok) throw new Error('자료 함수에서 메모를 읽을 수 없습니다.');
    const data = await response.json();
    if (current !== loadId) return;
    if (!Array.isArray(data.notes)) throw new Error('자료 형식이 맞지 않습니다.');
    list.replaceChildren(...data.notes.map(note => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const content = document.createElement('span');
      title.textContent = note.title;
      content.textContent = note.content;
      item.append(title, content);
      return item;
    }));
  } catch (error) {
    if (current === loadId) showNotesMessage(error.message);
  }
}

function render(session) {
  const user = session?.user;
  form.hidden = Boolean(user);
  signedIn.hidden = !user;
  signedInEmail.textContent = user?.email ?? '';
  loadNotes(session);
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
