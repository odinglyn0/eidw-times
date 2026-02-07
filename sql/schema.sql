CREATE TABLE IF NOT EXISTS security_times (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    t1 INTEGER,
    t2 INTEGER
);

CREATE TABLE IF NOT EXISTS security_times_current (
    id INTEGER PRIMARY KEY DEFAULT 1,
    t1 INTEGER,
    t2 INTEGER,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS departures (
    id SERIAL PRIMARY KEY,
    terminal_id INTEGER NOT NULL,
    departure_datetime TIMESTAMPTZ NOT NULL,
    departure_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_requests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_security_times_timestamp ON security_times(timestamp);
CREATE INDEX IF NOT EXISTS idx_departures_terminal_datetime ON departures(terminal_id, departure_datetime);
CREATE INDEX IF NOT EXISTS idx_feature_requests_acknowledged ON feature_requests(acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active_expires ON announcements(active, expires_at);