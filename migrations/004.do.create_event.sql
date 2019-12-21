CREATE TABLE event (
  id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  fb_id TEXT,
  fb_place_id TEXT,
  fb_cover_photo_id TEXT,
  event_times TEXT,
  event_name TEXT,
  description TEXT,
  updated_time TIMESTAMP
)