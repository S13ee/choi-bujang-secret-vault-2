-- BYTE BACK 2단계: 가상 메모를 담을 학습용 Supabase 테이블과 권한입니다.
-- 기존 Supabase 프로젝트의 SQL Editor에서 이미 한 번 실행했습니다.
-- 다른 테이블은 건드리지 않습니다. 같은 이름의 테이블이 이미 있으면
-- create table이 실패하고 전체가 되돌려지므로 기존 자료를 덮어쓰지 않습니다.
-- 이 파일에는 키·비밀번호·실제 개인정보가 없습니다. 메모는 모두 가상 자료입니다.

begin;

create table public.byteback_vault_notes (
  id uuid primary key default gen_random_uuid(),
  -- 3단계 이후 로그인 사용자와 연결할 칸입니다. auth.users 외래키는 일부러 걸지 않습니다.
  owner_id uuid,
  sample_marker text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- RLS를 켜고 정책은 만들지 않습니다. 정책이 없으면 anon·authenticated는 행을 볼 수 없습니다.
alter table public.byteback_vault_notes enable row level security;

-- 기본 권한으로 붙을 수 있는 공개 역할의 표 권한도 회수합니다.
revoke all on table public.byteback_vault_notes from anon, authenticated, public;

-- 서버 전용 역할만 읽고 씁니다. 서버 전용 키는 코드나 Git에 넣지 않습니다.
grant select, insert, update, delete on table public.byteback_vault_notes to service_role;

-- 메모 네 건의 insert는 Git에 올리지 않는 로컬 파일
-- supabase/byteback_vault_notes.seed.local.sql에 있습니다.

commit;

-- 실행 뒤 확인 (SQL Editor에서 따로 실행):
-- select count(*) from public.byteback_vault_notes;                       -- 4
-- select relrowsecurity from pg_class where oid = 'public.byteback_vault_notes'::regclass;  -- true
-- select has_table_privilege('anon', 'public.byteback_vault_notes', 'select');           -- false
-- select has_table_privilege('authenticated', 'public.byteback_vault_notes', 'select');  -- false
