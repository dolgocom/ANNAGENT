SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS user_profile (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
    birth_date DATE,
    birth_time TIME,
    birth_place VARCHAR(200),
    birth_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_health (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    readiness_score INTEGER,
    hrv_avg FLOAT,
    sleep_score INTEGER,
    sleep_hours FLOAT,
    heart_rate_avg INTEGER,
    energy_subjective INTEGER,
    focus_subjective INTEGER,
    mood_subjective INTEGER,
    workout_done BOOLEAN,
    massage_done BOOLEAN,
    alcohol BOOLEAN,
    data_conflict BOOLEAN DEFAULT FALSE,
    oura_raw JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    title VARCHAR(500),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    meeting_type VARCHAR(50),
    cognitive_load VARCHAR(20),
    participants TEXT[],
    is_protected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_memories (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    category VARCHAR(100),
    source VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_episodes (
    id SERIAL PRIMARY KEY,
    session_id UUID DEFAULT gen_random_uuid(),
    role VARCHAR(20),
    content TEXT NOT NULL,
    agent_involved VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    role VARCHAR(100),
    circle VARCHAR(20) DEFAULT 'extended',
    interests TEXT[],
    occupation VARCHAR(200),
    country VARCHAR(100),
    city VARCHAR(100),
    birth_date DATE,
    notes TEXT,
    last_contact DATE,
    contact_frequency_days INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_tests (
    id SERIAL PRIMARY KEY,
    test_name VARCHAR(200),
    test_date DATE,
    value FLOAT,
    unit VARCHAR(50),
    normal_min FLOAT,
    normal_max FLOAT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medications (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200),
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    prescribed_by VARCHAR(200),
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    research_summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_analyses (
    id SERIAL PRIMARY KEY,
    meeting_date DATE,
    participants TEXT[],
    context TEXT,
    manipulation_detected TEXT[],
    hidden_conflicts TEXT[],
    recommendations TEXT,
    risk_level VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_settings VALUES
    ('morning_briefing_time', '07:00'),
    ('evening_digest_time', '22:00'),
    ('timezone', 'Europe/Moscow'),
    ('readiness_low_threshold', '65'),
    ('reminder_ping_interval_minutes', '5'),
    ('max_pings', '2'),
    ('awaiting_subjective_input', 'false'),
    ('ping_count', '0')
ON CONFLICT (key) DO NOTHING;
"""
