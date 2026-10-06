# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계 당시에는 배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있었고, `/data.json`에 같은 가상 메모가 공개되었습니다. 이 공개 상태를 확인하는 것이 1단계의 출발점이었습니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 2단계: 자료를 코드 밖으로 옮김 (저장점)

현재 단계는 `aleph.config.json`의 `step: 2`입니다. 저장소는 https://github.com/S13ee/choi-bujang-secret-vault-2 이고, 배포 주소는 https://choi-bujang-secret-vault-2-gray.vercel.app 입니다.

- 가상 메모는 Supabase 테이블 `byteback_vault_notes`에 있습니다. 테이블 생성·RLS·권한 SQL은 `supabase/byteback_vault_notes.sql`입니다. RLS가 켜져 있고 `anon`·`authenticated`에는 권한이 없습니다. 이 SQL은 이미 Supabase에서 실행했습니다.
- 메모 네 건을 넣은 insert는 Git에서 제외된 로컬 전용 파일 `supabase/byteback_vault_notes.seed.local.sql`에만 있습니다(`.gitignore`의 `supabase/*.local.sql`). 저장소에는 메모 본문이 없으며, 이 insert는 이미 실행했으므로 다시 실행하면 메모가 중복됩니다.
- 저장소와 배포 결과물에는 `data.json`이 없습니다. 화면 `/`는 서버 함수 `api/notes.js`(`/api/notes`)를 통해 메모를 읽습니다.
- 함수는 Vercel 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 씁니다. 값은 Vercel 프로젝트 **Settings → Environment Variables**에 직접 넣고, 코드·Git·로그에는 넣지 않습니다.
- `npm run build`는 Vercel 빌드에서 `public/aleph.json`을 자동으로 만들고, 여기에 `aleph.config.json`의 실제 `step` 값을 넣습니다.
- `vercel.json`은 모든 경로에 `X-Content-Type-Options: nosniff` 헤더를 붙입니다.
- `src/attack-check.mjs`의 2단계 점검은 비로그인으로 `/data.json`과 `/api/notes`를 실제로 요청하고, 상태 코드와 메모 개수만 기록합니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

다시 실행하는 방법: `npm ci` → `npm run build -- --local`(로컬 빌드 확인) → `npm run test:r5`. 메모 화면은 Vercel 배포에서만 확인할 수 있습니다.
- `npm run test:package`는 3개 중 1개가 실패합니다. 운영 측 기준표 `package/baseline-functions.json`에 새 함수 `api/notes.js`가 없기 때문이며, 운영 측 파일이라 바꾸지 않았습니다.

### 메모 문장 노출 확인 절차

검색할 문장은 README에 적지 않고, Git에서 제외된 로컬 파일 `supabase/byteback_vault_notes.seed.local.sql`에서 꺼냅니다. 저장소 폴더의 Git Bash에서 실행합니다.

1. 검색 목록 만들기 (저장소 밖 임시 파일, 출력이 `4`여야 함. `0`이면 아래 검색 결과를 믿지 마세요):
   ```
   grep -o "'[^']*')" supabase/byteback_vault_notes.seed.local.sql | tr -d "')" > "$TMP/memo-patterns.txt"; wc -l < "$TMP/memo-patterns.txt"
   ```
2. 이번에 커밋할 파일 (Git 추적 파일 + 새 파일): 둘 다 `없음`이어야 합니다.
   ```
   git grep -n -F -f "$TMP/memo-patterns.txt" || echo 없음
   git ls-files --others --exclude-standard | xargs grep -n -F -f "$TMP/memo-patterns.txt" || echo 없음
   ```
3. GitHub 최신 파일 (push 뒤): `없음`이어야 합니다.
   ```
   git fetch origin && git grep -n -F -f "$TMP/memo-patterns.txt" origin/main || echo 없음
   ```
4. 현재 배포 파일 (`<배포주소>`를 실제 주소로 바꿈): 각 경로가 `없음`이어야 합니다. `/data.json`은 404여야 합니다.
   ```
   for p in / /index.html /data.json /aleph.json; do printf '%s ' "$p"; curl -s "https://<배포주소>$p" | grep -q -F -f "$TMP/memo-patterns.txt" && echo 발견 || echo 없음; done
   ```
   `/api/notes`는 화면에 메모를 보여 주는 함수라서 지금은 메모가 응답에 나옵니다. 아래 "남은 약점"이 그 내용입니다.

**과거 노출은 해소되지 않았습니다.** 첫 공개 커밋 `e95d08b`에는 `data.json`과 `public/data.json`에 메모 문장이 들어 있고, GitHub 커밋 기록에서 누구나 볼 수 있습니다. 그 커밋으로 만든 옛 Vercel 배포도 고유 주소로 `/data.json`을 계속 보여 줄 수 있습니다. 위 검색이 모두 `없음`이어도 최신 파일과 현재 배포에서 빠졌다는 뜻일 뿐입니다.

**남은 약점:** `/api/notes`는 아직 로그인 확인이 없는 공개 주소입니다. 주소를 아는 누구나 비로그인으로 호출해 메모를 받을 수 있습니다. 키는 숨겼지만 자료 접근은 아직 막지 않았습니다. 로그인과 허용 경로는 3단계 이후에 추가합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
