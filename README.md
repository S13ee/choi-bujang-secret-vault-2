# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계 당시에는 배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있었고, `/data.json`에 같은 가상 메모가 공개되었습니다. 이 공개 상태를 확인하는 것이 1단계의 출발점이었습니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 2단계: 자료를 코드 밖으로 옮김 (저장점)

2단계 저장점 커밋은 `5c32482`입니다. 현재 상태는 아래 "5단계"~"11단계" 절을 보세요.

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

3단계 저장점 커밋은 `b596498`입니다. 현재 상태는 아래 "5단계"~"11단계" 절을 보세요.

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

4단계 저장점 커밋은 `458c61e`입니다. 현재 상태는 아래 "5단계"~"11단계" 절을 보세요.

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

다시 실행하는 방법: `npm ci` → `npm run build -- --local`(로컬 빌드 확인) → `npm run test:r5` → `npm run decider:test`(6·7단계) → `npm run fixture:7`(7단계) → `npm run detect:test`(9단계) → `npm run policy:diff`(10단계) → `npm run test:device`(11단계). 로그인과 메모 화면은 Vercel 배포에서만 확인할 수 있으며, Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, 서버 전용 `SUPABASE_SECRET_KEY`가 필요합니다. 값은 Vercel **Settings → Environment Variables**에 직접 넣습니다.

## 6단계: 등록한 기기만 자료실에 들어옵니다 (저장점)

6단계 저장점 커밋은 `9bce033`입니다. 현재 상태는 아래 "8단계"~"11단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`allowedRoutes`(당시 여덟 경로, 8단계에서 세 경로로 바뀜)·`originalApiUrl`·`judgeIssuer`는 5단계와 같습니다. 6단계 당시 빌드가 만든 `aleph.json`에는 `step: 6`과 함께 `allowedRoutes`·`originalApiUrl`이 그대로 들어갑니다.

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

7단계 저장점 커밋은 `925731e`입니다. 현재 상태는 아래 "8단계"~"11단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`allowedRoutes`(당시 여덟 경로, 8단계에서 세 경로로 바뀜)·`originalApiUrl`·`judgeIssuer`는 5·6단계와 같고, 빌드가 만드는 `aleph.json`에는 `step: 7`과 함께 `allowedRoutes`·`originalApiUrl`이 그대로 들어갑니다. API·화면·DB는 6단계와 같고, 이번 단계는 판정기(`src/decider.mjs`)와 자기 점검만 바꿨습니다.

- **재로그인 계약**: `docs/DECIDER_REQUEST.md`의 `stepUp` `{verified, authAgeSeconds}`가 엔진이 확인해 넘기는 재인증 상태입니다. 판정기가 `step_up`을 돌려주면 엔진이 추가 본인 확인을 요청하고, 새 로그인 뒤 같은 요청을 `verified: true`로 다시 판정받습니다. 같은 사용자의 로그인인지 묶는 일은 엔진이 하며(계약에 세션 ID 없음), 토큰 원문은 판정 요청에 없고 판정기도 기록하지 않습니다.
- **입력 검사** (`src/decider.mjs`): `signals.source`가 정확히 `judge_fixture`일 때만 `region`·`network`·`hour`를 씁니다. `none`·빈 값·다른 출처, `unknown`, 0~23 정수가 아닌 시각은 신호 없음이며 정상값으로 채우지 않습니다. `recentEvents`는 `{kind, ageSeconds, count}` 모양인 항목만 읽고 나머지는 버립니다.
- **판정기 규칙** (`step_up_required`): 등록 기기의 GET 요청에서 믿을 수 있는 신호(`judge_fixture`)나 최근 사건 가운데 **하나라도** 이상하면, 엔진이 확인한 재인증(`verified === true`, `authAgeSeconds` 0~300 정수)이 없는 한 `step_up`·`step_up_required`로 자료를 주지 않습니다. 재인증 뒤에는 `allow`·`approved`입니다. 이상 기준은 지역이 `local`이 아닌 값(`anomaly.region`), 네트워크가 `usual`이 아닌 값(`anomaly.network`), 0~5시(`anomaly.hour`), 최근 900초 안 `risk_signal` 합계 5 이상 또는 종류와 상관없이 600초 안 한 사건의 `count` 10 이상(`anomaly.burst`)입니다. `unknown`과 신호 없음은 이상으로 세지 않습니다. 실제로 걸린 이상의 규칙 이름은 `ruleIds`에 `step_up_required`와 함께 남고, 이유 코드는 `step_up_required` 하나입니다. `stepUp`만으로는 미등록 기기나 GET이 아닌 요청을 통과시키지 않습니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 7`): 6단계 점검(키 없이 원본 직접 조회, 로그인 없이 `/api/notes`)을 그대로 실제로 보냅니다. 평소와 다른 접속의 재인증 전 차단 점검은 엔진이 판정기의 `step_up`을 받아 처리하므로 「미실행, 엔진 연결 필요」로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. `npm run decider:test`: 네 줄(등록 기기의 정상 요청, 미등록 기기의 가상 요청, 복합 이상 접속, 다시 확인한 복합 이상 접속)이 모두 `통과`여야 합니다.
2. `npm run fixture:7`: `정상 사건: allow`, `복합 이상 사건: step_up`이 나와야 합니다.

두 명령은 로컬 가상 요청 연습이며 심판 판정이 아닙니다. **엔진을 거친 실제 자료 차단 시험(평소와 다른 접속에서 새 로그인 전 자료가 막히고, 새 로그인 뒤 다시 판정되는지)은 미실행입니다.** 이 PC에는 제공 엔진이 연결돼 있지 않습니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다 (저장점)

8단계 저장점 커밋은 `8832375`입니다. 현재 상태는 아래 "9단계"~"11단계" 절도 보세요. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`는 7단계와 같습니다. `allowedRoutes`는 판정기가 허용하는 세 경로 `GET /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`뿐이며, 8단계 당시 빌드가 만든 `aleph.json`에는 `step: 8`·이 세 경로·`originalApiUrl`이 들어갔습니다. 메모 목록·쓰기, 로그인, 관리 경로의 서버 함수는 그대로 있지만 `allowedRoutes`에는 없습니다.

