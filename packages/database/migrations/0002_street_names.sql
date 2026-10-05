ALTER TABLE streets
  ADD COLUMN confidence_score integer NOT NULL DEFAULT 70;

ALTER TABLE streets
  ADD CONSTRAINT streets_confidence_score_range CHECK (confidence_score BETWEEN 0 AND 100);

CREATE TABLE street_name_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_id uuid NOT NULL REFERENCES streets(id) ON DELETE CASCADE,
  old_name text NOT NULL,
  new_name text NOT NULL,
  effective_date date,
  source text NOT NULL,
  source_date text,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  confidence_score integer NOT NULL DEFAULT 70 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX street_name_history_street_idx ON street_name_history (street_id);

INSERT INTO street_name_history (street_id, old_name, new_name, source, source_date, verified, confidence_score)
SELECT s.id, a.alias, s.official_name, s.source, s.source_date, false, 70
FROM street_aliases a
JOIN streets s ON s.id = a.street_id
WHERE a.alias_type = 'OLD_NAME'
  AND NOT EXISTS (
    SELECT 1 FROM street_name_history h
    WHERE h.street_id = s.id AND h.old_name = a.alias AND h.new_name = s.official_name
  );

ALTER TABLE favorites
  ADD COLUMN customer_input text,
  ADD COLUMN matched_alias text;

ALTER TABLE delivery_locations
  ADD COLUMN customer_input text,
  ADD COLUMN matched_alias text;
