-- BYTE BACK 10단계: 비공개 가상 메모 사본과 감사 기록 테이블을 만듭니다.
--   public.byteback_vault_note_backups : 메모를 처음 만들 때의 사본 (복구는 여기서만 내용을 가져옴)
--   public.byteback_vault_audit        : 감사 기록 (메모 본문 없음, 전후 SHA-256 지문만)
-- 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
--
-- 대상은 위 두 테이블뿐입니다. 기존 테이블(byteback_vault_notes, byteback_vault_notices,
-- byteback_vault_instructors)의 구조와 권한은 바꾸지 않습니다. 메모 테이블은 [1-c]에서 select로 읽기만 합니다.
-- 같은 이름의 테이블이 이미 있으면 create table이 실패하고 전체가 되돌려지므로 기존 자료를 덮어쓰지 않습니다.
--
-- 두 테이블 모두 RLS를 켜고 정책은 만들지 않으며, PUBLIC·anon·authenticated 권한을 회수합니다.
-- 서버 함수만 서버 전용 키(service_role)로 씁니다. 사본과 감사 기록은 덧붙이기만 하도록
-- service_role에도 SELECT·INSERT만 줍니다(UPDATE·DELETE 없음). 그래서 서버 키로도 기존 사본·감사 줄을 고치거나 지울 수 없습니다.
--
-- content_sha256은 content를 UTF-8로 바꾼 바이트의 SHA-256(소문자 16진수)이며, 서버 함수(Node)의 계산과 같습니다.
-- 이 파일에는 키·비밀번호·계정 이메일·메모 본문이 없습니다. 기존 메모의 사본은 [1-c]에서 메모 테이블을 select해 옮깁니다.
--
-- SQL Editor는 마지막 결과표만 보여 주므로 차례로 따로 실행하세요.
--   [1] 적용 (begin~commit 한 번에)  →  [2] 적용 후 확인 (쿼리 하나씩)


-- =====================================================================
-- [1] 적용
-- =====================================================================

begin;

-- [1-a] 사본 테이블
create table public.byteback_vault_note_backups (
  note_id uuid primary key,
  owner_id uuid,
  title text not null,
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  backed_up_at timestamptz not null default now()
);

-- [1-b] 감사 기록 테이블 (본문 없음)
create table public.byteback_vault_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'backup_import')),
  note_id uuid not null,
  before_sha256 text check (before_sha256 is null or before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text check (after_sha256 is null or after_sha256 ~ '^[0-9a-f]{64}$')
);

alter table public.byteback_vault_note_backups enable row level security;
alter table public.byteback_vault_audit enable row level security;

revoke all on table public.byteback_vault_note_backups from public, anon, authenticated, service_role;
revoke all on table public.byteback_vault_audit from public, anon, authenticated, service_role;

grant select, insert on table public.byteback_vault_note_backups to service_role;
grant select, insert on table public.byteback_vault_audit to service_role;

-- [1-c] 지금 메모 테이블의 행을 사본으로 옮깁니다(본문은 이 파일에 적지 않고 select로 옮김).
insert into public.byteback_vault_note_backups (note_id, owner_id, title, content, content_sha256)
select n.id, n.owner_id, n.title, n.content, encode(sha256(convert_to(n.content, 'UTF8')), 'hex')
  from public.byteback_vault_notes as n;

-- 옮긴 사실만 감사 기록에 남깁니다(행위자 없음, 지문만).
insert into public.byteback_vault_audit (actor_id, action, note_id, before_sha256, after_sha256)
select null, 'backup_import', b.note_id, null, b.content_sha256
  from public.byteback_vault_note_backups as b;

commit;


-- =====================================================================
-- [2] 적용 후 확인 (읽기만 함)
-- =====================================================================

-- 2-a) RLS: 두 줄 모두 true
select relname, relrowsecurity
  from pg_class
 where oid in ('public.byteback_vault_note_backups'::regclass, 'public.byteback_vault_audit'::regclass);

-- 2-b) 역할별 권한: anon·authenticated는 모두 false, service_role은 SELECT·INSERT true, UPDATE·DELETE false
select t.tbl, r.role, p.privilege, has_table_privilege(r.role, t.tbl, p.privilege) as allowed
  from (values ('public.byteback_vault_note_backups'), ('public.byteback_vault_audit')) as t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
 order by t.tbl, r.role, p.privilege;

-- 2-c) 사본 수 = 메모 수, 지문이 모두 맞는지: 두 숫자가 같고 mismatched = 0
select (select count(*) from public.byteback_vault_notes) as notes,
       (select count(*) from public.byteback_vault_note_backups) as backups,
       (select count(*) from public.byteback_vault_note_backups
         where content_sha256 <> encode(sha256(convert_to(content, 'UTF8')), 'hex')) as mismatched;

-- 2-d) 감사 기록: backup_import 줄 수 = 사본 수
select action, count(*) from public.byteback_vault_audit group by action;
