import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config({ path: '.env.local' });

// Create a mock JWT for an authenticated user
const mockJwt = jwt.sign(
  {
    role: 'authenticated',
    aud: 'authenticated',
    sub: '12345678-1234-1234-1234-123456789012',
    email: 'test@oxybio.com',
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
  process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long' // Fallback for local testing if you don't have the real one
);

// We need the real JWT secret to sign a valid token that PostgREST will accept!
// Wait, we DO NOT have the JWT secret in .env.local!
