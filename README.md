# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계 당시에는 배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있었고, `/data.json`에 같은 가상 메모가 공개되었습니다. 이 공개 상태를 확인하는 것이 1단계의 출발점이었습니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 2단계: 자료를 코드 밖으로 옮김 (저장점)

2단계 저장점 커밋은 `5c32482`입니다. 현재 상태는 아래 "5단계"~"8단계" 절을 보세요.

- 가상 메모는 Supabase 테이블 `byteback_vault_notes`에 있습니다. 테이블 생성·RLS·권한 SQL은 `supabase/byteback_vault_notes.sql`입니다. RLS가 켜져 있고 `anon`·`authenticated`에는 권한이 없습니다. 이 SQL은 이미 Supabase에서 실행했습니다.
- 메모 네 건을 넣은 insert는 Git에서 제외된 로컬 전용 파일 `supabase/byteback_vault_notes.seed.local.sql`에만 있습니다(`.gitignore`의 `supabase/*.local.sql`). 저장소에는 메모 본문이 없으며, 이 insert는 이미 실행했으므로 다시 실행하면 메모가 중복됩니다.
- 저장소와 배포 결과물에는 `data.json`이 없습니다. 화면 `/`는 서버 함수 `/api/notes`를 통해 메모를 읽습니다(3단계에서 `api/notes/index.js`로 옮김).
- 함수는 Vercel 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 씁니다. 값은 Vercel 프로젝트 **Settings → Environment Variables**에 직접 넣고, 코드·Git·로그에는 넣지 않습니다.
- `npm run build`는 Vercel 빌드에서 `public/aleph.json`을 자동으로 만들고, 여기에 `aleph.config.json`의 실제 `step` 값을 넣습니다.
- `vercel.json`은 모든 경로에 `X-Content-Type-Options: nosniff` 헤더를 붙입니다.
- `src/attack-check.mjs`의 2단계 점검(`step: 2`일 때)은 비로그인으로 `/data.json`과 `/api/notes`를 실제로 요청하고, 상태 코드와 메모 개수만 기록했습니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

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
   `/api/notes`는 3단계부터 로그인 없이는 401 JSON만 돌려주므로 비로그인 요청에서 메모가 나오면 안 됩니다. 로그인한 사용자에게는 메모를 돌려주는 것이 정상입니다.

**과거 노출은 해소되지 않았습니다.** 첫 공개 커밋 `e95d08b`에는 `data.json`과 `public/data.json`에 메모 문장이 들어 있고, GitHub 커밋 기록에서 누구나 볼 수 있습니다. 그 커밋으로 만든 옛 Vercel 배포도 고유 주소로 `/data.json`을 계속 보여 줄 수 있습니다. 위 검색이 모두 `없음`이어도 최신 파일과 현재 배포에서 빠졌다는 뜻일 뿐입니다.

**2단계 당시 남은 약점 (3단계에서 막음):** `/api/notes`는 로그인 확인이 없는 공개 주소여서 누구나 비로그인으로 메모를 받을 수 있었습니다. 3단계에서 로그인 토큰 검사를 붙여 막았습니다.

## 3단계: 진짜 로그인을 붙임 (저장점)

3단계 저장점 커밋은 `b596498`입니다. 현재 상태는 아래 "5단계"~"8단계" 절을 보세요.