- **공지 자원** (`notices`): 반 공지는 메모(`notes`, `byteback_vault_notes`)와 다른 별도 테이블 `byteback_vault_notices`에 있습니다. `GET /api/notices`(목록)와 `GET /api/notices/:id`(한 건, `{id,title,body}`)는 로그인한 사용자만 읽고(`src/verify-login.mjs`), 쓰기는 누구에게나 405입니다(`src/notices-api.mjs`, `api/notices/`). 메모 경로에 공지 id를 넣거나 공지 경로에 메모 id를 넣어도 각각 404입니다.
- **강사 목록 테이블** `byteback_vault_instructors`(`user_id uuid`): 강사 여부는 서버가 확인한 학생 로그인 사용자 ID가 이 테이블에 있는지로만 판단합니다. **처음에는 비어 있습니다.** 강사 계정 UUID는 학생이 SQL Editor에서 직접 넣고 저장소에는 적지 않습니다.
- **관리 경로** `PUT /api/admin/notices/:id`(`api/admin/notices/[id].js`): 강사의 공지 수정은 이 경로로만 받습니다. 강사 목록에 없으면 403 `NOT_INSTRUCTOR`, 로그인이 없으면 401입니다. 심판 토큰은 강사가 아니며, 요청 본문·쿼리·헤더의 `role`·`isInstructor`는 읽지 않습니다. 본문은 `title`·`body`만 받습니다. 판정기가 허용하지 않는 경로라 `allowedRoutes`에 넣지 않았습니다. 거부 응답은 짧은 오류 코드 JSON이고, 서버 로그에는 오류 코드만 남깁니다.
- **메모 API**는 바뀌지 않았습니다. 목록은 자기 메모만, 남의 메모는 GET·PUT·DELETE 모두 404입니다.
- **판정기 구역 규칙** (`src/decider.mjs`): 순서는 기기 등록 → 구역 → 7단계 이상 신호 `step_up` → 허용입니다. 허용 경로는 `GET /notes/:id`, `GET /notices`, `GET /notices/:id` 셋뿐이며 route 앞의 `/api` 유무만 같은 경로로 봅니다. method가 route와 같고, path가 route 모양과 칸 수까지 맞고(`:id`는 빈 값이 아닌 한 칸, UUID 여부는 보지 않음), service가 경로 첫 칸과 같고, `queryLength`가 0일 때만 그 구역으로 인정합니다. 거부는 재인증 여부와 상관없이 `deny`·`starter_not_ready`이고, 사유는 `ruleIds`에 `zone.notes.list`·`zone.notes.write`·`zone.notices.write`·`zone.instructor`·`zone.route_mismatch`·`zone.query`·`zone.unknown`으로 남깁니다. 허용에는 `zone.notes.read` 또는 `zone.notices.read`가 함께 남습니다. 메모 주인 비교는 판정기가 아니라 메모 API가 합니다.
- **SQL**: `supabase/byteback_vault_notices_step8.sql`이 두 테이블을 만들고 RLS를 켜며 `PUBLIC`·`anon`·`authenticated` 권한을 회수하고 `service_role`에만 권한을 줍니다. 메모 테이블을 포함해 다른 테이블은 건드리지 않습니다. 시험용 가상 공지 한 건(고정 id `c8c8c8c8-0000-4000-8000-00000000c008`)의 insert는 Git에서 제외된 로컬 전용 파일 `supabase/byteback_vault_notices_seed.local.sql`에 있습니다. 두 파일 모두 **학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행했습니다.** 학생이 확인한 결과: 두 테이블 RLS true, `anon`·`authenticated` 권한 모두 false, `service_role` 권한 모두 true, 공지 1건, 강사 0명.
- **자기 점검** (`src/attack-check.mjs`, `step: 8`): 7단계 점검에 더해 로그인 없이 `GET /api/notices`와 `PUT /api/admin/notices/:id`(본문에 `role: instructor`를 넣음)를 실제로 보내 결과를 기록합니다. 학생 A 토큰으로 관리 경로 수정(403 기대), 메모·공지 id 교차 조회(404 기대)는 실제 계정 토큰이 필요해 「미실행」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. `npm run decider:test`(네 줄 통과), `npm run fixture:7`(`정상 사건: allow`, `복합 이상 사건: step_up`)을 실행합니다. 로컬 가상 연습이며 심판 판정이 아닙니다.
2. 배포 뒤 로그인 없이 `/api/notices`를 요청하면 401 JSON이어야 합니다.
3. 로그인한 A 토큰으로 `GET /api/notices`는 공지 목록, `PUT /api/admin/notices/:id`는 403 `NOT_INSTRUCTOR`, `/api/notices/:id`로 PUT은 405여야 합니다.
4. 엔진을 거친 구역 차단 시험은 이 PC에 제공 엔진이 연결돼 있지 않아 **미실행**입니다.

## 9단계: 도플갱어를 찾고 권한을 거둡니다 (저장점)

9단계 저장점 커밋은 `4e3e743`입니다. 현재 상태는 아래 "10단계"·"11단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`·`allowedRoutes`(세 경로 `GET /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`)는 8단계와 같고, 9단계 당시 빌드가 만든 `aleph.json`에는 `step: 9`·세 경로·`originalApiUrl`이 들어갔습니다. 이번 단계는 탐지 함수(`src/detect.mjs`)와 자기 점검만 바꿨습니다.

- **탐지 입력** (`src/detect.mjs`, `readEvents`): `docs/DETECT_EVENTS.md`의 가상 사건에서 `at`·`method`·`identity.sub`(가명 사용자)만 읽고, 사건에 `deviceId`·`decision`·`network`가 있으면 그것만 더 읽습니다(이 세 이름은 현재 계약에 없어 연습 사건에서는 비어 있음). 본문·토큰·이름은 읽지도 저장하지도 출력하지도 않습니다. `at`이 올바른 ISO 시각이 아니거나 `identity.sub`가 빈 값이면 그 사건만 버리고, `events`가 배열이 아니면 `TypeError`입니다.
- **탐지 규칙** (`burst_read`): 같은 `identity.sub`의 GET 사건이 어느 10분 구간에서든(밀어 가며, 첫·마지막 사건 차이 10분 미만) **120건을 넘으면**(121건부터) `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`, 아니면 `{ action: 'observe' }`입니다. 정확히 120건은 제안하지 않고, 사용자끼리 합치지 않으며, 순서가 섞여도 시각 순으로 셉니다. 사건에 네트워크 값이 있으면 `usual`이 아닌 사건만 세고, 없으면 다량 조회만으로 판단합니다. 지역 값은 쓰지 않습니다. 여러 사용자가 넘으면 가장 먼저 넘은 한 명만 돌려줍니다.
- **회수 제안의 대상**: 계약의 대상 칸은 `subject`(가명 사용자) 하나뿐이라 결과에 `deviceId` 같은 이름을 덧붙이지 않습니다. 회수 API는 만들지 않았고 기기 권한도 바꾸지 않습니다. 판정기(`src/decider.mjs`) 응답 형식, API, DB, 화면은 8단계와 같습니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 9`): 8단계 점검(키 없이 원본 직접 조회, 로그인 없이 `/api/notes`·`/api/notices`·관리 경로)을 그대로 실제로 보냅니다. 다량 조회 회수 집행 점검은 「미실행, 엔진 연결 필요」로 남기며, 자기 점검이 배포 주소로 다량 조회를 보내지는 않습니다. 학생의 자기 점검이며 심판 판정이 아닙니다.
- **실제 회수와 경과 시간은 심판이 확인하며, 이 PC에서는 미실행입니다.** 운영 반 엔진이 검증한 사건을 `detect()`에 전달하고 회수 제안을 집행하는 경로는 이 저장소에서 연결·시험하지 않았습니다.

### 확인 순서

1. `npm run detect:test`: 여섯 줄(정상 조회 30건, 10분 안에 120건, 10분 안에 121건, 폭주 조회 200건, 서로 다른 사용자 각 100건, 10분 밖으로 흩어진 조회 200건)이 모두 `통과`여야 합니다.
2. `npm run decider:test`(네 줄 통과)와 `npm run fixture:7`(`정상 사건: allow`, `복합 이상 사건: step_up`)이 8단계와 같아야 합니다.

세 명령 모두 로컬 가상 연습이며 실제 접속 회수나 심판 판정이 아닙니다.

## 10단계: 백업에서 자료실을 되살립니다 (저장점)

10단계 저장점 커밋은 `3bad2e6`이고, 기록 커밋 `ac76ec2`(복구 재확인 표에 배포 확인 결과 반영)와 보완 커밋 `65ba7fe`(복구 응답에 소유자·내용 해시 포함)가 뒤따릅니다. 현재 상태는 아래 "11단계" 절을 보세요. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`·`allowedRoutes`(세 경로 `GET /api/notes/:id`, `GET /api/notices`, `GET /api/notices/:id`)는 9단계와 같고, 이번 단계에서 `restoreRoute`에 `POST /api/notes/:id/restore`를 적었습니다. 10단계 당시 빌드가 만든 `aleph.json`에는 `step: 10`·세 경로·`originalApiUrl`·`restoreRoute`가 들어갔습니다.

### 정책 사본과 되돌리기

