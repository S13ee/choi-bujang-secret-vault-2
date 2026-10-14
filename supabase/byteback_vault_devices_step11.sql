-- BYTE BACK 11단계: 서버가 기기 승인 여부를 기록할 표 두 개를 만듭니다.
--   public.byteback_vault_devices       : 사용자별 기기 등록·승인 상태 (공개 키만 저장)
--   public.byteback_vault_device_nonces : 기기 서명에 쓴 1회용 번호(재사용 막기)
-- 학생이 검토한 뒤 Supabase SQL Editor에서 직접 실행합니다.
--
-- 대상은 위 두 표뿐입니다. 기존 표(byteback_vault_notes, byteback_vault_note_backups, byteback_vault_audit,
-- byteback_vault_notices, byteback_vault_instructors)는 건드리지 않습니다.
-- 여러 번 실행해도 오류가 나지 않도록 create table if not exists를 쓰고, 권한 문장은 같은 결과를 다시 만듭니다.
-- 단, 같은 이름의 표가 이미 있으면 if not exists 때문에 구조(칸·check)는 바뀌지 않습니다.
--
-- 두 표 모두 RLS를 켜고 정책은 만들지 않으며, PUBLIC·anon·authenticated 권한을 모두 회수합니다.
-- service_role에는 기기 표에 SELECT·INSERT·UPDATE만, 1회용 번호 표에 SELECT·INSERT·DELETE만 줍니다.
-- 이 파일에는 개인 키·비밀번호·계정 이메일·실제 계정 ID가 없습니다. public_key_jwk에는 공개 키만 넣으며,
-- 개인 키 칸(d·p·q·dp·dq·qi)이나 대칭 키 칸(k)이 들어 있으면 저장되지 않게 check를 겁니다.
--
-- SQL Editor는 마지막 결과표만 보여 주므로 차례로 따로 실행하세요.
--   [1] 적용 (begin~commit 한 번에)  →  [2] 적용 후 확인 (쿼리 하나씩)


-- =====================================================================
-- [1] 적용
-- =====================================================================

begin;

-- [1-a] 기기 표
create table if not exists public.byteback_vault_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  device_id text not null check (device_id ~ '^[0-9a-f]{16}$'),
  public_key_jwk jsonb not null check (
    jsonb_typeof(public_key_jwk) = 'object'
    and not (public_key_jwk ?| array['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'])
  ),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz null,
  constraint byteback_vault_devices_owner_device_key unique (owner_id, device_id)
);

-- [1-b] 1회용 번호 표
create table if not exists public.byteback_vault_device_nonces (
  device_id text not null check (device_id ~ '^[0-9a-f]{16}$'),
  nonce text not null check (length(nonce) between 1 and 128),
  used_at timestamptz not null default now(),
  primary key (device_id, nonce)
);

alter table public.byteback_vault_devices enable row level security;
alter table public.byteback_vault_device_nonces enable row level security;

-- 먼저 모든 역할의 권한을 거둔 뒤 service_role에 필요한 권한만 다시 줍니다(다시 실행해도 결과가 같음).
revoke all on table public.byteback_vault_devices from public, anon, authenticated, service_role;
revoke all on table public.byteback_vault_device_nonces from public, anon, authenticated, service_role;

grant select, insert, update on table public.byteback_vault_devices to service_role;
grant select, insert, delete on table public.byteback_vault_device_nonces to service_role;

commit;


-- =====================================================================
-- [2] 적용 후 확인 (읽기만 함)
-- =====================================================================

-- 2-a) RLS: 두 줄 모두 true
select relname, relrowsecurity
  from pg_class
 where oid in ('public.byteback_vault_devices'::regclass, 'public.byteback_vault_device_nonces'::regclass);

-- 2-b) 역할별 권한
--   anon·authenticated: 모두 false
--   service_role: devices는 SELECT·INSERT·UPDATE true, DELETE false
--                 device_nonces는 SELECT·INSERT·DELETE true, UPDATE false
select t.tbl, r.role, p.privilege, has_table_privilege(r.role, t.tbl, p.privilege) as allowed
  from (values ('public.byteback_vault_devices'), ('public.byteback_vault_device_nonces')) as t(tbl)
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
 order by t.tbl, r.role, p.privilege;

-- 2-c) 칸과 기본값: 기기 표 7칸, 1회용 번호 표 3칸
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('byteback_vault_devices', 'byteback_vault_device_nonces')
 order by table_name, ordinal_position;

-- 2-d) 제약: 기본키·unique(owner_id, device_id)·check가 보여야 합니다
select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid in ('public.byteback_vault_devices'::regclass, 'public.byteback_vault_device_nonces'::regclass)
 order by tbl, conname;

-- 2-e) 처음에는 두 표 모두 비어 있어야 합니다: 0, 0
select (select count(*) from public.byteback_vault_devices) as devices,
       (select count(*) from public.byteback_vault_device_nonces) as nonces;
