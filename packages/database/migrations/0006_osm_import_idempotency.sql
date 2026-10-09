CREATE UNIQUE INDEX IF NOT EXISTS osm_import_records_batch_osm_id_unique
  ON osm_import_records (batch_name, osm_id)
  WHERE osm_id IS NOT NULL;