- **안전 정책 사본** `policy/verified-policy.json`: 9단계 저장점 커밋 `4e3e743`을 침해 전에 검증한 상태로 삼아, 판정기 `RULE_IDS`·판정기 파일 지문(SHA-256)과 `aleph.config.json`의 `allowedRoutes`·`originalApiUrl`·`identityProvider`를 담았습니다(버전 `safe-policy-step9-4e3e743`, 비밀값 없음). 사본 파일 전체의 지문은 `policy/verified-policy.sha256`에 따로 있습니다. 지문은 줄바꿈을 LF로 맞춘 내용의 SHA-256입니다.
- `npm run policy:diff`(읽기 전용): 사본 지문을 검증하고, 파일이 없거나 지문이 다르면 비교하지 않고 멈춥니다. 검증되면 복원할 버전과 현재 값과 다른 항목만, 같으면 「차이 없음」을 보여 줍니다.
- `npm run policy:restore`: 기본은 미리보기(바뀔 항목만 표시)이고, `-- --apply`를 붙였을 때만 사본에 있는 항목을 되돌립니다. 판정기는 기준 커밋 파일을 git에서 꺼내 지문이 사본과 같을 때만 덮어쓰고, config는 사본에 있는 칸만 바꿉니다(`step`·`judgeIssuer`·`restoreRoute` 등은 그대로). 사본 검증 실패·기준 커밋 없음·지문 불일치면 아무것도 바꾸지 않고 멈춥니다. 되돌릴 때마다 `policy/restore-log.jsonl`에 시각·버전·바뀐 항목 이름만 한 줄 덧붙입니다. 이 파일의 첫 줄(`2026-10-14T02:10:59.001Z`, `decider.ruleIds`·`decider.sha256`)은 **제작 2에서 시험으로 한 번 되돌린 기록**입니다(판정기 `RULE_IDS`에서 규칙 하나를 일부러 지운 뒤 되돌림). 지우지 않고 감사 이력으로 남깁니다.
- 두 명령은 빌드·배포에서 자동으로 돌지 않으며 DB·Vercel 설정을 건드리지 않습니다.

### 메모 한 건 복구 (서비스 `notes`)

- **복구 경로**: `POST /api/notes/:id/restore`(`api/notes/[id]/restore.js`). `aleph.config.json`의 `restoreRoute`에 적었고, 빌드가 만드는 `aleph.json`에도 `restoreRoute`가 들어갑니다(`scripts/deployment-identity.mjs`, 형식이 틀리면 빌드 실패). 심판은 배포된 `/aleph.json`에서 이 값을 읽습니다. `allowedRoutes`와 판정기는 바꾸지 않았습니다.
- **파일 구조**: `:id`와 같은 깊이에 기능 경로를 두지 않으려고 한 칸 더 깊게 두었습니다. 기존 `api/notes/[id].js`를 `api/notes/[id]/index.js`로 옮겨(주소 `/api/notes/:id`는 같음) 같은 폴더에 `restore.js`를 두었습니다.
- **사본·감사 테이블** (`supabase/byteback_vault_notes_step10_backup.sql`): `byteback_vault_note_backups`(note_id 기본키, owner_id, title, content, content_sha256, backed_up_at)와 `byteback_vault_audit`(id, at, actor_id, action, note_id, before_sha256, after_sha256). 감사 기록에는 메모 본문이 없습니다. 두 테이블 모두 RLS를 켜고 `PUBLIC`·`anon`·`authenticated` 권한을 회수했으며, `service_role`에도 SELECT·INSERT만 주어 사본과 감사 기록은 덧붙이기만 됩니다. 기존 메모는 메모 테이블에서 select로 사본에 옮깁니다(본문은 SQL 파일에 없음). 기존 테이블의 구조와 권한은 바꾸지 않습니다. **학생이 검토한 뒤 SQL Editor에서 직접 실행했습니다.** 학생이 확인한 결과: 두 테이블 RLS true, `anon`·`authenticated`의 사본 읽기 false, `anon`의 감사 읽기 false, `service_role`의 사본 수정 false, 메모 5건과 사본 5건, 감사 기록 `backup_import` 5줄.
- **메모 API 변경** (`src/notes-api.mjs`): POST(추가)가 성공하면 사본에 저장하고 감사에 `create`를 남깁니다. 사본이 이미 있는 ID(지워진 메모 포함)로는 새 메모를 만들 수 없습니다(409). PUT·DELETE는 사본을 바꾸지 않고 감사에 `update`·`delete`와 전후 지문만 남깁니다.
- **복구 순서**: 로그인 토큰 검사(`src/verify-login.mjs`, 실패 401) → 사본 조회(없으면 404) → 사본 `owner_id` = 검증된 사용자(다르면 404) → 사본 본문 SHA-256 재계산 = `content_sha256`(다르면 409, 아무것도 바꾸지 않음) → 메모 테이블의 그 ID 한 건만 사본의 `owner_id`·`title`·`content`로 되돌림(삭제됐으면 다시 넣고, 변조됐으면 덮어씀. 같은 ID에 다른 소유자의 메모가 있으면 409) → 감사에 `restore`. 응답은 쓰기 뒤 DB에서 다시 읽은 행으로 만들며, 그 행의 id·`owner_id`·본문 해시가 사본과 셋 다 같을 때만 200 `{id,title,body,ownerId,owner_id,contentSha256,content_sha256}`(소유자 sub와 본문 SHA-256을 두 이름으로)이고, 하나라도 다르면 500 `RESTORE_CHECK_FAILED`입니다(10단계 보완: 심판이 복구 응답만으로 대조할 수 있게 함). 요청 본문·쿼리·헤더의 `owner_id`·`role`·내용은 읽지 않습니다.
- **한계**: 사본은 메모를 처음 만들 때 저장되며, 이후 수정은 사본에 반영되지 않습니다. 그래서 복구하면 처음 만든 내용으로 돌아갑니다. `content_sha256`은 본문만의 지문이라 사본의 제목·소유자가 바뀐 것은 지문으로 잡지 못합니다(사본 테이블은 `service_role`에도 UPDATE 권한이 없음).
- 시험은 공개 가능한 가상 메모와 시험 계정 B의 메모로만 합니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 10`): 9단계 점검에 더해 로그인 없이 `POST /api/notes/:id/restore`(B 시험 메모, 본문에 `owner_id`를 넣음)를 실제로 보내 결과를 기록합니다. B의 복구, A가 B 메모 복구 시험은 실제 계정 토큰이 필요해 「미실행」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 확인 순서

1. `npm run policy:diff`: 「차이 없음」.
2. `npm run decider:test`(네 줄 통과), `npm run detect:test`(여섯 줄 통과), `npm run fixture:7`(`정상 사건: allow`, `복합 이상 사건: step_up`). 로컬 가상 연습이며 심판 판정이 아닙니다.
3. SQL 실행과 배포 뒤 로그인 없이 `POST /api/notes/<id>/restore`는 401 JSON이어야 합니다. B로 로그인해 B 메모를 고치거나 지운 뒤 복구하면 처음 만든 내용으로 돌아와야 하고, A 토큰으로 같은 복구를 요청하면 404여야 합니다.
4. 심판의 복구 시험은 이 PC에서 **미실행**입니다.

### 복구 뒤 1~9단계 재확인 순서

복구(정책 되돌리기나 메모 복구)를 한 뒤 아래 순서대로 다시 확인합니다. **결과 칸은 실제로 실행한 것만 적었습니다.** 2026-10-14 02:24 UTC에 실행했고, 그때 배포는 9단계 커밋 `4e3e743`이었습니다(10단계 변경은 아직 배포 전). 25·27번 줄은 10단계 배포(`3bad2e6`) 뒤 다시 확인한 결과입니다. 로그인 토큰이나 반 엔진이 필요한 확인은 「미실행」입니다. npm 연습 명령은 로컬 가상 연습이며 심판 판정이 아닙니다. 요청의 `<배포 주소>`는 `https://choi-bujang-secret-vault-2-gray.vercel.app`입니다.

