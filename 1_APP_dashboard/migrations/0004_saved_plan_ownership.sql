-- Existing plans lack authenticated owners. Preserve them but do not expose them publicly.
ALTER TABLE saved_plans
  ADD COLUMN owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
CREATE INDEX saved_plans_owner_entry_active_idx
  ON saved_plans (owner_user_id, entry_id, active, created_at);
