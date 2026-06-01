-- Phase 5 Secure Communications Schema

-- 79. E-Discovery & Compliance
CREATE TABLE IF NOT EXISTS chat_retention_policies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  context_type TEXT NOT NULL, -- e.g., 'batch', 'general', 'hr'
  retention_days INTEGER NOT NULL,
  auto_archive BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 80. Secure Attachments
CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  message_id UUID, -- References whatever chat message table exists (e.g., messages(id))
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  encryption_status TEXT DEFAULT 'Unencrypted', -- 'Encrypted', 'Unencrypted'
  uploaded_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
