-- Karyou Bar Ads v1: aislamiento por establecimiento y campañas reutilizables.
-- Idempotente; nuevos proyectos aplican la migración desde db:setup.
create table if not exists bar_venues (
  id integer primary key,
  name text not null check(length(name) between 1 and 100),
  owner_token_hash text not null unique,
  logo_url text,
  created_at text not null default (datetime('now'))
);

create table if not exists bar_rooms (
  session_id integer primary key references sessions(id) on delete cascade,
  venue_id integer not null references bar_venues(id) on delete cascade
);
create index if not exists ix_bar_rooms_venue on bar_rooms(venue_id);

create table if not exists bar_campaigns (
  id integer primary key,
  venue_id integer not null references bar_venues(id) on delete cascade,
  title text not null check(length(title) between 1 and 90),
  image_url text not null,
  blob_path text not null,
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
  placement text not null check(placement in ('espera','entre','resultado')),
  layout text not null check(layout in ('spotlight','tarjeta','firma')),
  duration_seconds integer not null default 10 check(duration_seconds between 3 and 12),
  priority integer not null default 0 check(priority between 0 and 2),
  status text not null default 'draft' check(status in ('draft','active','paused','archived')),
  starts_at text,
  ends_at text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create index if not exists ix_bar_campaigns_active on bar_campaigns(venue_id,status,placement,priority);
create table if not exists bar_impressions (
  id integer primary key,
  campaign_id integer not null references bar_campaigns(id) on delete cascade,
  session_id integer not null references sessions(id) on delete cascade,
  placement text not null,
  viewed_at text not null default (datetime('now'))
);
create index if not exists ix_bar_impressions_campaign on bar_impressions(campaign_id,viewed_at);
