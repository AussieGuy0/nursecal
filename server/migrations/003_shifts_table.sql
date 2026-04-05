CREATE TABLE shifts (
  user_id  INTEGER NOT NULL,
  date     TEXT    NOT NULL,
  label_id TEXT    NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migrate existing data from the old calendars blob
INSERT OR IGNORE INTO shifts (user_id, date, label_id)
SELECT c.user_id, je.key, je.value
FROM calendars c, json_each(c.shifts) je;

DROP TABLE calendars;
