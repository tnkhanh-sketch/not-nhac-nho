-- Nốt Nhạc Nhỏ – đồng bộ bằng "mã gia đình".
-- Bảng không mở cho ai đọc trực tiếp (RLS bật, không có policy);
-- mọi truy cập đi qua các hàm bên dưới, bắt buộc đưa đúng mã gia đình.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.records (
  family text not null,          -- sha256(mã gia đình)
  kind text not null,            -- songs | lines | events | recordings
  id uuid not null,
  updated_at bigint not null,
  data jsonb not null,
  seq bigint not null,
  primary key (family, kind, id)
);
create index if not exists records_family_seq on public.records (family, seq);

create table if not exists public.audio (
  family text not null,
  id uuid not null,
  data text not null,            -- base64
  primary key (family, id)
);

create sequence if not exists public.records_seq;

alter table public.records enable row level security;
alter table public.audio enable row level security;
revoke all on public.records, public.audio from anon, authenticated;

create or replace function public.nnn_family(code text) returns text
language sql immutable as $$ select encode(extensions.digest('nnn:' || code, 'sha256'), 'hex') $$;

-- Đẩy thay đổi lên: chỉ ghi khi bản mới hơn bản đang có.
create or replace function public.nnn_push(code text, items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f text := nnn_family(code); it jsonb; n int := 0;
begin
  if length(code) < 16 then raise exception 'bad code'; end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into records (family, kind, id, updated_at, data, seq)
    values (f, it->>'kind', (it->>'id')::uuid, (it->>'updatedAt')::bigint, it->'data', nextval('records_seq'))
    on conflict (family, kind, id) do update
      set updated_at = excluded.updated_at, data = excluded.data, seq = excluded.seq
      where records.updated_at < excluded.updated_at;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Lấy thay đổi về kể từ seq đã biết.
create or replace function public.nnn_pull(code text, since bigint) returns table (kind text, id uuid, updated_at bigint, data jsonb, seq bigint)
language sql security definer set search_path = public as $$
  select kind, id, updated_at, data, seq from records
  where family = nnn_family(code) and seq > since and length(code) >= 16
  order by seq limit 2000
$$;

create or replace function public.nnn_audio_put(code text, rid uuid, b64 text) returns void
language sql security definer set search_path = public as $$
  insert into audio (family, id, data) values (nnn_family(code), rid, b64)
  on conflict (family, id) do nothing
$$;

create or replace function public.nnn_audio_get(code text, rid uuid) returns text
language sql security definer set search_path = public as $$
  select data from audio where family = nnn_family(code) and id = rid
$$;

grant execute on function public.nnn_push(text, jsonb), public.nnn_pull(text, bigint),
  public.nnn_audio_put(text, uuid, text), public.nnn_audio_get(text, uuid) to anon;
