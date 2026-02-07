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
    internal_flight_id VARCHAR(64) NOT NULL,
    flight_identity VARCHAR(16) NOT NULL,
    carrier_code VARCHAR(8),
    carrier_name VARCHAR(128),
    scheduled_datetime TIMESTAMPTZ NOT NULL,
    estimated_datetime TIMESTAMPTZ,
    status INTEGER,
    status_message VARCHAR(64),
    terminal_name VARCHAR(8) NOT NULL,
    destination VARCHAR(128),
    gate VARCHAR(16),
    checkin_zone VARCHAR(16),
    checkin_desk_range VARCHAR(32),
    is_delayed BOOLEAN DEFAULT false,
    last_updated TIMESTAMPTZ,
    polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (internal_flight_id)
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
CREATE INDEX IF NOT EXISTS idx_departures_terminal_scheduled ON departures(terminal_name, scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_departures_scheduled ON departures(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_feature_requests_acknowledged ON feature_requests(acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active_expires ON announcements(active, expires_at);