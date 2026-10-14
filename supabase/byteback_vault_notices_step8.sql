-- BYTE BACK 8단계: 강사 공지와 강사 목록을 메모와 다른 자원으로 나눕니다.
--   public.byteback_vault_notices     : 강사 공지 (자원 notices, /api/notices, /api/notices/:id)
--   public.byteback_vault_instructors : 강사 목록 (user_id). 처음에는 비워 둡니다.
-- 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
--
-- 대상은 위 두 테이블뿐입니다. 메모 테이블 public.byteback_vault_notes를 포함해
-- 다른 테이블·스키마·함수·정책은 건드리지 않습니다.
-- 같은 이름의 테이블이 이미 있으면 create table이 실패하고 전체가 되돌려지므로 기존 자료를 덮어쓰지 않습니다.
--
-- 두 테이블 모두 RLS를 켜고 정책은 만들지 않으며, PUBLIC·anon·authenticated 권한을 회수합니다.
-- 서버 함수만 서버 전용 키(service_role)로 읽습니다. 서버 전용 키는 코드나 Git에 넣지 않습니다.
-- 강사 권한은 요청·화면 값이 아니라 byteback_vault_instructors에 서버가 저장한 user_id로만 판단합니다.
--
-- 시험용 공지 한 건의 insert는 Git에 올리지 않는 로컬 파일
-- supabase/byteback_vault_notices_seed.local.sql에 있습니다(이 파일 실행 뒤 따로 실행).
-- 이 파일에는 키·비밀번호·계정 이메일·실제 개인정보·공지 본문이 없습니다.
--
-- SQL Editor는 마지막 결과표만 보여 주므로 차례로 따로 실행하세요.
--   [1] 적용 (begin~commit 한 번에)  →  [2] 적용 후 확인 (쿼리 하나씩)


-- =====================================================================
-- [1] 적용
-- =====================================================================

begin;

create table public.byteback_vault_notices (
  id uuid primary key default gen_random_uuid(),
  sample_marker text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- auth.users 외래키는 메모 테이블과 같이 일부러 걸지 않습니다.
create table public.byteback_vault_instructors (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.byteback_vault_notices enable row level security;
alter table public.byteback_vault_instructors enable row level security;

revoke all on table public.byteback_vault_notices from public, anon, authenticated;
revoke all on table public.byteback_vault_instructors from public, anon, authenticated;

grant select, insert, update, delete on table public.byteback_vault_notices to service_role;
grant select, insert, update, delete on table public.byteback_vault_instructors to service_role;

commit;


-- =====================================================================
-- [2] 적용 후 확인 (읽기만 함)
-- =====================================================================

-- 2-a) RLS: 두 줄 모두 true
select relname, relrowsecurity
  from pg_class
 where oid in ('public.byteback_vault_notices'::regclass, 'public.byteback_vault_instructors'::regclass);

-- 2-b) 역할별 실제 권한: anon·authenticated는 모두 false, service_role은 모두 true
select t.tbl, r.role, p.privilege, has_table_privilege(r.role, t.tbl, p.privilege) as allowed
  from (values ('public.byteback_vault_notices'), ('public.byteback_vault_instructors')) as t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
 order by t.tbl, r.role, p.privilege;

-- 2-c) 강사 목록은 비어 있어야 합니다: 0
select count(*) from public.byteback_vault_instructors;

-- 2-d) 메모 테이블은 그대로여야 합니다: 실행 전과 같은 행 수
select count(*) from public.byteback_vault_notes;
