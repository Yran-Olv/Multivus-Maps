-- 0003_cartography_and_provenance.sql
-- Migration para suporte cartográfico completo, proveniência de dados, pontos de endereço e histórico administrativo.

-- 1. Campos de proveniência e status de geometria na tabela streets
ALTER TABLE streets
  ADD COLUMN IF NOT EXISTS geometry_source text,
  ADD COLUMN IF NOT EXISTS geometry_source_date text,
  ADD COLUMN IF NOT EXISTS geometry_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS neighborhood_status text NOT NULL DEFAULT 'PENDING' CHECK (neighborhood_status IN ('PENDING', 'CONFIRMED')),
  ADD COLUMN IF NOT EXISTS neighborhood_source text;

-- 2. Suporte para desativação de aliases sem apagar histórico
ALTER TABLE street_aliases
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 3. Suporte para verificação de segmentos de rua e restrições de conversão
ALTER TABLE street_segments
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE turn_restrictions
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;

-- 4. Tabela de pontos de endereço específicos (números de casas / lotes)
CREATE TABLE IF NOT EXISTS address_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_id uuid NOT NULL REFERENCES streets(id) ON DELETE CASCADE,
  number text NOT NULL,
  geometry geometry(Point, 4326),
  source text NOT NULL DEFAULT 'Conferência local',
  source_date text,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  confidence_score integer NOT NULL DEFAULT 70 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_points_street_number_unique UNIQUE (street_id, number)
);

CREATE INDEX IF NOT EXISTS address_points_street_idx ON address_points (street_id);

-- 5. Tabela de conferência e staging de importação cartográfica (OSM / outras fontes)
CREATE TABLE IF NOT EXISTS osm_import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name text NOT NULL,
  osm_id text,
  source_name text NOT NULL,
  normalized_source_name text NOT NULL,
  street_type text,
  geometry geometry(Geometry, 4326) NOT NULL,
  multivus_street_id uuid REFERENCES streets(id) ON DELETE SET NULL,
  match_type text NOT NULL CHECK (match_type IN ('MATCH_EXACT', 'MATCH_ALIAS', 'MATCH_FUZZY', 'CONFLICT', 'NEW_STREET', 'UNRESOLVED')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT', 'MERGED')),
  conflicts jsonb,
  tags jsonb,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS osm_import_records_batch_idx ON osm_import_records (batch_name);
CREATE INDEX IF NOT EXISTS osm_import_records_street_idx ON osm_import_records (multivus_street_id);
CREATE INDEX IF NOT EXISTS osm_import_records_status_idx ON osm_import_records (status);