- **로그인 화면**: `public/auth.js`가 공식 `@supabase/supabase-js`(2.117.2)로 Supabase Auth 이메일·비밀번호 로그인·로그아웃을 처리합니다. 화면 코드에는 공개용 Project URL과 publishable key만 있습니다. 로그인에 실패하면 이유를 화면에 보여 주고, 로그인하면 입력 칸이 숨겨집니다.
- **토큰 검사**: 자료 API는 `Authorization: Bearer <토큰>`을 시작 틀의 `src/verify-login.mjs`로 검사합니다. 브라우저가 보낸 `userId`·`role`·`owner_id`는 믿지 않습니다. 토큰이 없거나 검사에 실패하면 자료 없이 `401` JSON(`LOGIN_REQUIRED`)으로 거부합니다.
- **발급자 정보**: `aleph.config.json`의 `identityProvider`에 Supabase Auth 발급자(`…/auth/v1`), 대상(`authenticated`), 공개키 주소(`…/auth/v1/.well-known/jwks.json`)를 적었습니다. 비밀 키는 없습니다.
- **자료 API** (`src/notes-api.mjs`, `api/notes/index.js`, `api/notes/[id].js`): `aleph.config.json`의 `allowedRoutes`와 같습니다.
  - `GET /api/notes`: 로그인 사용자의 메모 배열 `[{id,title,body}]` (`owner_id` = 서버가 확인한 사용자 ID)
  - `POST /api/notes` `{id?, title, body}`: 서버가 확인한 사용자 ID를 `owner_id`로 저장하고 `201 {id}`를 돌려줍니다. id가 없으면 서버가 UUID를 만듭니다.
  - `GET /api/notes/:id` → `{id,title,body}`, `PUT /api/notes/:id` `{title, body}`, `DELETE /api/notes/:id`. 지운 뒤 GET은 `404`입니다.
- **화면**: 로그인하면 메모 추가 폼과 메모별 수정·삭제 버튼이 보입니다.
- **SQL**: `supabase/byteback_vault_notes_step3.sql`은 기존 메모의 빈 `owner_id`를 A 계정 ID로 채우고 `owner_id` 색인을 만듭니다. `byteback_vault_notes`만 건드리며, 학생이 A 계정 UUID를 넣어 직접 실행했고, 배포 화면에서 A로 로그인해 기존 메모 네 건이 보이는 것을 학생이 확인했습니다.
- **`aleph.json`**: Vercel 빌드에서 계속 자동으로 만들어지고, `step: 3`이 들어갑니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 3`): 배포 주소에 실제로 보낸 요청의 결과만 기록합니다. 로그인 없이 목록 조회, 로그인 없이 메모 추가, 형식만 갖춘 가짜 토큰(무작위 서명)으로 목록 조회를 보내고, 상태 코드와 오류 코드만 남깁니다. 실제 계정의 비밀번호·토큰은 쓰지 않습니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

**3단계 당시 허점 (4단계에서 막음):** 한 건 `GET`·`PUT`·`DELETE /api/notes/:id`가 소유자를 검사하지 않아, 로그인한 B가 A 메모의 id를 알면 그 메모를 읽고, 고치고, 지울 수 있었습니다. 4단계에서 API 소유자 검사와 DB 정책으로 막았습니다.

## 4단계: 로그인해도 내 자료만 보이게 함 (저장점)

4단계 저장점 커밋은 `458c61e`입니다. 현재 상태는 아래 "5단계"~"8단계" 절을 보세요.

- **API 소유자 검사** (`src/notes-api.mjs`): 모든 읽기·추가·수정·삭제가 `src/verify-login.mjs`로 검증된 사용자 ID만 씁니다. URL·본문의 `owner_id`·`userId`·`role`은 읽지 않습니다.
  - 목록 `GET /api/notes`와 한 건 `GET /api/notes/:id`: `owner_id`가 본인인 행만
  - `POST /api/notes`: 검증된 사용자 ID를 `owner_id`로 저장
  - `PUT /api/notes/:id` `{title, body}`: 기존 행이 본인 것일 때만 바꾸고(`owner_id` 조건), `owner_id`는 바꾸지 않으며, 저장된 새 행의 소유자가 본인인지 다시 확인
  - `DELETE /api/notes/:id`: 본인 것만
  - 남의 메모와 없는 메모는 같은 `404`(`NOTE_NOT_FOUND`)로 답해 남의 메모가 있는지도 알려 주지 않습니다. 한 건 응답은 `{id,title,body}`입니다.
- **DB 권한과 RLS** (`supabase/byteback_vault_notes_step4_rls.sql`, `public.byteback_vault_notes`만 대상): `PUBLIC`·`anon`·`authenticated`의 권한을 모두 회수한 뒤 `authenticated`에만 SELECT·INSERT·UPDATE·DELETE를 주고, 정책 네 개로 `auth.uid() = owner_id`일 때만 허용합니다(SELECT·DELETE는 USING, INSERT는 WITH CHECK, UPDATE는 USING과 WITH CHECK). `service_role` 권한은 그대로입니다. 학생이 SQL Editor에서 실행했고, 적용 후 `anon` 권한 없음, `authenticated`는 네 권한만, `service_role` 그대로, 정책 네 개인 것을 확인했습니다. **이때 준 `authenticated` 직접 권한은 5단계에서 거뒀습니다.**
  - 서버 함수는 `service_role`로 접근해 RLS를 우회하므로, API의 소유자 검사가 실제 보호선입니다. RLS는 로그인 사용자가 publishable key와 자기 토큰으로 테이블 API를 직접 부를 때 자기 행만 다루게 막습니다.
- **시험 자료**: B 소유의 공개 가능한 시험 메모 한 건(고정 id `b4b4b4b4-0000-4000-8000-00000000b004`)과 기존 메모의 A 연결은 Git에서 제외된 로컬 전용 파일 `supabase/byteback_vault_notes_step4.local.sql`로 준비합니다(계정 이메일·메모 문장이 있어 저장소에는 없음).
- **화면**: 상단 안내가 4단계 상태(남의 메모는 읽기·수정·삭제 모두 거부)를 보여 줍니다.
- **`aleph.json`**: Vercel 빌드에서 계속 자동으로 만들어지고, `step: 4`가 들어갑니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 4`): 계정 없이 할 수 있는 요청만 배포 주소에 실제로 보내고 결과를 기록합니다. 로그인 없이 목록 조회, 로그인 없이 B 시험 메모 조회·수정, 형식만 갖춘 가짜 토큰으로 B 시험 메모 조회입니다. 실제 계정 토큰이 필요한 A/B 교차 점검(A 토큰으로 B 메모 GET·PUT·DELETE)은 「미실행, 화면에서 직접 확인」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

