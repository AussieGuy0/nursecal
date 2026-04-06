-- Create a normalized calendar_day table to replace the JSON blob in calendars
CREATE TABLE calendar_day (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  label_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
  UNIQUE (user_id, date)
);

-- Migrate existing data from the JSON blob, skipping any orphaned label references
INSERT INTO calendar_day (user_id, date, label_id)
SELECT c.user_id, j.key, j.value
FROM calendars c, json_each(c.shifts) j
WHERE c.shifts IS NOT NULL AND c.shifts != '{}'
  AND j.value IN (SELECT id FROM labels);

-- Drop the old calendars table
DROP TABLE calendars;
