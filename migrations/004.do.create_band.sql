CREATE TABLE band (
  id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  city_id INT REFERENCES city(id) ON DELETE NO ACTION
)