| 순서 | 단계 | 구분 | 확인 방법 | 기대 결과 | 결과 |
|---|---|---|---|---|---|
| 0 | 10 | 정책 | `npm run policy:diff` | 사본 검증됨, 「차이 없음」(차이가 있으면 `npm run policy:restore` 미리보기 → `-- --apply`) | 검증됨 · 차이 없음 |
| 1 | 1 | 정상 | `GET <배포 주소>/` | 200, 자료실 화면 | 200 |
| 2 | 1 | 금지 | `GET <배포 주소>/aleph.json` | 메모 칸·비밀값·이메일 없음 | 메모 칸 없음 · 비밀값·이메일 패턴 없음 |
| 3 | 2 | 정상 | 화면에서 A로 로그인 | 자기 메모 목록 표시 | 미실행 |
| 4 | 2 | 금지 | `GET <배포 주소>/data.json` | 404, 메모 없음 | 404 |
| 5 | 3 | 정상 | A 토큰으로 `GET /api/notes` | 200, 자기 메모 배열 | 미실행 |
| 6 | 3 | 금지 | 로그인 없이 `GET /api/notes` | 401 `LOGIN_REQUIRED` | 401 `LOGIN_REQUIRED` |
| 7 | 3 | 금지 | 로그인 없이 `POST /api/notes` | 401 `LOGIN_REQUIRED` | 401 `LOGIN_REQUIRED` |
| 8 | 4 | 정상 | A 토큰으로 `GET /api/notes/<A 메모 id>` | 200 `{id,title,body}` | 미실행 |
| 9 | 4 | 금지 | A 토큰으로 B 메모 `GET`·`PUT`·`DELETE /api/notes/<B 메모 id>` | 모두 404 `NOTE_NOT_FOUND` | 미실행 |
| 10 | 4 | 금지 | 로그인 없이 `GET /api/notes/b4b4b4b4-0000-4000-8000-00000000b004` | 401 `LOGIN_REQUIRED` | 401 `LOGIN_REQUIRED` |
| 11 | 5 | 정상 | A로 로그인해 화면에서 메모 추가·수정·삭제 | 서버 함수로 처리됨 | 미실행 |
| 12 | 5 | 금지 | 키 없이 `GET https://yldhutxatzstfanadlsg.supabase.co/rest/v1/byteback_vault_notes` | 401, 메모 없음 | 401 (Supabase 오류 JSON, 메모 없음) |
| 13 | 5 | 금지 | A 로그인 토큰과 공개 키로 같은 원본 주소 직접 조회 | 거부(권한 없음) | 미실행 |
| 14 | 6 | 정상·금지 | `npm run decider:test` | 4줄 통과(등록 기기 allow, 미등록 기기 deny·`device_not_registered` 포함) | 4줄 통과 |
| 15 | 6 | 금지 | 엔진을 거친 미등록 기기 접속 | deny | 미실행 (심판 확인) |
| 16 | 7 | 정상·금지 | `npm run fixture:7` | `정상 사건: allow`, `복합 이상 사건: step_up` | allow / step_up |
| 17 | 7 | 금지 | 엔진을 거친 평소와 다른 접속(재인증 전) | 자료 없이 step_up | 미실행 (엔진 연결 필요) |
| 18 | 8 | 정상 | A 토큰으로 `GET /api/notices` | 200, 공지 목록 | 미실행 |
| 19 | 8 | 금지 | `PUT /api/notices/c8c8c8c8-0000-4000-8000-00000000c008` (공지 쓰기) | 405 `METHOD_NOT_ALLOWED` | 405 `METHOD_NOT_ALLOWED` |
| 20 | 8 | 금지 | 로그인 없이 `PUT /api/admin/notices/<공지 id>` (본문에 `role: instructor`) | 401 `LOGIN_REQUIRED` | 401 `LOGIN_REQUIRED` |
| 21 | 8 | 금지 | A 토큰으로 `PUT /api/admin/notices/<공지 id>` | 403 `NOT_INSTRUCTOR` | 미실행 |
| 22 | 8 | 금지 | 로그인 없이 `GET /api/notices` | 401 `LOGIN_REQUIRED` | 401 `LOGIN_REQUIRED` |
| 23 | 9 | 정상·금지 | `npm run detect:test` | 6줄 통과(120건 observe, 121건 `burst_read` 포함) | 6줄 통과 |
| 24 | 9 | 금지 | 엔진을 거친 다량 조회 회수 집행 | 회수됨 | 미실행 (엔진 연결 필요, 심판 확인) |
| 25 | 10 | 정상 | B 토큰으로 B 메모를 고친 뒤 `POST /api/notes/<B 메모 id>/restore` | 200, 처음 만든 내용 | 학생이 배포(`3bad2e6`)에서 B 토큰으로 직접 확인: 추가 201 → 변조 200 → 복구 200(원래 제목·내용) → 삭제 200 → 삭제 뒤 조회 404 → 복구 200(원래 제목·내용) → 복구 뒤 조회 200(원래 내용). 보완(`65ba7fe`) 뒤 학생이 다시 확인: 변조 후 복구 응답에 `ownerId`·`contentSha256`이 나오고 해시가 원래 본문의 sha256과 같음, 10단계 심판 판정 100점 |
| 26 | 10 | 금지 | A 토큰으로 `POST /api/notes/<B 메모 id>/restore` | 404 `BACKUP_NOT_FOUND` | 미실행 |
| 27 | 10 | 금지 | 로그인 없이 `POST /api/notes/b4b4b4b4-0000-4000-8000-00000000b004/restore` | 401 JSON | 401 `LOGIN_REQUIRED` (2026-10-14 02:35 UTC, 배포 `3bad2e6`에서 다시 실행. 02:24에는 배포 `4e3e743`에 복구 경로가 없어 404였음) |

## 11단계: 나만의 접속 앱을 완성합니다 (저장점)

