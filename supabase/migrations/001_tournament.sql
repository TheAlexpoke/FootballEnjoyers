-- Run as postgres in a new Supabase project. All privileged functions are service-only.
create table public.tournaments (
 id text primary key check(id in ('production','practice')), revision integer not null default 0,
 config jsonb not null, fantasy jsonb not null, version integer not null default 1
);
create table public.participants (
 tournament_id text references public.tournaments(id) on delete cascade,
 id text not null, name text not null check(name in ('Mark','Hong','Li','Arun','Erfan','Dabin','Alex')),
 profile jsonb not null, credential_hash text not null, device_hash text not null,
 primary key(tournament_id,id), unique(tournament_id,name)
);
create table public.events (
 tournament_id text references public.tournaments(id) on delete cascade,
 id text not null, position integer not null, configuration jsonb not null,
 primary key(tournament_id,id)
);
create table public.event_results (
 tournament_id text not null, event_id text not null, participant_id text not null,
 raw jsonb not null, primary key(tournament_id,event_id,participant_id),
 foreign key(tournament_id,event_id) references public.events(tournament_id,id) on delete cascade,
 foreign key(tournament_id,participant_id) references public.participants(tournament_id,id) on delete cascade
);
create table public.standings_snapshots (
 tournament_id text references public.tournaments(id) on delete cascade,
 id text not null, payload jsonb not null, primary key(tournament_id,id)
);
create table public.audit_records (
 tournament_id text references public.tournaments(id) on delete cascade,
 id text not null, payload jsonb not null, primary key(tournament_id,id)
);
create table public.backups (
 id uuid primary key default gen_random_uuid(), tournament_id text not null references public.tournaments(id),
 created_at timestamptz not null default now(), payload jsonb not null
);
create table public.admin_sessions (token_hash text primary key, expires_at timestamptz not null);
create table public.rate_limits (key text primary key, attempts integer not null, reset_at timestamptz not null);
-- Only non-sensitive revision notifications may be read through the browser.
create table public.tournament_pulse (id text primary key references public.tournaments(id), revision integer not null);
alter table public.tournament_pulse enable row level security;
create policy public_production_pulse on public.tournament_pulse for select to anon, authenticated using (id='production');
grant select on public.tournament_pulse to anon, authenticated;
alter publication supabase_realtime add table public.tournament_pulse;

do $$ declare tab text; begin
 foreach tab in array array['tournaments','participants','events','event_results','standings_snapshots','audit_records','backups','admin_sessions','rate_limits'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from anon, authenticated',tab);
 end loop;
end $$;

create function public.read_tournament(env text) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('version',t.version,'revision',t.revision,'environment',t.id,'config',t.config,'fantasy',t.fantasy,
 'participants',coalesce((select jsonb_agg(p.profile || jsonb_build_object('id',p.id,'name',p.name,'credentialHash',p.credential_hash,'deviceHash',p.device_hash) order by p.name) from participants p where p.tournament_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e.configuration || jsonb_build_object('id',e.id,'results',coalesce((select jsonb_agg(r.raw order by r.participant_id) from event_results r where r.tournament_id=t.id and r.event_id=e.id),'[]'::jsonb)) order by e.position) from events e where e.tournament_id=t.id),'[]'::jsonb),
 'snapshots',coalesce((select jsonb_agg(s.payload order by s.payload->>'at',s.id) from standings_snapshots s where s.tournament_id=t.id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(a.payload order by a.payload->>'at',a.id) from audit_records a where a.tournament_id=t.id),'[]'::jsonb))
 from tournaments t where t.id=env;
$$;

