-- VZ Links Production Schema for Cloudflare D1 (`LINKS_DB`)
-- Execute on Cloudflare D1 with:
--   npx wrangler d1 create vzlinks-db
--   npx wrangler d1 execute vzlinks-db --remote --file=cloudflare/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bio_profiles (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  socials_json TEXT NOT NULL DEFAULT '{}',
  indexing_mode TEXT NOT NULL DEFAULT 'none',
  is_deactivated INTEGER NOT NULL DEFAULT 0,
  deactivated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bio_pages (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  page_slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  theme_id TEXT NOT NULL DEFAULT 'midnight_slate',
  button_style TEXT NOT NULL DEFAULT 'rounded',
  show_socials INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 1,
  qr_design_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(username, page_slug),
  FOREIGN KEY (username) REFERENCES bio_profiles(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bio_links (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES bio_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bio_avatars (
  avatar_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  page_slug TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shortlinks (
  slug TEXT PRIMARY KEY,
  owner_user TEXT,
  title TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL,
  is_custom_slug INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_clicked_at TEXT
);

CREATE TABLE IF NOT EXISTS links_recycle_bin (
  id TEXT PRIMARY KEY,
  owner_user TEXT NOT NULL,
  item_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bio_delete_cooldowns (
  username TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL,
  unlock_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bio_pages_user ON bio_pages(username, page_slug);
CREATE INDEX IF NOT EXISTS idx_bio_links_page ON bio_links(page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_bio_avatars_user ON bio_avatars(username, page_slug);
CREATE INDEX IF NOT EXISTS idx_shortlinks_owner_created ON shortlinks(owner_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_owner ON links_recycle_bin(owner_user, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON links_recycle_bin(expires_at);
