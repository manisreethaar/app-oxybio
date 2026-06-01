-- Phase 5 Admin & Security Schema

-- 68. RBAC Matrix
CREATE TABLE IF NOT EXISTS rbac_matrix (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  role_name TEXT NOT NULL,
  module_name TEXT NOT NULL,
  can_read BOOLEAN DEFAULT TRUE,
  can_write BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role_name, module_name)
);

-- 69. System Logs UI
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_details JSONB,
  user_id UUID REFERENCES employees(id),
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 70. SSO Configurations
CREATE TABLE IF NOT EXISTS sso_configurations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT,
  domain_hint TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 72. API Key Management
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key_name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 73. IP Whitelisting
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cidr_block TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 71. Multi-step Approvals
-- Assuming pending_changes table exists, we add fields for multi-step routing
ALTER TABLE pending_changes ADD COLUMN IF NOT EXISTS requires_qa_review BOOLEAN DEFAULT FALSE;
ALTER TABLE pending_changes ADD COLUMN IF NOT EXISTS qa_approved_by UUID REFERENCES employees(id);