create function public.commit_tournament(env text, expected integer, state jsonb) returns boolean
 language plpgsql security definer set search_path=public as $$
 declare rev integer; p jsonb; e jsonb; r jsonb; s jsonb; idx integer:=0;
 begin
 if env not in ('production','practice') or state->>'environment'<>env then raise exception 'Invalid environment'; end if;
 -- First creation and concurrent first registrations serialize on the tournament row.
 insert into tournaments(id,config,fantasy) values(env,state->'config',state->'fantasy') on conflict do nothing;
 select revision into rev from tournaments where id=env for update;
 if rev<>expected then return false; end if;
 if jsonb_array_length(state->'participants')>7 then raise exception 'Registration cap exceeded'; end if;
 delete from event_results where tournament_id=env;
 delete from events where tournament_id=env;
 delete from participants where tournament_id=env;
 for p in select value from jsonb_array_elements(state->'participants') loop
 insert into participants values(env,p->>'id',p->>'name',p-'credentialHash'-'deviceHash'-'id'-'name',p->>'credentialHash',p->>'deviceHash');
 end loop;
 for e in select value from jsonb_array_elements(state->'events') loop
 insert into events values(env,e->>'id',idx,e-'results'-'id'); idx:=idx+1;
 for r in select value from jsonb_array_elements(e->'results') loop
 insert into event_results values(env,e->>'id',r->>'participantId',r);
 end loop;
 end loop;
 delete from standings_snapshots where tournament_id=env;
 for s in select value from jsonb_array_elements(state->'snapshots') loop insert into standings_snapshots values(env,s->>'id',s); end loop;
 -- Audit history is append-only even across restore/reset.
 for s in select value from jsonb_array_elements(state->'audit') loop insert into audit_records values(env,s->>'id',s) on conflict do nothing; end loop;
 update tournaments set revision=rev+1,config=state->'config',fantasy=state->'fantasy' where id=env;
 insert into tournament_pulse values(env,rev+1) on conflict(id) do update set revision=excluded.revision;
 return true;
 end;
$$;

-- Lightweight server projection for spectators: no NFL catalog, audit or credentials.
create function public.read_public_tournament(env text) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('version',t.version,'revision',t.revision,'environment',t.id,'config',t.config,
 'fantasy',t.fantasy-'players'-'users'-'rosters'-'manualMappings',
 'participants',coalesce((select jsonb_agg(p.profile || jsonb_build_object('id',p.id,'name',p.name) order by p.name) from participants p where p.tournament_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e.configuration || jsonb_build_object('id',e.id,'results',coalesce((select jsonb_agg(r.raw order by r.participant_id) from event_results r where r.tournament_id=t.id and r.event_id=e.id),'[]'::jsonb)) order by e.position) from events e where e.tournament_id=t.id),'[]'::jsonb),
 'snapshots',coalesce((select jsonb_agg(s.payload order by s.payload->>'at',s.id) from standings_snapshots s where s.tournament_id=t.id),'[]'::jsonb),'audit','[]'::jsonb)
 from tournaments t where t.id=env;
$$;
revoke all on function public.read_public_tournament(text) from public,anon,authenticated;
grant execute on function public.read_public_tournament(text) to service_role;

create function public.consume_limit(bucket text, maximum integer, seconds integer) returns boolean
 language plpgsql security definer set search_path=public as $$
 declare n integer;
 begin
 insert into rate_limits values(bucket,1,now()+make_interval(secs=>seconds))
 on conflict(key) do update set attempts=case when rate_limits.reset_at<now() then 1 else rate_limits.attempts+1 end,
 reset_at=case when rate_limits.reset_at<now() then now()+make_interval(secs=>seconds) else rate_limits.reset_at end
 returning attempts into n;
 return n<=maximum;
 end;
$$;
create table public.worker_locks (id text primary key, until_at timestamptz not null);
alter table public.worker_locks enable row level security;
revoke all on public.worker_locks from anon, authenticated;
create function public.acquire_worker(lock_id text, seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare got text; begin
 insert into worker_locks values(lock_id,now()+make_interval(secs=>seconds))
 on conflict(id) do update set until_at=excluded.until_at where worker_locks.until_at<now()
 returning id into got; return got is not null;
end $$;
revoke all on function public.read_tournament(text), public.commit_tournament(text,integer,jsonb), public.consume_limit(text,integer,integer), public.acquire_worker(text,integer) from public,anon,authenticated;
grant execute on function public.read_tournament(text), public.commit_tournament(text,integer,jsonb), public.consume_limit(text,integer,integer), public.acquire_worker(text,integer) to service_role;
grant all on public.tournaments, public.participants, public.events, public.event_results, public.standings_snapshots, public.audit_records, public.backups, public.admin_sessions, public.rate_limits, public.worker_locks, public.tournament_pulse to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',true,2097152,array['image/webp']) on conflict do nothing;
-- No client write policies. Uploads are validated, decoded, resized and written server-side.
