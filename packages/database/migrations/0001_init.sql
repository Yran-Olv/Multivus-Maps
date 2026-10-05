CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('ADMIN', 'EDITOR', 'DELIVERY_DRIVER', 'USER');
CREATE TYPE alias_type AS ENUM ('OLD_NAME', 'POPULAR_NAME', 'ABBREVIATION', 'OTHER');
CREATE TYPE segment_direction AS ENUM ('BOTH', 'FORWARD', 'BACKWARD');
CREATE TYPE restriction_type AS ENUM (
  'NO_LEFT',
  'NO_RIGHT',
  'NO_U_TURN',
  'MANDATORY_LEFT',
  'MANDATORY_RIGHT',
  'CLOSED',
  'OTHER'
);
CREATE TYPE correction_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED');

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL,
  country text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  center_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cities_name_state_unique UNIQUE (name, state)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  geometry geometry(Geometry, 4326),
  source text NOT NULL,
  source_date text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neighborhoods_city_name_unique UNIQUE (city_id, normalized_name)
);

CREATE TABLE streets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id),
  neighborhood_id uuid REFERENCES neighborhoods (id),
  official_name text NOT NULL,
  normalized_name text NOT NULL,
  street_type text NOT NULL,
  geometry geometry(Geometry, 4326),
  source text NOT NULL,
  source_date text,
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES users (id),
  verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT streets_city_normalized_unique UNIQUE (city_id, normalized_name)
);

CREATE TABLE street_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_id uuid NOT NULL REFERENCES streets (id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type alias_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT street_aliases_unique UNIQUE (street_id, normalized_alias, alias_type)
);

CREATE TABLE street_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_id uuid NOT NULL REFERENCES streets (id) ON DELETE CASCADE,
  geometry geometry(Geometry, 4326),
  direction segment_direction NOT NULL DEFAULT 'BOTH',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE turn_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_segment_id uuid NOT NULL REFERENCES street_segments (id) ON DELETE CASCADE,
  to_segment_id uuid NOT NULL REFERENCES street_segments (id) ON DELETE CASCADE,
  restriction_type restriction_type NOT NULL,
  description text,
  geometry_point geometry(Point, 4326),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities (id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text NOT NULL,
  latitude double precision,
  longitude double precision,
  address text,
  neighborhood_id uuid REFERENCES neighborhoods (id),
  description text,
  source text NOT NULL,
  source_date text,
  verified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text,
  phone text,
  street_id uuid REFERENCES streets (id),
  street_number text,
  complement text,
  reference text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  facade_photo text,
  notes text,
  verified boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id),
  client_request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE map_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text,
  entity_id uuid,
  correction_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  description text NOT NULL,
  status correction_status NOT NULL DEFAULT 'PENDING',
  submitted_by uuid REFERENCES users (id),
  reviewed_by uuid REFERENCES users (id),
  client_request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  street_id uuid REFERENCES streets (id),
  place_id uuid REFERENCES places (id),
  delivery_location_id uuid REFERENCES delivery_locations (id),
  label text NOT NULL,
  client_request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recent_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query text NOT NULL,
  street_id uuid REFERENCES streets (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  client_id text NOT NULL UNIQUE,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  status sync_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX streets_normalized_trgm ON streets USING gin (normalized_name gin_trgm_ops);
CREATE INDEX street_aliases_normalized_trgm ON street_aliases USING gin (normalized_alias gin_trgm_ops);
CREATE INDEX places_normalized_trgm ON places USING gin (normalized_name gin_trgm_ops);
CREATE INDEX neighborhoods_normalized_trgm ON neighborhoods USING gin (normalized_name gin_trgm_ops);
CREATE INDEX streets_geom_gix ON streets USING gist (geometry);
CREATE INDEX map_corrections_status_idx ON map_corrections (status, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cities_set_updated_at BEFORE UPDATE ON cities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER neighborhoods_set_updated_at BEFORE UPDATE ON neighborhoods
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER streets_set_updated_at BEFORE UPDATE ON streets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER street_segments_set_updated_at BEFORE UPDATE ON street_segments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER places_set_updated_at BEFORE UPDATE ON places
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER delivery_locations_set_updated_at BEFORE UPDATE ON delivery_locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
