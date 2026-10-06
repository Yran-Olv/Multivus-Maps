-- 0005_landmarks_importance_and_local_intelligence.sql
-- Camada de Inteligência Local para Santa Juliana:
-- 1. importance_score na tabela landmarks (0 a 100) para ranking de relevância
-- 2. Coluna source na tabela landmarks ('manual', 'cnpj', 'osm', 'comunidade')
-- 3. Expansão de categorias de comércio e pontos de referência (supermercado, farmácia, posto, padaria, etc.)
-- 4. Índices para ranking e buscas rápidas por importância

-- Adiciona a coluna importance_score caso não exista
ALTER TABLE landmarks
  ADD COLUMN IF NOT EXISTS importance_score integer NOT NULL DEFAULT 70 CHECK (importance_score BETWEEN 0 AND 100);

-- Adiciona a coluna source caso não exista
ALTER TABLE landmarks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Atualiza a restrição de verificação de categorias para incluir todos os comércios e referências da cidade
ALTER TABLE landmarks DROP CONSTRAINT IF EXISTS landmarks_category_check;
ALTER TABLE landmarks ADD CONSTRAINT landmarks_category_check CHECK (
  category IN (
    'supermercado',
    'farmacia',
    'posto',
    'padaria',
    'materiais_construcao',
    'hospital',
    'rodoviaria',
    'orgao_publico',
    'comercio',
    'escola',
    'igreja',
    'praca',
    'banco',
    'oficina',
    'outro'
  )
);

-- Índice para ranking por relevância e busca
CREATE INDEX IF NOT EXISTS landmarks_importance_idx ON landmarks (importance_score DESC, normalized_name);
CREATE INDEX IF NOT EXISTS landmarks_category_importance_idx ON landmarks (category, importance_score DESC);
