-- ===== Tài khoản (tên + số điện thoại + PIN) và hộp thư gửi bài =====
create table if not exists public.users (
  phone text primary key,
  name text not null,
  pin_hash text not null,
  code text not null,                 -- mã gia đình dùng để đồng bộ dữ liệu của tài khoản
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null references public.users(phone) on delete cascade,
  from_phone text not null, from_name text not null,
  title text not null, payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists inbox_to on public.inbox (to_phone);
alter table public.users enable row level security;
alter table public.inbox enable row level security;
revoke all on public.users, public.inbox from anon, authenticated;

create or replace function public.nnn_phone(p text) returns text language sql immutable as $$
  select case when d like '84%' and length(d) = 11 then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create or replace function public.nnn_user_register(phone text, name text, pin text, code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := nnn_phone(phone); c text;
begin
  if length(ph) < 9 or length(ph) > 11 then return jsonb_build_object('error', 'phone'); end if;
  if coalesce(pin, '') !~ '^[0-9]{4,6}$' then return jsonb_build_object('error', 'pin'); end if;
  if length(trim(coalesce(name, ''))) < 1 then return jsonb_build_object('error', 'name'); end if;
  if exists (select 1 from users u where u.phone = ph) then return jsonb_build_object('error', 'exists'); end if;
  c := case when length(coalesce(code, '')) >= 16 then code else upper(encode(extensions.gen_random_bytes(10), 'hex')) end;
  insert into users (phone, name, pin_hash, code, last_login)
  values (ph, left(trim(name), 60), extensions.crypt(pin, extensions.gen_salt('bf')), c, now());
  return jsonb_build_object('name', left(trim(name), 60), 'phone', ph, 'code', c);
end $$;

create or replace function public.nnn_user_login(phone text, pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := nnn_phone(phone); u users%rowtype;
begin
  select * into u from users where users.phone = ph;
  if not found then return jsonb_build_object('error', 'nouser'); end if;
  if u.locked_until is not null and u.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  if extensions.crypt(coalesce(pin, ''), u.pin_hash) <> u.pin_hash then
    update users set fails = fails + 1, locked_until = case when fails + 1 >= 8 then now() + interval '15 minutes' else null end where users.phone = ph;
    return jsonb_build_object('error', 'pin');
  end if;
  update users set fails = 0, locked_until = null, last_login = now() where users.phone = ph;
  return jsonb_build_object('name', u.name, 'phone', u.phone, 'code', u.code);
end $$;

-- Gửi bài: người gửi xác thực bằng mã của tài khoản
create or replace function public.nnn_share_send(code text, to_phone text, title text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s users%rowtype; tp text := nnn_phone(to_phone);
begin
  if length(coalesce(code, '')) < 16 then return jsonb_build_object('error', 'login'); end if;
  select * into s from users where users.code = nnn_share_send.code limit 1;
  if not found then return jsonb_build_object('error', 'login'); end if;
  if not exists (select 1 from users where phone = tp) then return jsonb_build_object('error', 'nouser'); end if;
  if length(payload::text) > 100000 then return jsonb_build_object('error', 'large'); end if;
  if (select count(*) from inbox where from_phone = s.phone and created_at > now() - interval '1 hour') >= 30 then return jsonb_build_object('error', 'rate'); end if;
  insert into inbox (to_phone, from_phone, from_name, title, payload) values (tp, s.phone, s.name, left(coalesce(title, ''), 200), payload);
  return jsonb_build_object('ok', true, 'to', (select name from users where phone = tp));
end $$;

create or replace function public.nnn_share_inbox(code text) returns table (id uuid, from_name text, title text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select i.id, i.from_name, i.title, i.created_at from inbox i join users u on u.phone = i.to_phone
  where u.code = nnn_share_inbox.code and length(nnn_share_inbox.code) >= 16 order by i.created_at desc limit 50
$$;

create or replace function public.nnn_share_take(code text, sid uuid, keep boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select i.payload into r from inbox i join users u on u.phone = i.to_phone where i.id = sid and u.code = nnn_share_take.code and length(nnn_share_take.code) >= 16;
  if r is not null then delete from inbox where id = sid; end if;
  return case when keep then r else null end;
end $$;

grant execute on function public.nnn_user_register(text, text, text, text), public.nnn_user_login(text, text),
  public.nnn_share_send(text, text, text, jsonb), public.nnn_share_inbox(text), public.nnn_share_take(text, uuid, boolean) to anon;
