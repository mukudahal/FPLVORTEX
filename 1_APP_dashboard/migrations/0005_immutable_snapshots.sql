-- Keep source snapshots append-only, including while model runs reference them.
CREATE FUNCTION reject_data_snapshot_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Historical FPL data snapshots cannot be updated or deleted';
END;
$$;

CREATE TRIGGER data_snapshots_append_only
BEFORE UPDATE OR DELETE ON data_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_data_snapshot_changes();
