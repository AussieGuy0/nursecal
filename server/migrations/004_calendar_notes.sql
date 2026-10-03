CREATE TABLE calendar_notes (
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX calendar_notes_user_date_idx ON calendar_notes(user_id, date);
