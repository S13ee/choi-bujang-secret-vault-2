-- BYTE BACK 5단계: 자료 요청을 서버 한곳으로 모읍니다.
-- public.byteback_vault_notes 에 대한 PUBLIC·anon·authenticated의 직접 권한을 모두 거둡니다.
-- 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
--
-- 대상은 public.byteback_vault_notes 하나뿐입니다. 다른 테이블·스키마·함수·정책은 건드리지 않습니다.
-- service_role 권한은 바꾸지 않습니다(REVOKE·GRANT 대상에 없음).
-- 메모 읽기·추가·수정·삭제는 서버 함수(/api/notes, /api/notes/:id)가 서버 전용 키(service_role)로만 하며,
-- 서버 함수의 로그인 검사(src/verify-login.mjs)와 소유자 검사(src/notes-api.mjs)는 그대로입니다.
--
-- RLS는 켠 채로 두고, 4단계 정책 네 개(*_own)도 지우지 않습니다. 권한이 없으면 정책이 있어도
-- authenticated는 표에 접근할 수 없으며, 실수로 권한이 다시 생겨도 자기 행으로 제한됩니다.
--
-- SQL Editor는 마지막 결과표만 보여 주므로 차례로 따로 실행하세요.
--   [1] 적용 전 확인  →  [2] 적용  →  [3] 적용 후 확인 ([1]과 같은 쿼리)
-- 이 파일에는 계정 이메일·메모 본문이 없습니다.


-- =====================================================================
-- [1] 적용 전 확인 (읽기만 함). 세 쿼리를 하나씩 실행해 결과를 기록해 두세요.
-- =====================================================================

-- 1-a) 부여된 표 권한 목록
select grantee, privilege_type, is_grantable
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'byteback_vault_notes'
   and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
 order by grantee, privilege_type;

-- 1-b) 역할별 실제 권한 (역할 상속까지 반영)
select r.role, p.privilege,
       has_table_privilege(r.role, 'public.byteback_vault_notes', p.privilege) as allowed
  from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
 order by r.role, p.privilege;

-- 1-c) 열 단위 권한 (표 권한을 거둬도 열 권한이 남으면 일부 열을 읽을 수 있으므로 함께 봅니다)
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'byteback_vault_notes'
   and grantee in ('PUBLIC', 'anon', 'authenticated')
 order by grantee, column_name, privilege_type;


-- =====================================================================
-- [2] 적용. begin부터 commit까지 한 번에 실행합니다. 다시 실행해도 결과가 같습니다.
-- =====================================================================

begin;

-- 표 권한 회수 (표 단위 REVOKE ALL은 같은 역할의 열 단위 권한도 함께 거둡니다)
revoke all on table public.byteback_vault_notes from public, anon, authenticated;

commit;


-- =====================================================================
-- [3] 적용 후 확인: [1]의 1-a, 1-b, 1-c를 다시 하나씩 실행합니다.
-- =====================================================================
-- 기대 결과
--   1-a) PUBLIC·anon·authenticated 줄 없음. service_role 줄은 [1]과 같음
--   1-b) anon·authenticated: 일곱 권한 모두 false
--        service_role: [1]과 같음 (SELECT·INSERT·UPDATE·DELETE true)
--   1-c) 결과 없음
-- [1]과 달라진 줄이 PUBLIC·anon·authenticated 외에 있으면 실행을 멈추고 내용을 먼저 확인하세요.
--
-- 직접 요청 확인 (터미널, 공개용 publishable key만 사용):
--   curl -i "https://yldhutxatzstfanadlsg.supabase.co/rest/v1/byteback_vault_notes" -H "apikey: <publishable key>"
--   → HTTP 401, code 42501 "permission denied for table byteback_vault_notes"
-- 로그인 사용자 토큰으로 같은 주소를 불러도 42501이어야 합니다(authenticated 권한 없음).
-- 서버 함수 확인: 배포 화면에서 A로 로그인해 메모 목록·추가·수정·삭제가 이전처럼 되어야 합니다.
