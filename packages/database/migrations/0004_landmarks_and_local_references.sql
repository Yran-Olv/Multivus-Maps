-- 0004_landmarks_and_local_references.sql
-- Fase de Inteligência Local para Entregadores:
-- 1. Landmarks (Pontos de Referência Locais por Categoria)
-- 2. Referências Populares (ex: "rua do hospital", "atrás da rodoviária", "perto da lotérica")
-- 3. Confirmações Colaborativas com pontuação de confiança distribuída
-- 4. Registro de aprendizado local (buscas e expressões populares)

-- 1. Tabela landmarks
CREATE TABLE IF NOT EXISTS landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('hospital', 'praca', 'escola', 'igreja', 'posto', 'comercio', 'orgao_publico', 'outro')),
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  street_id uuid REFERENCES streets(id) ON DELETE SET NULL,
  street_number text,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  address text,
  description text,
  latitude double precision,
  longitude double precision,
  geometry geometry(Point, 4326),
  verified boolean NOT NULL DEFAULT false,
  confidence_score integer NOT NULL DEFAULT 70 CHECK (confidence_score BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landmarks_city_category_idx ON landmarks (city_id, category);
CREATE INDEX IF NOT EXISTS landmarks_normalized_name_idx ON landmarks (normalized_name);
CREATE INDEX IF NOT EXISTS landmarks_street_idx ON landmarks (street_id);

-- 2. Tabela local_references (Expressões coloquiais e referências de entregador)
CREATE TABLE IF NOT EXISTS local_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  popular_phrase text NOT NULL,
  normalized_phrase text NOT NULL,
  relation_type text NOT NULL DEFAULT 'ON_STREET' CHECK (relation_type IN ('ON_STREET', 'NEAR', 'BEHIND', 'IN_FRONT_OF', 'NEXT_TO', 'CORNER', 'OTHER')),
  target_street_id uuid REFERENCES streets(id) ON DELETE CASCADE,
  landmark_id uuid REFERENCES landmarks(id) ON DELETE SET NULL,
  description text,
  confirmations_count integer NOT NULL DEFAULT 1,
  confidence_score integer NOT NULL DEFAULT 70 CHECK (confidence_score BETWEEN 0 AND 100),
  verified boolean NOT NULL DEFAULT false,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_references_normalized_idx ON local_references (normalized_phrase);
CREATE INDEX IF NOT EXISTS local_references_target_street_idx ON local_references (target_street_id);
CREATE INDEX IF NOT EXISTS local_references_landmark_idx ON local_references (landmark_id);

-- 3. Tabela de confirmações colaborativas (Crowdsourcing de confiança)
CREATE TABLE IF NOT EXISTS collaboration_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('street', 'street_alias', 'local_reference', 'landmark', 'map_correction')),
  entity_id uuid NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id text,
  confirmation_type text NOT NULL DEFAULT 'CONFIRM' CHECK (confirmation_type IN ('CONFIRM', 'DISPUTE')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaboration_user_unique UNIQUE (entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS collab_conf_entity_idx ON collaboration_confirmations (entity_type, entity_id);

-- 4. Tabela de registro de buscas e aprendizado local
CREATE TABLE IF NOT EXISTS search_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  normalized_query text NOT NULL,
  matched_kind text,
  matched_id uuid,
  matched_alias text,
  used_old_name boolean NOT NULL DEFAULT false,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_analytics_normalized_idx ON search_analytics (normalized_query);
CREATE INDEX IF NOT EXISTS search_analytics_created_at_idx ON search_analytics (created_at DESC);
