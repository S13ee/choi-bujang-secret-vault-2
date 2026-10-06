-- BYTE BACK 3단계: 기존 가상 메모 네 건의 owner_id를 A 계정으로 채웁니다.
-- 목록 GET이 로그인 사용자의 메모(owner_id = 사용자 ID)만 돌려주므로,
-- 이 SQL을 실행하지 않으면 A로 로그인해도 기존 네 건이 목록에 보이지 않습니다.
-- public.byteback_vault_notes만 건드립니다. 열 구조는 바꾸지 않습니다.
--
-- 실행 전: 아래 '여기에_A_계정_UUID'를 Supabase 대시보드
-- Authentication → Users에서 A 계정의 User UID로 바꾸세요.
-- 바꾸지 않고 실행하면 UUID 형식 오류로 멈추고 아무것도 바뀌지 않습니다.
-- owner_id가 비어 있는 행만 바꾸므로, 두 번 실행해도 이미 채운 행은 그대로입니다.

begin;

do $$
declare
  a_owner uuid := '여기에_A_계정_UUID';
begin
  update public.byteback_vault_notes set owner_id = a_owner where owner_id is null;
end $$;

-- 목록 GET의 owner_id 조회용 색인입니다.
create index if not exists byteback_vault_notes_owner_id_idx
  on public.byteback_vault_notes (owner_id);

commit;

-- 실행 뒤 확인 (SQL Editor에서 따로 실행):
-- select owner_id, count(*) from public.byteback_vault_notes group by owner_id;  -- A의 UUID 한 줄, 4