## 5단계: 자료 요청을 서버 한곳으로 모음 (저장점)

5단계 저장점 커밋은 `c33ff9c`이고, 보완 커밋은 `392b66c`(`aleph.json`에 `originalApiUrl` 포함)와 `b4bcc42`(로그인을 서버 함수로 옮김)입니다. 저장소는 https://github.com/S13ee/choi-bujang-secret-vault-2 이고, 배포 주소는 https://choi-bujang-secret-vault-2-gray.vercel.app 입니다. `identityProvider`는 4단계와 같습니다. `allowedRoutes`는 메모 경로 다섯 개(`GET`·`POST /api/notes`, `GET`·`PUT`·`DELETE /api/notes/:id`)에 로그인 경로 세 개(`POST /api/auth/login`·`/api/auth/refresh`·`/api/auth/logout`)를 더한 여덟 경로였습니다. **8단계에서 판정기가 허용하는 세 경로(`GET /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`)로 바꿨습니다.** 서버 함수 자체는 그대로 있습니다.

- **서버 한곳**: 브라우저 코드(`public/`)는 Supabase를 직접 부르지 않습니다. 메모 읽기·추가·수정·삭제는 서버 함수 `/api/notes`, `/api/notes/:id`로만, 로그인은 아래 `/api/auth/*`로만 합니다. 서버 함수의 로그인 검사(`src/verify-login.mjs`)·소유자 검사(`src/notes-api.mjs`)와 서버 전용 설정(`SUPABASE_SECRET_KEY`)은 그대로입니다.
- **직접 권한 회수** (`supabase/byteback_vault_notes_step5_revoke.sql`, `public.byteback_vault_notes`만 대상): `REVOKE ALL ... FROM PUBLIC, anon, authenticated` 한 문장입니다. **4단계에서 `authenticated`에 준 SELECT·INSERT·UPDATE·DELETE 직접 권한을 5단계에서 거뒀습니다.** `service_role` 권한, RLS, 4단계 정책 네 개는 그대로입니다(권한이 없으니 정책은 다시 권한이 생길 때를 대비한 안전장치입니다). 학생이 SQL Editor에서 실행했고, `anon`·`authenticated`는 읽기·추가·수정·삭제 모두 false, `service_role`은 모두 true인 것을 확인했습니다.
- **원본 자료 주소**: `aleph.config.json`의 `originalApiUrl`은 쿼리 없는 HTTPS 경로 `https://yldhutxatzstfanadlsg.supabase.co/rest/v1/byteback_vault_notes`(Supabase 테이블 API)입니다. 이 주소는 서버 함수만 서버 전용 키로 씁니다.
- **`aleph.json`**: Vercel 빌드에서 계속 자동으로 만들어지고, 기존 항목(`schema`·`step`·`repoUrl`·`commit`·`publicAppUrl`·`judgeIssuer`·`sampleMarker`)에 더해 `aleph.config.json`의 `allowedRoutes`와 `originalApiUrl`이 함께 들어갑니다(`scripts/deployment-identity.mjs`, 형식이 잘못된 경로나 5단계 이상에서 쿼리 없는 HTTPS가 아닌 `originalApiUrl`은 빌드 실패).
- **화면**: 상단 안내가 5단계 상태(메모는 서버 함수로만 읽고 쓰며, 자료 저장소 직접 접근은 닫힘)를 보여 줍니다.
- **로그인도 서버 함수로**: 로그인·토큰 갱신·로그아웃은 `POST /api/auth/login`·`/api/auth/refresh`·`/api/auth/logout`(`src/auth-api.mjs`)이 Vercel 환경변수 `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY`로 처리하고, refresh token은 HttpOnly 쿠키로만 다루며, `public/` 화면 코드에는 Supabase 주소·공개 키·SDK가 없습니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 5`): 키·토큰 없이 `originalApiUrl`을 직접 조회하고, 로그인 없이 `/api/notes`를 요청해 실제 결과만 기록합니다(화면 코드에 Supabase 키가 없으므로 키를 찾거나 보내지 않음). 요청 자체가 실패하면 원인 코드와 함께 「요청 실패, 판단 불가」로 남깁니다. 응답 본문은 남기지 않습니다. 로그인이 필요한 점검(로그인 토큰으로 원본 직접 조회, 서버 함수로 A의 목록·추가·수정·삭제)은 「미실행, 화면에서 직접 확인」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

**`npm run test:package`:** 3개 모두 통과하지만, 운영 측 기준표가 새 함수를 인정했다는 뜻은 아닙니다. 이 테스트는 `api/` 맨 위의 `.js` 파일만 기준표와 비교하므로 하위 폴더 `api/notes/`의 함수를 보지 않습니다. 운영 측 파일(`package/baseline-functions.json`, `test/package-starter.test.mjs`)은 바꾸지 않았습니다.

다시 실행하는 방법: `npm ci` → `npm run build -- --local`(로컬 빌드 확인) → `npm run test:r5` → `npm run decider:test`(6·7단계) → `npm run fixture:7`(7단계). 로그인과 메모 화면은 Vercel 배포에서만 확인할 수 있으며, Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, 서버 전용 `SUPABASE_SECRET_KEY`가 필요합니다. 값은 Vercel **Settings → Environment Variables**에 직접 넣습니다.

## 6단계: 등록한 기기만 자료실에 들어옵니다 (저장점)

6단계 저장점 커밋은 `9bce033`입니다. 현재 상태는 아래 "8단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`allowedRoutes`(당시 여덟 경로, 8단계에서 세 경로로 바뀜)·`originalApiUrl`·`judgeIssuer`는 5단계와 같습니다. 6단계 당시 빌드가 만든 `aleph.json`에는 `step: 6`과 함께 `allowedRoutes`·`originalApiUrl`이 그대로 들어갑니다.

- **판정기 규칙** (`src/decider.mjs`, `device_registered`): `docs/DECIDER_REQUEST.md` 계약의 `deviceRegistered`가 정확히 `true`이고 `method`가 `GET`인 요청만 `allow`·`approved`로 허용합니다. `false`·값 없음·`"true"`·`1`은 `deny`·`device_not_registered`로 거부합니다. 등록 기기의 GET이 아닌 요청은 기본 거부(`starter.deny`, `starter_not_ready`)입니다. 요청이 객체가 아니어도 예외 없이 형식이 맞는 거부를 돌려줍니다.
- 이번 과정에는 학생이 따로 설치할 접속 프로그램이 없습니다. 미등록 기기로 들어오는 공격은 심판이 맡습니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 6`): 5단계 점검(키 없이 원본 직접 조회, 로그인 없이 `/api/notes`)을 그대로 실제로 보냅니다. 미등록 기기 접속 점검은 학생 점검에 접속 수단이 없으므로 「미실행, 심판이 확인」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. 저장소 폴더에서 `npm run decider:test`를 실행합니다.
2. `통과 · 등록 기기의 정상 요청`이 나오는지 봅니다. 등록 기기(`deviceRegistered: true`)의 GET 요청이 `allow`라는 뜻입니다.
3. `통과 · 미등록 기기의 가상 요청`이 나오는지 봅니다. `deviceRegistered: false` 요청이 `deny`이고 이유 코드가 `device_not_registered`라는 뜻입니다.
4. 둘 중 하나라도 `확인 필요`가 나오면 `src/decider.mjs`의 `device_registered` 규칙을 다시 봅니다.

