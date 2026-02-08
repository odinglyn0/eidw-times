CREATE TABLE IF NOT EXISTS travel_times (
    id BIGSERIAL PRIMARY KEY,
    polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    origin_name TEXT NOT NULL,
    origin_category TEXT NOT NULL,
    destination_terminal TEXT NOT NULL,
    origin_latitude DOUBLE PRECISION,
    origin_longitude DOUBLE PRECISION,
    destination_latitude DOUBLE PRECISION,
    destination_longitude DOUBLE PRECISION,
    duration_seconds INTEGER,
    duration_text TEXT,
    duration_in_traffic_seconds INTEGER,
    duration_in_traffic_text TEXT,
    static_duration_seconds INTEGER,
    static_duration_text TEXT,
    delay_seconds INTEGER,
    delay_ratio DOUBLE PRECISION,
    distance_meters INTEGER,
    distance_text TEXT,
    travel_advisory_speed_reading_intervals JSONB,
    route_polyline TEXT,
    route_description TEXT,
    route_token TEXT,
    route_legs_count INTEGER,
    route_leg_start_address TEXT,
    route_leg_end_address TEXT,
    route_leg_steps_count INTEGER,
    route_leg_steps JSONB,
    route_travel_advisory JSONB,
    route_viewport_low_lat DOUBLE PRECISION,
    route_viewport_low_lng DOUBLE PRECISION,
    route_viewport_high_lat DOUBLE PRECISION,
    route_viewport_high_lng DOUBLE PRECISION,
    geocoded_origin_place_id TEXT,
    geocoded_origin_formatted_address TEXT,
    geocoded_origin_types JSONB,
    geocoded_destination_place_id TEXT,
    geocoded_destination_formatted_address TEXT,
    geocoded_destination_types JSONB,
    traffic_condition TEXT,
    traffic_speed_category TEXT,
    route_warnings JSONB,
    route_labels JSONB,
    fuel_consumption_microliters BIGINT,
    toll_info JSONB,
    optimized_intermediate_waypoint_index JSONB,
    localized_values JSONB,
    request_departure_time TIMESTAMPTZ,
    response_raw_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_travel_times_polled_at ON travel_times(polled_at);
CREATE INDEX IF NOT EXISTS idx_travel_times_origin_name ON travel_times(origin_name);
CREATE INDEX IF NOT EXISTS idx_travel_times_origin_category ON travel_times(origin_category);
CREATE INDEX IF NOT EXISTS idx_travel_times_destination_terminal ON travel_times(destination_terminal);
CREATE INDEX IF NOT EXISTS idx_travel_times_origin_terminal_polled ON travel_times(origin_name, destination_terminal, polled_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_times_delay ON travel_times(delay_seconds);
CREATE INDEX IF NOT EXISTS idx_travel_times_duration_traffic ON travel_times(duration_in_traffic_seconds);
