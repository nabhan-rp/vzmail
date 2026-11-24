-- Cloudflare D1 Schema for vz.gay Ecosystem Portal
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  primary_domain TEXT NOT NULL,
  alt_domains TEXT DEFAULT '[]',
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('live', 'development', 'coming_soon')),
  name_id TEXT NOT NULL,
  name_en TEXT NOT NULL,
  tagline_id TEXT NOT NULL,
  tagline_en TEXT NOT NULL,
  description_id TEXT NOT NULL,
  description_en TEXT NOT NULL,
  client_domain_patterns TEXT DEFAULT '[]',
  redirect_rules TEXT DEFAULT '[]',
  live_children TEXT DEFAULT '[]',
  architecture_notes_id TEXT DEFAULT '',
  architecture_notes_en TEXT DEFAULT '',
  sponsor TEXT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS redirect_rules (
  id TEXT PRIMARY KEY,
  source_host TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301,
  service_id TEXT NOT NULL
);

INSERT OR REPLACE INTO redirect_rules (id, source_host, target_url, status_code, service_id) VALUES
  ('redir-kaca-blog', 'kaca.blog', 'https://go-blog.vz.gay', 301, 'go-blog'),
  ('redir-blog-vz', 'blog.vz.gay', 'https://goblog.vz.gay', 301, 'go-blog');