이 명령은 로컬 가상 요청 연습이며 심판 판정이나 반 엔진 연결 증거가 아닙니다.

## 7단계: 평소와 다른 접속은 다시 확인합니다 (저장점)

7단계 저장점 커밋은 `925731e`입니다. 현재 상태는 아래 "8단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`allowedRoutes`(당시 여덟 경로, 8단계에서 세 경로로 바뀜)·`originalApiUrl`·`judgeIssuer`는 5·6단계와 같고, 빌드가 만드는 `aleph.json`에는 `step: 7`과 함께 `allowedRoutes`·`originalApiUrl`이 그대로 들어갑니다. API·화면·DB는 6단계와 같고, 이번 단계는 판정기(`src/decider.mjs`)와 자기 점검만 바꿨습니다.

- **재로그인 계약**: `docs/DECIDER_REQUEST.md`의 `stepUp` `{verified, authAgeSeconds}`가 엔진이 확인해 넘기는 재인증 상태입니다. 판정기가 `step_up`을 돌려주면 엔진이 추가 본인 확인을 요청하고, 새 로그인 뒤 같은 요청을 `verified: true`로 다시 판정받습니다. 같은 사용자의 로그인인지 묶는 일은 엔진이 하며(계약에 세션 ID 없음), 토큰 원문은 판정 요청에 없고 판정기도 기록하지 않습니다.
- **입력 검사** (`src/decider.mjs`): `signals.source`가 정확히 `judge_fixture`일 때만 `region`·`network`·`hour`를 씁니다. `none`·빈 값·다른 출처, `unknown`, 0~23 정수가 아닌 시각은 신호 없음이며 정상값으로 채우지 않습니다. `recentEvents`는 `{kind, ageSeconds, count}` 모양인 항목만 읽고 나머지는 버립니다.
- **판정기 규칙** (`step_up_required`): 등록 기기의 GET 요청에서 믿을 수 있는 신호(`judge_fixture`)나 최근 사건 가운데 **하나라도** 이상하면, 엔진이 확인한 재인증(`verified === true`, `authAgeSeconds` 0~300 정수)이 없는 한 `step_up`·`step_up_required`로 자료를 주지 않습니다. 재인증 뒤에는 `allow`·`approved`입니다. 이상 기준은 지역이 `local`이 아닌 값(`anomaly.region`), 네트워크가 `usual`이 아닌 값(`anomaly.network`), 0~5시(`anomaly.hour`), 최근 900초 안 `risk_signal` 합계 5 이상 또는 종류와 상관없이 600초 안 한 사건의 `count` 10 이상(`anomaly.burst`)입니다. `unknown`과 신호 없음은 이상으로 세지 않습니다. 실제로 걸린 이상의 규칙 이름은 `ruleIds`에 `step_up_required`와 함께 남고, 이유 코드는 `step_up_required` 하나입니다. `stepUp`만으로는 미등록 기기나 GET이 아닌 요청을 통과시키지 않습니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 7`): 6단계 점검(키 없이 원본 직접 조회, 로그인 없이 `/api/notes`)을 그대로 실제로 보냅니다. 평소와 다른 접속의 재인증 전 차단 점검은 엔진이 판정기의 `step_up`을 받아 처리하므로 「미실행, 엔진 연결 필요」로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. `npm run decider:test`: 네 줄(등록 기기의 정상 요청, 미등록 기기의 가상 요청, 복합 이상 접속, 다시 확인한 복합 이상 접속)이 모두 `통과`여야 합니다.
2. `npm run fixture:7`: `정상 사건: allow`, `복합 이상 사건: step_up`이 나와야 합니다.

두 명령은 로컬 가상 요청 연습이며 심판 판정이 아닙니다. **엔진을 거친 실제 자료 차단 시험(평소와 다른 접속에서 새 로그인 전 자료가 막히고, 새 로그인 뒤 다시 판정되는지)은 미실행입니다.** 이 PC에는 제공 엔진이 연결돼 있지 않습니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다 (저장점)

현재 단계는 `aleph.config.json`의 `step: 8`입니다. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`는 7단계와 같습니다. `allowedRoutes`는 판정기가 허용하는 세 경로 `GET /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`뿐이며, 빌드가 만드는 `aleph.json`에 `step: 8`·이 세 경로·`originalApiUrl`이 들어갑니다. 메모 목록·쓰기, 로그인, 관리 경로의 서버 함수는 그대로 있지만 `allowedRoutes`에는 없습니다.

