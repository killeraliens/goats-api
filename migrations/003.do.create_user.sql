CREATE TABLE app_user (
  id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  facebook_provider_id TEXT UNIQUE,
  facebook_provider_token TEXT,
  email TEXT,
  fullname TEXT,
  username TEXT UNIQUE,
  password TEXT,
  admin BOOL DEFAULT false,
  city_id INT REFERENCES city(id) ON DELETE SET NULL
);

