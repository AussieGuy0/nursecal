-- Replaces the single-row `calendars` table (JSON blob) with a normalized
-- `calendar_day` table where each row is one day's shift assignment.
--
-- To revert manually (e.g. from a SQLite shell against a backup):
--
--   CREATE TABLE calendars (
--     user_id INTEGER PRIMARY KEY,
--     shifts TEXT NOT NULL DEFAULT '{}',
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
--   );
--
--   INSERT INTO calendars (user_id, shifts)
--   SELECT user_id, json_group_object(date, label_id)
--   FROM calendar_day
--   GROUP BY user_id;
--
--   DROP TABLE calendar_day;
--
-- Note: users with no calendar days will not get a row in calendars (the app
-- handled a missing row as an empty calendar, so this is fine).
--
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
