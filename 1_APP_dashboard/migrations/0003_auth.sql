-- Authentication secrets are never stored in plaintext; only SHA-256 token digests.
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (LENGTH(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (LENGTH(token_hash) = 64),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens(user_id, purpose);
CREATE INDEX auth_tokens_expiry_idx ON auth_tokens(expires_at);

CREATE TABLE auth_rate_limits (
  identity_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
