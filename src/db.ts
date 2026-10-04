import Database from "better-sqlite3";

// One SQLite file (or :memory:) stands in for the Postgres you'd run in production.
// The rules that matter live in the schema, so they hold no matter which code path writes.
export function openDb(path = ":memory:") {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE guests (
      id INTEGER PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,            -- WhatsApp number, E.164
      created_at TEXT NOT NULL
    );

    -- One stay per guest per arrival. Attribution is scoped to the stay.
    CREATE TABLE stays (
      id INTEGER PRIMARY KEY,
      guest_id INTEGER NOT NULL REFERENCES guests(id),
      arrival_date TEXT NOT NULL,
      hotel TEXT NOT NULL,
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 12),
      referral_code TEXT,                    -- first code wins, then frozen
      code_locked_at TEXT,
      UNIQUE (guest_id, arrival_date)
    );

    -- Once a stay has a referral code, nothing can change or clear it.
    CREATE TRIGGER stays_code_is_final
    BEFORE UPDATE OF referral_code ON stays
    WHEN OLD.referral_code IS NOT NULL AND (NEW.referral_code IS NOT OLD.referral_code)
    BEGIN
      SELECT RAISE(ABORT, 'referral code already set for this stay');
    END;

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY,
      stay_id INTEGER NOT NULL REFERENCES stays(id),
      product TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      currency TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,  -- a retried tool call can't book twice
      bokun_booking_id TEXT NOT NULL,
      referral_code TEXT,                    -- copied from the stay at booking time
      status TEXT NOT NULL CHECK (status IN ('confirmed','attended','refunded')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      guest_id INTEGER NOT NULL REFERENCES guests(id),
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      kind TEXT NOT NULL CHECK (kind IN ('text','template')),
      body TEXT NOT NULL,
      at TEXT NOT NULL
    );

    -- Append-only commission ledger. A refund is a new reversing row, never an edit.
    CREATE TABLE ledger (
      id INTEGER PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      seller_code TEXT NOT NULL,
      entry TEXT NOT NULL CHECK (entry IN ('commission','reversal')),
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (booking_id, entry)             -- the nightly job can run twice safely
    );
    CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
    BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
    CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
    BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
  `);
  return db;
}

export type Db = ReturnType<typeof openDb>;
