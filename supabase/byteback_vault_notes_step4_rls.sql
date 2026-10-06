-- BYTE BACK 4단계: public.byteback_vault_notes 의 RLS와 최소 권한.
-- 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
--
-- 대상은 public.byteback_vault_notes 하나뿐입니다. 다른 테이블·스키마·함수는 건드리지 않습니다.
-- service_role 권한은 바꾸지 않습니다(REVOKE·GRANT 대상에 없음). 서버 함수는 계속 service_role로 접근하며,
-- service_role은 RLS를 우회하므로 API의 소유자 검사(src/notes-api.mjs)는 그대로 필요합니다.
--
-- SQL Editor는 마지막 결과표만 보여 주므로 세 부분을 차례로 따로 실행하세요.
--   [1] 적용 전 확인  →  [2] 적용  →  [3] 적용 후 확인 ([1]과 같은 쿼리)
-- 이 파일에는 계정 이메일·메모 본문이 없습니다.


-- =====================================================================
-- [1] 적용 전 확인 (읽기만 함). 아래 세 쿼리를 하나씩 실행해 결과를 기록해 두세요.
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

-- 1-c) RLS 상태와 정책 목록
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c where c.oid = 'public.byteback_vault_notes'::regclass;
select policyname, cmd, roles, permissive, qual as using_expr, with_check as with_check_expr
  from pg_policies
 where schemaname = 'public' and tablename = 'byteback_vault_notes'
 order by policyname;


-- =====================================================================
-- [2] 적용. begin부터 commit까지 한 번에 실행합니다. 다시 실행해도 결과가 같습니다.
-- =====================================================================

begin;

-- RLS는 2단계에서 이미 켰습니다. 꺼져 있더라도 다시 켭니다.
alter table public.byteback_vault_notes enable row level security;

-- 기존 권한 회수 (service_role은 대상이 아님)
revoke all on table public.byteback_vault_notes from public, anon, authenticated;

-- 로그인 사용자에게 필요한 네 가지 권한만 부여 (TRUNCATE·REFERENCES·TRIGGER 없음, anon은 없음)
grant select, insert, update, delete on table public.byteback_vault_notes to authenticated;

-- 이 파일이 만드는 정책만 이름으로 지우고 다시 만듭니다 (다른 정책은 건드리지 않음).
drop policy if exists byteback_vault_notes_select_own on public.byteback_vault_notes;
drop policy if exists byteback_vault_notes_insert_own on public.byteback_vault_notes;
drop policy if exists byteback_vault_notes_update_own on public.byteback_vault_notes;
drop policy if exists byteback_vault_notes_delete_own on public.byteback_vault_notes;

-- SELECT: 기존 행이 본인 것일 때만 보임
create policy byteback_vault_notes_select_own on public.byteback_vault_notes
  for select to authenticated
  using (auth.uid() = owner_id);

-- INSERT: 새 행의 owner_id가 본인일 때만 들어감
create policy byteback_vault_notes_insert_own on public.byteback_vault_notes
  for insert to authenticated
  with check (auth.uid() = owner_id);

-- UPDATE: 기존 행도 본인 것이고(USING), 바뀐 새 행도 본인 것이어야 함(WITH CHECK)
create policy byteback_vault_notes_update_own on public.byteback_vault_notes
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- DELETE: 기존 행이 본인 것일 때만 지워짐
create policy byteback_vault_notes_delete_own on public.byteback_vault_notes
  for delete to authenticated
  using (auth.uid() = owner_id);

commit;


-- =====================================================================
-- [3] 적용 후 확인: [1]의 1-a, 1-b, 1-c 쿼리를 다시 하나씩 실행합니다.
-- =====================================================================
-- 기대 결과
--   1-a) anon, PUBLIC 줄 없음
--        authenticated: DELETE, INSERT, SELECT, UPDATE 네 줄만
--        service_role: [1]에서 본 것과 같음 (이 SQL은 바꾸지 않음)
--   1-b) anon: 일곱 권한 모두 false
--        authenticated: SELECT·INSERT·UPDATE·DELETE true, TRUNCATE·REFERENCES·TRIGGER false
--        service_role: [1]과 같음 (2단계 SQL로 SELECT·INSERT·UPDATE·DELETE true)
--   1-c) rls_enabled = true
--        정책 네 개: *_select_own(SELECT, USING), *_insert_own(INSERT, WITH CHECK),
--        *_update_own(UPDATE, USING + WITH CHECK), *_delete_own(DELETE, USING)
--        모두 roles = {authenticated}, 식은 (auth.uid() = owner_id)
--        이 네 개 말고 다른 정책이 보이면, PERMISSIVE 정책은 OR로 합쳐지므로 내용을 먼저 확인하세요.
