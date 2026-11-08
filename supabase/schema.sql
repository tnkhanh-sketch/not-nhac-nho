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
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 500 then raise exception 'too many items'; end if;
  for it in select * from jsonb_array_elements(items) loop
    if (it->>'kind') not in ('songs', 'lines', 'events', 'recordings') then raise exception 'bad kind'; end if;
    if length((it->'data')::text) > 65536 then raise exception 'item too large'; end if;
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
language plpgsql security definer set search_path = public as $$
begin
  if length(code) < 16 then raise exception 'bad code'; end if;
  if length(b64) > 8000000 then raise exception 'audio too large'; end if;
  insert into audio (family, id, data) values (nnn_family(code), rid, b64)
  on conflict (family, id) do nothing;
end $$;

create or replace function public.nnn_audio_get(code text, rid uuid) returns text
language sql security definer set search_path = public as $$
  select data from audio where family = nnn_family(code) and id = rid and length(code) >= 16
$$;

grant execute on function public.nnn_push(text, jsonb), public.nnn_pull(text, bigint),
  public.nnn_audio_put(text, uuid, text), public.nnn_audio_get(text, uuid) to anon;

-- ===== Chợ bài hát: bài đã chia câu xong, ai cũng xem và lấy về học được =====
create table if not exists public.market (
  id uuid primary key,
  owner text not null,              -- sha256(khoá người đăng)
  title text not null, artist text not null default '',
  video_id text not null, beat_video_id text, beat_offset real, start_at real,
  lines jsonb not null,             -- [{text,start,end}]
  publisher text not null default '',
  downloads int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.market enable row level security;
revoke all on public.market from anon, authenticated;

create or replace function public.nnn_market_publish(code text, sid uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o text := nnn_family(code);
begin
  if length(code) < 16 then raise exception 'bad code'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') < 2 or jsonb_array_length(p->'lines') > 300 then raise exception 'bad lines'; end if;
  if length(p::text) > 100000 then raise exception 'too large'; end if;
  if (p->>'videoId') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'bad video'; end if;
  if exists (select 1 from market where id = sid and owner <> o) then raise exception 'not owner'; end if;
  insert into market (id, owner, title, artist, video_id, beat_video_id, beat_offset, start_at, lines, publisher)
  values (sid, o, left(p->>'title', 200), left(coalesce(p->>'artist', ''), 120), p->>'videoId', nullif(p->>'beatVideoId', ''),
          (p->>'beatOffset')::real, (p->>'startAt')::real, p->'lines', left(coalesce(p->>'publisher', ''), 60))
  on conflict (id) do update set title = excluded.title, artist = excluded.artist, video_id = excluded.video_id,
    beat_video_id = excluded.beat_video_id, beat_offset = excluded.beat_offset, start_at = excluded.start_at,
    lines = excluded.lines, publisher = excluded.publisher, updated_at = now();
end $$;

create or replace function public.nnn_market_unpublish(code text, sid uuid) returns void
language sql security definer set search_path = public as $$
  delete from market where id = sid and owner = nnn_family(code) and length(code) >= 16
$$;

create or replace function public.nnn_market_list(q text) returns table (id uuid, title text, artist text, video_id text, line_count int, publisher text, downloads int, has_beat boolean, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select id, title, artist, video_id, jsonb_array_length(lines), publisher, downloads, beat_video_id is not null, updated_at from market
  where coalesce(q, '') = '' or lower(title || ' ' || artist || ' ' || publisher) like '%' || lower(q) || '%'
  order by downloads desc, updated_at desc limit 100
$$;

create or replace function public.nnn_market_get(sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  update market set downloads = downloads + 1 where id = sid;
  select jsonb_build_object('title', title, 'artist', artist, 'videoId', video_id, 'beatVideoId', beat_video_id,
    'beatOffset', beat_offset, 'startAt', start_at, 'lines', lines, 'publisher', publisher) into r from market where id = sid;
  return r;
end $$;

grant execute on function public.nnn_market_publish(text, uuid, jsonb), public.nnn_market_unpublish(text, uuid),
  public.nnn_market_list(text), public.nnn_market_get(uuid) to anon;
