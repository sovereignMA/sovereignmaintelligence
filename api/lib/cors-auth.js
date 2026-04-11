// api/lib/cors-auth.js
// Shared CORS + admin-auth helpers used by all Vercel API routes.

import { createClient } from '@supabase/supabase-js';

export const ALLOWED_ORIGINS = new Set(['https://sovereigncmd.xyz', 'http://localhost:3000']);

export function setCORS(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', methods);
}

export async function requireAdmin(req, sb) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await sb.from('user_profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'superadmin'].includes(profile?.role)) return null;
  return user;
}

export function sbAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