- **공지 자원** (`notices`): 반 공지는 메모(`notes`, `byteback_vault_notes`)와 다른 별도 테이블 `byteback_vault_notices`에 있습니다. `GET /api/notices`(목록)와 `GET /api/notices/:id`(한 건, `{id,title,body}`)는 로그인한 사용자만 읽고(`src/verify-login.mjs`), 쓰기는 누구에게나 405입니다(`src/notices-api.mjs`, `api/notices/`). 메모 경로에 공지 id를 넣거나 공지 경로에 메모 id를 넣어도 각각 404입니다.
- **강사 목록 테이블** `byteback_vault_instructors`(`user_id uuid`): 강사 여부는 서버가 확인한 학생 로그인 사용자 ID가 이 테이블에 있는지로만 판단합니다. **처음에는 비어 있습니다.** 강사 계정 UUID는 학생이 SQL Editor에서 직접 넣고 저장소에는 적지 않습니다.
- **관리 경로** `PUT /api/admin/notices/:id`(`api/admin/notices/[id].js`): 강사의 공지 수정은 이 경로로만 받습니다. 강사 목록에 없으면 403 `NOT_INSTRUCTOR`, 로그인이 없으면 401입니다. 심판 토큰은 강사가 아니며, 요청 본문·쿼리·헤더의 `role`·`isInstructor`는 읽지 않습니다. 본문은 `title`·`body`만 받습니다. 판정기가 허용하지 않는 경로라 `allowedRoutes`에 넣지 않았습니다. 거부 응답은 짧은 오류 코드 JSON이고, 서버 로그에는 오류 코드만 남깁니다.
- **메모 API**는 바뀌지 않았습니다. 목록은 자기 메모만, 남의 메모는 GET·PUT·DELETE 모두 404입니다.
- **판정기 구역 규칙** (`src/decider.mjs`): 순서는 기기 등록 → 구역 → 7단계 이상 신호 `step_up` → 허용입니다. 허용 경로는 `GET /notes/:id`, `GET /notices`, `GET /notices/:id` 셋뿐이며 route 앞의 `/api` 유무만 같은 경로로 봅니다. method가 route와 같고, path가 route 모양과 칸 수까지 맞고(`:id`는 빈 값이 아닌 한 칸, UUID 여부는 보지 않음), service가 경로 첫 칸과 같고, `queryLength`가 0일 때만 그 구역으로 인정합니다. 거부는 재인증 여부와 상관없이 `deny`·`starter_not_ready`이고, 사유는 `ruleIds`에 `zone.notes.list`·`zone.notes.write`·`zone.notices.write`·`zone.instructor`·`zone.route_mismatch`·`zone.query`·`zone.unknown`으로 남깁니다. 허용에는 `zone.notes.read` 또는 `zone.notices.read`가 함께 남습니다. 메모 주인 비교는 판정기가 아니라 메모 API가 합니다.
- **SQL**: `supabase/byteback_vault_notices_step8.sql`이 두 테이블을 만들고 RLS를 켜며 `PUBLIC`·`anon`·`authenticated` 권한을 회수하고 `service_role`에만 권한을 줍니다. 메모 테이블을 포함해 다른 테이블은 건드리지 않습니다. 시험용 가상 공지 한 건(고정 id `c8c8c8c8-0000-4000-8000-00000000c008`)의 insert는 Git에서 제외된 로컬 전용 파일 `supabase/byteback_vault_notices_seed.local.sql`에 있습니다. 두 파일 모두 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 8`): 7단계 점검에 더해 로그인 없이 `GET /api/notices`와 `PUT /api/admin/notices/:id`(본문에 `role: instructor`를 넣음)를 실제로 보내 결과를 기록합니다. 학생 A 토큰으로 관리 경로 수정(403 기대), 메모·공지 id 교차 조회(404 기대)는 실제 계정 토큰이 필요해 「미실행」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. `npm run decider:test`(네 줄 통과), `npm run fixture:7`(`정상 사건: allow`, `복합 이상 사건: step_up`)을 실행합니다. 로컬 가상 연습이며 심판 판정이 아닙니다.
2. 배포 뒤 로그인 없이 `/api/notices`를 요청하면 401 JSON이어야 합니다.
3. 로그인한 A 토큰으로 `GET /api/notices`는 공지 목록, `PUT /api/admin/notices/:id`는 403 `NOT_INSTRUCTOR`, `/api/notices/:id`로 PUT은 405여야 합니다.
4. 엔진을 거친 구역 차단 시험은 이 PC에 제공 엔진이 연결돼 있지 않아 **미실행**입니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 1단계에서는 자리표시자였고, 2단계 저장점에서 실제 저장소·배포 주소로 바꿨습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`은 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 빌드만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `aleph.config.json`의 `step`에 맞는 점검 요청을 보냅니다. 1단계는 `/data.json`의 공개 메모 확인 표시, 2단계는 `/data.json`과 비로그인 `/api/notes`, 3단계는 비로그인·가짜 토큰 요청의 거부 여부, 4단계는 비로그인·가짜 토큰으로 남의 메모를 요청했을 때의 거부 여부를 기록하고 A/B 교차 점검은 미실행으로 남깁니다. 5단계는 키 없이 원본 자료 주소를 직접 조회했을 때와 비로그인 `/api/notes`의 거부 여부를 기록하고, 로그인이 필요한 점검은 미실행으로 남깁니다. 6단계는 5단계 점검을 다시 보내고, 미등록 기기 접속 점검은 심판 몫이라 미실행으로 남깁니다. 7단계는 6단계 점검을 다시 보내고, 재인증 전 차단 점검은 엔진 연결이 필요해 미실행으로 남깁니다. 8단계는 7단계 점검에 더해 로그인 없이 공지 목록과 강사 관리 경로를 요청한 결과를 기록하고, 로그인이 필요한 교차 점검은 미실행으로 남깁니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
