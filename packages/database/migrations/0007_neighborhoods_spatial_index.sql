-- 0007_neighborhoods_spatial_index.sql
-- Adiciona índice espacial GIST para a geometria dos bairros
CREATE INDEX IF NOT EXISTS neighborhoods_geom_gix
  ON neighborhoods USING gist (geometry)
  WHERE geometry IS NOT NULL;
