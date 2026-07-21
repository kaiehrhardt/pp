CREATE TABLE IF NOT EXISTS rooms (
  id                TEXT PRIMARY KEY,
  host_id           TEXT,
  pending_host_id   TEXT,
  phase             TEXT NOT NULL DEFAULT 'voting' CHECK (phase IN ('voting', 'revealed')),
  created_at        INTEGER NOT NULL,
  empty_since       INTEGER,
  reactions_thrown  INTEGER NOT NULL DEFAULT 0,
  duels_completed   INTEGER NOT NULL DEFAULT 0,
  version           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rooms_empty_since ON rooms(empty_since) WHERE empty_since IS NOT NULL;

CREATE TABLE IF NOT EXISTS participants (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,
  is_spectator INTEGER NOT NULL DEFAULT 0,
  vote         TEXT,
  guess        REAL,
  connected    INTEGER NOT NULL DEFAULT 1,
  trophy_count INTEGER NOT NULL DEFAULT 0,
  avatar       TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,
  version      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_room_token ON participants(room_id, token);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                 TEXT PRIMARY KEY,
  room_id            TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id     TEXT NOT NULL,
  participant_name   TEXT NOT NULL,
  participant_color  TEXT NOT NULL,
  text               TEXT NOT NULL,
  sent_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_room_sent ON chat_messages(room_id, sent_at);

CREATE TABLE IF NOT EXISTS round_evaluations (
  id                TEXT PRIMARY KEY,
  room_id           TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  average           REAL NOT NULL,
  recommended_card  TEXT NOT NULL,
  revealed_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_round_evaluations_room ON round_evaluations(room_id);
