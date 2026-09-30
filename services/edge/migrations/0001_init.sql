-- Notice events already acted on (push sent, post made). Keys look like
-- "push:emn-20260927T232600Z:issued:2026-09-27T23:26:00.000Z". No personal data.
CREATE TABLE IF NOT EXISTS claims (
  key TEXT PRIMARY KEY,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS claims_at ON claims (at);

-- Small values: health, the cached Firebase access token, archive hashes.
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
