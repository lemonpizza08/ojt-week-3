-- OJT Task Tracker — Database Schema
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  deadline TIMESTAMP WITHOUT TIME ZONE,
  drive_link TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  google_calendar_event_id TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  deadline_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_deadline ON activities(deadline)
  WHERE reminder_sent = FALSE OR deadline_alert_sent = FALSE;