현재 단계는 `aleph.config.json`의 `step: 11`입니다. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`·`allowedRoutes`(세 경로)·`restoreRoute`는 10단계와 같습니다. 11단계 커밋: `6a29589`(요청 헤더 이름 기록), `c1260ef`(점검 단계에 11 추가), `31749a4`(제작 1: 설치형 웹앱 설정과 승인 상태 표시), `5965952`(기기 표 SQL), `4080a23`(기기 승인 경로와 서명 확인), `8edf4db`(보호 경로에 서명 검사), `7118c04`(제작 2: 기기 승인 화면과 서명 요청), `61b8fe1`(기기 경로를 함수 하나로 합침), `8fb466c`(Vercel이 덧붙인 경로 쿼리를 서명 경로에서 제외).

### 만든 것

- **설치형 웹앱 설정**: `public/manifest.webmanifest`(이름·아이콘 192/512·standalone, `vercel.json`이 `application/manifest+json`으로 응답), `public/icons/`(Node 내장 기능으로 만든 PNG), 오프라인 안내(브라우저가 오프라인이면 「오프라인입니다. 자료는 서버 연결과 기기 승인 뒤에만 볼 수 있습니다.」). 서비스 워커·캐시는 없습니다.
- **기기 승인 상태 표시**: 서버 응답으로만 「확인 전 → 승인 대기 → 서버가 승인 확인」으로 바뀝니다. 설치나 독립 창 여부로는 바꾸지 않습니다.
- **기기 표 SQL** `supabase/byteback_vault_devices_step11.sql`: `byteback_vault_devices`(사용자별 기기·공개 키만·상태 pending/approved/revoked·요청/승인 시각, `(owner_id, device_id)` unique, 개인 키 칸이 있는 JWK는 저장 거부)와 `byteback_vault_device_nonces`(1회용 번호). 두 표 모두 RLS, `PUBLIC`·`anon`·`authenticated` 권한 회수, `service_role`은 기기 표 SELECT·INSERT·UPDATE, 번호 표 SELECT·INSERT·DELETE만. 학생이 SQL Editor에서 실행·확인했습니다.
- **기기 승인 경로** `api/devices/[action].js`(로직 `src/devices-api.mjs`): 아래 표.
- **보호 경로 서명 검사**: `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`, `POST /api/notes/:id/restore`, `GET /api/notices`, `GET /api/notices/:id`, `PUT /api/admin/notices/:id`는 로그인 확인(없으면 기존 401 `LOGIN_REQUIRED`) 뒤 `requireApprovedDevice`로 기기 서명을 확인합니다. 서명 오류는 아래 401 코드, 다른 사용자의 기기는 403 `DEVICE_NOT_REGISTERED`, 승인되지 않은 기기는 403 `DEVICE_NOT_APPROVED`이며 학생·심판 토큰 모두 같습니다. 통과해야만 기존 처리(소유자 검사·404·409·복구 응답·강사 검사·감사·사본)가 그대로 실행됩니다. 로그인·로그아웃·토큰 갱신과 `/api/devices/*`에는 붙이지 않았습니다.
- **기기 승인 화면** (`public/auth.js`, `public/device-sign.js`, `public/index.html`): 로그인(또는 새로 고침 뒤 세션 복구) → 꺼낼 수 없는 ECDSA P-256 키를 자바스크립트 변수에만 생성 → `POST /api/devices/request` → `GET /api/devices/status`. `approved: true`가 아니면 기기 승인 화면(기기 ID·서버 상태·비밀번호 입력란·승인 요청 버튼)만 보이고 자료실 영역은 비어 있고 숨겨집니다. 승인 요청 뒤에도 status를 다시 물어 서버가 `approved: true`라고 답할 때만 자료실을 열고 그때 처음 메모를 불러옵니다. 보호 요청이 기기 이유로 거부되거나 로그아웃하면 메모를 지우고 숨기며, 로그아웃하면 키도 버립니다. 키·토큰·자료는 localStorage·sessionStorage·IndexedDB·쿠키·서비스 워커·캐시에 넣지 않습니다.
- **요청 기록**: 관찰을 위해 모든 서버 함수가 Vercel 로그에 `[req11]` 한 줄(메서드·쿼리 뺀 경로·헤더 이름·user-agent 앞 120자·signature-input 앞 200자)을 남기고(`src/request-log.mjs`), 기기 서명이 틀린 요청만 `[sig11]` 한 줄(메서드·요청 주소 원문·서명에 쓴 경로)을 남깁니다. 본문·토큰·쿠키·서명 값·쿼리 값(`[req11]`)은 남기지 않습니다.

### 기기 서명 규칙 (`src/device-auth.mjs`, 브라우저는 `public/device-sign.js`)

브라우저는 꺼낼 수 없는(non-extractable) ECDSA P-256 개인 키를 메모리에만 두고, 요청마다 아래 헤더를 보냅니다.

| 헤더 | 값 |
|---|---|
| `x-aleph-device-id` | 공개 키 RFC 7638 지문의 sha256 16진수 앞 16자리. 지문 입력은 `{"crv":"P-256","kty":"EC","x":"…","y":"…"}`(이름 순서, 공백 없음) |
| `x-aleph-timestamp` | 서명 시각(밀리초). 서버 시각과 60초 넘게 차이 나면 거부 |
| `x-aleph-nonce` | 요청마다 새 1회용 번호(영문·숫자·`-`·`_` 1~128자). 같은 기기에서 다시 쓰면 거부 |
| `x-aleph-signature` | 서명 문자열의 WebCrypto ECDSA SHA-256 서명(IEEE P1363, 64바이트), base64url |

서명 문자열은 `aleph-device-v1`, 메서드(대문자), 경로(쿼리 포함, 브라우저가 fetch에 넣는 문자열 그대로), timestamp, nonce, deviceId, 본문 해시의 7줄을 `\n`으로 이은 것입니다(마지막 줄바꿈 없음). 본문 해시는 본문을 키 이름 순서로 정렬한 JSON(canonical JSON, 배열 순서는 그대로)의 sha256 소문자 16진수이고, 본문이 없으면 빈 문자열의 sha256입니다. 브라우저는 canonical JSON 문자열을 `Content-Type: application/json`으로 그대로 보냅니다. 공개 키는 `kty`·`crv`·`x`·`y` 네 칸만 보냅니다(`exportKey`가 붙이는 `ext`·`key_ops`는 뺌).

서버는 서명 경로를 `request.url`에서 만들되, Vercel이 대괄호 경로(`[action]`·`[id]`)를 부를 때 덧붙이는 쿼리만 뺍니다: 이름이 그 칸(`action`·`id`)이고 디코딩한 값이 경로의 그 칸과 정확히 같은 항목(`signedPath`). 그 밖의 쿼리는 그대로 남으므로 쿼리를 덧붙이거나 경로를 바꾼 요청은 401입니다.

서버 확인 순서: 헤더 없음 401 `DEVICE_SIGNATURE_REQUIRED` → 로그인 사용자의 그 기기 없음 403 `DEVICE_NOT_REGISTERED` → 시각 401 `DEVICE_SIGNATURE_EXPIRED` → 서명 401 `DEVICE_SIGNATURE_INVALID` → 1회용 번호 재사용 401 `DEVICE_NONCE_REUSED`.

### 기기 승인 경로 (`api/devices/[action].js`)

| 경로 | 조건 | 응답 |
|---|---|---|
| `POST /api/devices/request` 본문 `{deviceId, publicKeyJwk}` | 로그인. 공개 키는 네 칸만(그 밖이면 400 `INVALID_PUBLIC_KEY`), deviceId는 서버가 지문으로 다시 계산해 같아야 함(400 `DEVICE_ID_MISMATCH`), 그 키로 한 서명 필요 | 새 기기 201 `{deviceId, status: "pending"}`, 이미 있으면 상태를 바꾸지 않고 200 지금 상태 |
| `GET /api/devices/status` | 로그인 + 서명 | `{deviceId, status, approved}`(approved는 status가 approved일 때만 true) |
| `POST /api/devices/approve` 본문 `{password}` | 로그인 + 서명. 심판 토큰 403 `APPROVAL_REQUIRES_PASSWORD`. 서버가 Supabase에서 확인한 본인 이메일로 비밀번호 재확인, 틀리면 401 `PASSWORD_INVALID`. 회수된 기기 403 `DEVICE_REVOKED` | 그 사용자의 그 기기만 approved·`approved_at` 기록, `{deviceId, status, approved: true}` |

`action`이 request·status·approve가 아니면 404 `NOT_FOUND`, 정해진 메서드 외에는 405입니다. 다른 사용자의 기기는 보이지도 바뀌지도 않습니다(403 `DEVICE_NOT_REGISTERED`). 비밀번호는 저장·기록·응답하지 않고, 확인용 세션은 그 세션만 바로 끝냅니다. 승인 경로는 Vercel 환경변수 `SUPABASE_PUBLISHABLE_KEY`도 씁니다.

### 배포 확인 결과 (학생이 직접 확인, 커밋 `8fb466c`, 계정 B, 시크릿 창)

| 확인 | 결과 |
|---|---|
| 로그인 직후 | `POST /api/devices/request` 201 → `GET /api/devices/status` 200, 기기 승인 화면, 상태 「승인 대기」, `/api/notes` 요청 없음 |
| 틀린 비밀번호로 승인 | `/api/devices/approve` 401, 「승인 실패: 비밀번호가 맞지 않습니다」, 자료실 닫힘 |
| 올바른 비밀번호로 승인 | approve 200 → status 200 → notes 200, 상태 「서버가 승인 확인」, 기존 메모 목록 열림 |
| 승인 뒤 메모 | 추가 201, 수정 200, 삭제 200 (서명된 요청, 401 없음) |
| 새로 고침 | 새 기기 ID로 다시 승인 화면, `/api/notes` 요청 없음 |
| 개발자 도구 Application | Local storage 비어 있음, Service worker 없음 |
| Supabase `byteback_vault_devices` | 승인한 기기 approved와 `approved_at` 기록, 새로 고침으로 생긴 기기 pending |

11단계 심판 판정은 100점입니다(학생이 전함). 엔진을 거친 판정 과정은 이 PC에서 **미실행**이며 심판이 확인했습니다.

### 막혔던 점

1. **Vercel Hobby 서버 함수 12개 제한**: `4080a23`에서 `api/devices/`에 함수 3개를 더해 14개가 되자 `4080a23`~`7118c04` 배포가 「No more than 12 Serverless Functions」로 실패했고, `/aleph.json`이 `5965952`에 멈췄습니다. 기기 경로 세 개를 `api/devices/[action].js` 하나로 합쳐 12개로 맞췄습니다(`61b8fe1`). `api/`에 파일을 더 추가하면 다시 이 제한에 걸립니다.
2. **Vercel이 대괄호 경로 값을 쿼리로 덧붙임**: 합친 뒤 `POST /api/devices/request`가 401 `DEVICE_SIGNATURE_INVALID`였습니다. `request.url`에 `?action=request`처럼 경로 값이 붙어 브라우저가 서명한 경로와 달라졌기 때문으로 보고, 서명 경로에서 그 값만 빼도록 고쳤습니다(`8fb466c`). 고친 뒤 배포에서 등록·상태·승인과 메모 경로가 서명 오류 없이 동작했습니다. 같은 일이 `[id]` 경로에도 해당합니다.

### 시험

- `npm run test:device`: `test/device-sign.test.mjs`(브라우저·서버 서명 규칙 일치, 브라우저 서명을 서버가 통과, 서명 경로에서 덧붙은 쿼리만 빼기)와 `test/device-routes.test.mjs`(기기 승인 경로, 보호 경로 9개의 로그인 없음 401·서명 없음 401·pending 403·승인 서명 시 기존 결과, 서명 뒤 경로·본문 변경 401, 다른 사용자 기기 403, 소유자 검사 404, 심판 토큰, Vercel 쿼리), `test/device-screen.test.mjs`(가짜 DOM·가짜 fetch로 `public/auth.js`를 실행: 승인 전 메모 요청 0회, 서버가 approved라고 답한 뒤에만 자료실이 열림, 틀린 비밀번호·pending이면 닫힘, 기기 거부 시 메모를 지우고 승인 화면, 로그아웃하면 키를 버림, 저장소·쿠키·캐시 미사용). 13개 모두 통과했습니다. Supabase·로그인은 가짜로 바꾸고 키·서명은 실제 WebCrypto로 만드는 로컬 모의 시험이며 실제 브라우저·배포·심판 판정이 아닙니다.
- **자기 점검** (`src/attack-check.mjs`, `step: 11`): 10단계 점검에 더해 로그인 없이 `GET /api/devices/status`를 실제로 보내 결과를 기록합니다. 승인되지 않은 기기의 보호 요청, 승인된 기기의 서명 요청은 실제 계정 토큰과 브라우저 기기 키가 필요해 「미실행」으로 남깁니다. 학생의 자기 점검이며 심판 판정이 아닙니다.

### 알려진 한계

- 기기 키를 메모리에만 두므로 새로 고침·다시 로그인할 때마다 새 기기로 등록되고 비밀번호로 다시 승인해야 하며, DB에 pending 기기 행이 쌓입니다.
- 승인 경로에는 비밀번호 시도 횟수 제한이 없습니다(서명과 1회용 번호가 필요하지만, 등록한 기기로는 계속 시도할 수 있음).
- `[req11]` 요청 기록은 관찰용이며 아직 켜져 있습니다.

## 12단계: 탈환 작전실을 완성합니다 (저장점, 진행 중)

현재 단계는 `aleph.config.json`의 `step: 12`입니다. 저장소·배포 주소·`identityProvider`·`originalApiUrl`·`judgeIssuer`·`allowedRoutes`(세 경로)·`restoreRoute`는 11단계와 같습니다. 11단계 저장점 커밋은 `d9a70a0`입니다. 12단계 심판 판정은 지금까지 최고 53점이며 아직 진행 중입니다.

### 만든 것

- **시험 목록 한 곳** (`src/ops-catalog.mjs`, 브라우저 사본 `public/ops-catalog.js`): 1~11단계 정상·금지 요청 27개. 저장소에 근거가 있는 항목만 넣었고(README 재확인 표, 각 단계 자기 점검, 8·11단계 기록) 개수를 늘려 채우지 않았습니다. 앞의 18개가 제출 묶음 step 12 점검이고, 나머지 9개는 작전실 전용(로그인 + 승인된 기기 서명 GET 5개, 홈 화면 1개, 쓰기 3개)입니다. 각 항목에 단계·정상/금지·기대 결과·기대 상태 코드·보낼 요청(GET·HEAD만) 또는 보내지 않는 이유가 있습니다. 브라우저 사본과 서버 목록이 같은지는 `test/ops-room.test.mjs`가 확인합니다.
- **기록표 명령** `npm run ops:record` (`scripts/ops-record.mjs`, `src/ops-records.mjs`): 기본은 `artifacts/submission.json`(`npm run bundle` 결과)의 attackId·observed를 그대로 표로 옮기며 새 요청을 보내지 않습니다(`-- --live`는 같은 점검을 새로 실행). 결과는 `artifacts/ops-records.json`·`.md`(Git 제외)이고 칸은 attackId·단계·정상/금지·기대 결과·실제 API 결과(상태·오류 코드)·요청 ID·확인 시각·실행 여부입니다. 실제로 보낸 요청의 결과만 적고, 보내지 않았거나 `not_run`인 항목은 「미실행」으로 결과 칸을 비웁니다. 쓰기 전에 비밀값 패턴을 검사합니다.
- **탈환 작전실 화면** (`public/ops-room.js`, `public/index.html`, `public/auth.js`): 승인된 기기로 자료실이 열린 뒤에만 보입니다. 요약은 빌드가 저장소 파일에서 만든 `/ops-summary.json`(`scripts/ops-summary.mjs`, Git 제외)을 그대로 보여 줍니다: 판정기 규칙 수(`RULE_IDS` 16개), 탐지 규칙(`burst_read`, 120건 초과), 복구 버전(`safe-policy-step9-4e3e743`, 되돌린 기록 줄 수, 복구 경로). 「작전실 점검 실행」을 누르면 같은 시험 목록으로 그 자리에서 GET·HEAD 요청을 보내고(로그인이 필요한 항목은 같은 기기 키로 서명) 받은 응답만 표에 그립니다. 회수 상태는 실제 `/api/devices/status` 응답에서만 읽고, 엔진의 회수 집행은 「미확인」으로 둡니다. 응답 본문은 error 값·내 메모 id·기기 상태만 읽고 메모 본문은 표시하지 않습니다. 자료실이 닫히면 표를 비웁니다.
- **작전실 수치**: 「행 · 실행 · 미실행 · 기대 상태와 같음 · 다름」은 모두 **행을 센 값**입니다. 비율·점수를 계산하지 않고, **미실행을 성공으로 세지 않습니다.**
- **서버의 요청 ID** (`src/request-log.mjs`): 모든 api 응답에 `X-Request-Id` 헤더를 넣습니다(요청에 UUID 형식의 `x-request-id`가 있으면 그 값, 아니면 새 UUID). 응답마다 Vercel 로그에 `[res12]` 한 줄(메서드·쿼리 뺀 경로·상태·error·requestId·attackId·토큰 iss로만 나눈 기록용 로그인 분류·심판 신원 a/b·기기 서명 헤더 유무)을 남깁니다. 이 분류는 권한 판단에 쓰지 않으며 토큰·sub·서명·헤더 값·본문·쿼리 값·쿠키는 남기지 않습니다. 작전실과 bundle의 각 요청은 같은 requestId가 `[res12]`에 남도록 설계했습니다.

### 제출 묶음 점검을 격리 환경 규칙에 맞춘 과정

심판은 격리 환경에서 `npm run bundle`을 실행합니다. 그 환경 규칙에 맞추어 step 12 점검(`runStepTwelveChecks`)을 다음처럼 바꿨습니다.

1. **GET·HEAD만** (`6b59771`): 11단계 점검 사슬을 다시 쓰던 step 12가 로그인 없는 `PUT /api/admin/notices/:id`·`POST /api/notes/:id/restore` 쓰기 요청을 보냈습니다. step 12 전용 점검을 만들어 공개 HTTPS 주소에 GET·HEAD만 보내고, 쓰기·로그인·기기 서명·엔진이 필요한 점검은 요청 없이 `observed: "not_run"`으로 바꿨습니다.
2. **허용 모듈만**: 제출 묶음이 불러오는 파일은 `node:fs`·`node:path`·`node:url`·`node:child_process`·`node:crypto`만 import합니다(프로젝트 안의 `src/ops-catalog.mjs`는 import가 없는 데이터). 가짜 토큰도 Buffer·전역 crypto 없이 만듭니다.
3. **sha256 hex만** (`108c0cf`): `createHash('sha256').digest('base64url')`가 격리 환경에서 `hash_encoding_unsupported`로 멈춰, 문자열 입력과 `digest('hex')`만 쓰게 했습니다.
4. **not_run**: fetch가 예외를 던지면(요청이 나가지 못했거나 응답을 못 받으면) 결과를 적지 않고 `not_run`입니다.
5. **요청 ID** (`168228c`·`148d343`·`0805e63`): 요청마다 `randomUUID()` 요청 ID를 `X-Request-Id`에, attackId를 `X-Aleph-Attack-Id`에 넣고, observed를 `requestId → responseIds → method → status → error → checkedAt → url` 순서로 적습니다. 응답의 요청·추적 ID(우리 requestId와 같은 값은 뺌)를 함께 적고, 300자를 넘으면 뒤를 자르지 않고 x-vercel-id → error → responseIds 순서로 빼서 주소는 끝까지 남깁니다.

이 규칙은 `npm run test:bundle`(가짜 fetch·가짜 node:crypto)로 확인합니다.

### 막혔던 점

1. **S12_BUNDLE_UNSUPPORTED**: 제출 묶음이 GET·HEAD가 아닌 요청을 보냄 → step 12 전용 읽기 점검으로 해결(`6b59771`).
2. **hash_encoding_unsupported**: 격리 환경의 sha256이 hex만 지원 → `digest('hex')`로 해결(`108c0cf`).
3. **「실행 기록 대조」 조건은 아직 풀리지 않았습니다.** 심판 메시지는 「그 attackId로 보낸 요청 기록이 없습니다」였습니다. 요청 ID 헤더, 응답 ID, 주소가 잘리지 않는 observed까지 넣었지만(`168228c`~`0805e63`), 심판이 무엇을 기준으로 요청 기록과 attackId를 잇는지는 **확인하지 못했습니다.** Vercel 로그에서 심판 환경의 점검 요청과 우리가 붙인 헤더가 서버에 도착한 것은 학생이 확인했습니다. 원인은 미확인으로 둡니다.
4. **S12_SCREEN_MISMATCH**(작전실 수치와 서버 기록이 다름): 작전실과 기록표를 이번에 새로 만들었으며, 이 조건이 풀렸는지는 아직 심판 판정을 받지 않아 **미확인**입니다.

### 확인 순서

1. `npm run bundle` → `npm run ops:record`: 기록표의 실행 행 요청 ID가 `artifacts/submission.json`의 observed와 같은지 봅니다.
2. 배포에서 로그인 → 기기 승인 → 자료실 아래 「탈환 작전실」 → 「작전실 점검 실행」. 표의 요청 ID 몇 개를 Vercel Logs의 `[res12]`에서 찾아 같은 requestId·attackId·status인지 봅니다.
3. 로컬 시험(심판 판정 아님): `npm run test:ops`, `npm run test:bundle`.

## 출처

검사한 커밋은 `a845c6b`(12단계 제작 1: 탈환 작전실 화면)입니다. 이 절을 고친 12단계 저장점 커밋은 README만 바꿉니다. 「시작 틀 + 학생 수정」은 시작 틀 첫 커밋 `e95d08b` 이후 git log에 학생 커밋이 있는 파일입니다.

### 제공받은 것

| 이름 | 출처 | 내용 |
|---|---|---|
| ALEPH SDP 엔진 | 운영 측 제공(이 저장소에 코드 없음) | 신원·기기·경로를 확인한 뒤 학생 판정기 `decide(request)`에 요청을 전달하고, 탐지의 회수 제안을 집행하는 반 엔진입니다. 학생은 엔진을 실행·수정하지 않습니다. |
| 심판 | 운영 측 제공(`aleph.config.json`의 `judgeIssuer`) | 배포 주소와 공개 저장소를 시험해 단계 판정을 냅니다. 심판 토큰은 `src/verify-login.mjs`가 확인합니다. |
| 시작 틀 그대로 | 시작 틀 저장소 `ChoiTimo/aleph-defense-starter`(첫 커밋 `e95d08b`) | `src/verify-login.mjs`, `scripts/bundle.mjs`, `scripts/decider-test.mjs`, `scripts/detect-test.mjs`, `scripts/fixture-7.mjs`, `scripts/xdr-run.mjs`, `docs/DECIDER_REQUEST.md`, `docs/DETECT_EVENTS.md`, `AGENTS.md`, `package/`(ARCHITECTURE·DEMO·POLICIES·README·SELF-CHECK·THREAT-INTEL·baseline-functions), `test/package-starter.test.mjs`, `test/r5.test.mjs`, `test/xdr-run.test.mjs`, `xdr/`, `package-lock.json` |
| 시작 틀 + 학생 수정 | 시작 틀 파일을 학생이 고침 | `scripts/deployment-identity.mjs`(허용 경로·원본 주소·복구 경로 기록), `scripts/build-public.mjs`, `aleph.config.json`, `package.json`, `vercel.json`, `.gitignore`, `public/index.html`, `api/ai.js`·`api/threat-intel.js`(요청 기록 감싸기만, 응답은 시작 틀 그대로), `README.md` |
| 시작 틀에서 지운 것 | 시작 틀 파일을 학생이 지움 | `data.json`, `public/data.json`(2단계, 공개 메모 제거) |

### 학생이 만든 것

| 부분 | 파일 | 출처 |
|---|---|---|
| 판정기 | `src/decider.mjs`(기기 등록·구역·이상 신호 step_up 규칙, `RULE_IDS` 16개) | 시작 틀 뼈대(모두 거부) + 학생 구현 |
| 탐지 규칙 | `src/detect.mjs`(입력 정리, `burst_read`) | 시작 틀 뼈대(observe만) + 학생 구현 |
| 접속 앱 | `public/manifest.webmanifest`, `public/icons/`, `public/auth.js`(기기 승인 화면·서명 요청), `public/device-sign.js`, `api/devices/[action].js`, `src/device-auth.mjs`, `src/devices-api.mjs`, `supabase/byteback_vault_devices_step11.sql` | 학생 |
| 자료실 | `api/notes/index.js`, `api/notes/[id]/index.js`, `api/notes/[id]/restore.js`, `api/notices/index.js`, `api/notices/[id].js`, `api/admin/notices/[id].js`, `api/auth/login.js`·`logout.js`·`refresh.js`, `src/notes-api.mjs`, `src/notices-api.mjs`, `src/auth-api.mjs`, `src/request-log.mjs`, `supabase/`의 SQL 7개 | 학생 |
| 정책 사본·되돌리기 | `policy/verified-policy.json`·`.sha256`·`restore-log.jsonl`, `scripts/policy-diff.mjs`, `scripts/policy-restore.mjs` | 학생 |
| 점검 스크립트 | `src/attack-check.mjs` | 시작 틀 뼈대 + 학생 구현 |
| 탈환 작전실·기록표 | `src/ops-catalog.mjs`, `public/ops-catalog.js`(사본), `src/ops-records.mjs`, `scripts/ops-record.mjs`, `scripts/ops-summary.mjs`, `public/ops-room.js`, `src/request-log.mjs`(요청 기록·X-Request-Id) | 학생 |
| 시험 | `test/device-sign.test.mjs`, `test/device-routes.test.mjs`, `test/device-screen.test.mjs`, `test/bundle-step12.test.mjs`, `test/ops-records.test.mjs`, `test/ops-room.test.mjs` | 학생 |

비밀값은 저장소에 포장하지 않습니다. 서버 전용 키·공개 키 값은 Vercel 환경변수에만 있고, 메모·계정 정보가 든 `supabase/*.local.sql`, `bundle-notes.json`, `artifacts/`, `.env`는 Git에서 제외됩니다.

## 설치·실행·중지·복구 안내 (검사한 커밋 `a845c6b`)

공통 준비: Node.js 22 이상, `npm ci`. Vercel 환경변수 이름은 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`(서버 전용), `SUPABASE_PUBLISHABLE_KEY`이며 값은 Vercel **Settings → Environment Variables**에 직접 넣습니다(이 문서·Git에는 없음). Supabase SQL Editor 실행 순서(파일 이름만, `.local.sql`은 Git에 없는 로컬 전용):

1. `supabase/byteback_vault_notes.sql` → (로컬) `supabase/byteback_vault_notes.seed.local.sql`
2. `supabase/byteback_vault_notes_step3.sql`
3. `supabase/byteback_vault_notes_step4_rls.sql` → (로컬) `supabase/byteback_vault_notes_step4.local.sql`
4. `supabase/byteback_vault_notes_step5_revoke.sql`
5. `supabase/byteback_vault_notices_step8.sql` → (로컬) `supabase/byteback_vault_notices_seed.local.sql`
6. `supabase/byteback_vault_notes_step10_backup.sql`
7. `supabase/byteback_vault_devices_step11.sql`

### 판정기 (`src/decider.mjs`)

| 순서 | 방법 |
|---|---|
| 설치 | `npm ci`. 판정기는 ALEPH SDP 엔진이 `decide(request)`로 부르는 함수라 따로 띄우는 프로세스가 없습니다. |
| 실행 | 로컬 연습: `npm run decider:test`, `npm run fixture:7`. 실제 판정은 ALEPH SDP 엔진이 실행합니다. |
| 중지 | 로컬 연습 명령은 끝나면 스스로 종료합니다. 엔진 쪽 중지는 운영 측 몫이며 학생이 할 수 없습니다. |
| 복구 | `npm run policy:diff`로 안전 정책 사본(`safe-policy-step9-4e3e743`)과 비교 → 차이가 있으면 `npm run policy:restore`(미리보기) → `npm run policy:restore -- --apply`. 기준 커밋 판정기 파일 지문이 사본과 같을 때만 되돌리고 `policy/restore-log.jsonl`에 기록합니다. |

### 탐지 규칙 (`src/detect.mjs`)

| 순서 | 방법 |
|---|---|
| 설치 | `npm ci`. 탐지 함수도 ALEPH SDP 엔진이 검증한 사건을 넘겨 부르는 함수입니다. |
| 실행 | 로컬 연습: `npm run detect:test`. 실제 회수 제안 집행은 ALEPH SDP 엔진이 합니다. |
| 중지 | 로컬 연습 명령은 끝나면 종료합니다. 엔진 쪽 중지는 운영 측 몫입니다. |
| 복구 | `git diff a845c6b -- src/detect.mjs`로 바뀐 점을 확인한 뒤 `git checkout a845c6b -- src/detect.mjs`로 검사한 커밋의 파일을 되돌립니다(다른 파일은 그대로). |

### 접속 앱 (설치형 웹앱·기기 승인·서명)

| 순서 | 방법 |
|---|---|
| 설치 | 위 SQL 7번 실행 → 환경변수 세 개 → GitHub `main`에 push하면 Vercel이 `npm run build`로 배포. 서버 함수는 12개(Vercel Hobby 한도)라 `api/`에 파일을 더하지 않습니다. 브라우저에서는 배포 주소를 열고 필요하면 「앱 설치」를 합니다(설치는 기기 확인이 아님). |
| 실행 | 배포 주소에서 로그인 → 기기 승인 화면 → 계정 비밀번호 재입력 → 서버가 `approved`라고 답하면 자료실이 열립니다. 로컬 시험: `npm run test:device`. |
| 중지 | 화면에서 로그아웃(메모리의 기기 키를 버림). 특정 기기의 권한을 거두려면 Supabase에서 그 기기 행의 `status`를 `revoked`로 바꿉니다(회수된 기기는 다시 승인되지 않음). 배포 전체를 멈추려면 Vercel에서 이전 배포로 되돌립니다. |
| 복구 | Vercel **Deployments**에서 검사한 커밋 `a845c6b`(또는 그 뒤 README만 바뀐 커밋)의 배포를 Promote하고 `/aleph.json`의 commit을 확인합니다. 새로 고침·재로그인 뒤에는 새 기기로 다시 승인합니다(키를 저장하지 않기 때문). |

### 자료실 (메모·공지·복구 API)

| 순서 | 방법 |
|---|---|
| 설치 | 위 SQL 1~6번을 순서대로 실행 → 환경변수 세 개 → GitHub `main`에 push(Vercel 자동 배포). |
| 실행 | 배포 주소에서 로그인하고 기기를 승인하면 메모 목록·추가·수정·삭제, 공지 읽기를 씁니다. 자기 점검: `npm run bundle`(공개 주소에 GET·HEAD만 보냄) → 기록표 `npm run ops:record`. 승인된 자료실 아래 「탈환 작전실」에서 점검 실행. |
| 중지 | Vercel에서 이전 배포로 되돌리거나 프로젝트를 멈춥니다. Supabase 프로젝트가 일시정지되면 서버 함수의 자료 요청이 실패합니다(5단계 때 실제로 겪음). |
| 복구 | 메모 한 건: `POST /api/notes/:id/restore`(로그인 + 승인된 기기 서명 필요. 화면에 복구 버튼은 없음)가 사본에서 처음 만든 내용으로 되돌립니다. 정책: 위 판정기 복구 순서. 일시정지된 Supabase는 대시보드에서 다시 켭니다. |

### 확인 결과

**로컬 시험 결과(심판 판정 아님)**, 커밋 `a845c6b`에서 실행: `npm run test:ops` 9/9, `npm run test:bundle` 7/7, `npm run test:device` 13/13, `npm run test:r5` 2/2, `npm run test:package` 3/3, `npm run decider:test` 4줄, `npm run detect:test` 6줄, `npm run fixture:7`(정상 allow·복합 이상 step_up), `npm run policy:diff` 「차이 없음」. 화면의 성공 문구나 로컬 시험은 통과 근거가 아닙니다.

**심판 판정(실제로 받은 단계 점수만, 학생이 전함)**: 1~5단계 각 100점(2차 침공 500/500), 6·7·8·9·10·11단계 각 100점, 12단계는 지금까지 최고 53점(진행 중).

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 1단계에서는 자리표시자였고, 2단계 저장점에서 실제 저장소·배포 주소로 바꿨습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`은 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 빌드만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `aleph.config.json`의 `step`에 맞는 점검 요청을 보냅니다. 1단계는 `/data.json`의 공개 메모 확인 표시, 2단계는 `/data.json`과 비로그인 `/api/notes`, 3단계는 비로그인·가짜 토큰 요청의 거부 여부, 4단계는 비로그인·가짜 토큰으로 남의 메모를 요청했을 때의 거부 여부를 기록하고 A/B 교차 점검은 미실행으로 남깁니다. 5단계는 키 없이 원본 자료 주소를 직접 조회했을 때와 비로그인 `/api/notes`의 거부 여부를 기록하고, 로그인이 필요한 점검은 미실행으로 남깁니다. 6단계는 5단계 점검을 다시 보내고, 미등록 기기 접속 점검은 심판 몫이라 미실행으로 남깁니다. 7단계는 6단계 점검을 다시 보내고, 재인증 전 차단 점검은 엔진 연결이 필요해 미실행으로 남깁니다. 8단계는 7단계 점검에 더해 로그인 없이 공지 목록과 강사 관리 경로를 요청한 결과를 기록하고, 로그인이 필요한 교차 점검은 미실행으로 남깁니다. 9단계는 8단계 점검을 다시 보내고, 회수 집행 점검은 엔진 연결이 필요해 미실행으로 남깁니다. 10단계는 9단계 점검에 더해 로그인 없이 복구 경로를 요청한 결과를 기록하고, 로그인이 필요한 복구 시험은 미실행으로 남깁니다. 11단계는 10단계 점검에 더해 로그인 없이 기기 상태 경로를 요청한 결과를 기록하고, 로그인과 기기 서명이 필요한 점검은 미실행으로 남깁니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
