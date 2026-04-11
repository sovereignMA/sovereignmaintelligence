// api/agent/tasks.js
// Admin CRUD for agent_tasks table
// GET  ?status=todo|in_progress|complete|failed  → list tasks
// POST { title, description, agent_type, priority, input }   → create
// PATCH { id, status, title, ... }               → update
// DELETE ?id=<uuid>                              → delete

import { createClient } from '@supabase/supabase-js';
import { setCORS, requireAdmin } from '../lib/cors-auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS'); return res.status(200).end(); }
  setCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS');

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const user = await requireAdmin(req, sb);
  if (!user) return res.status(401).json({ error: 'Admin only' });

  // GET — list tasks
  if (req.method === 'GET') {
    const { status } = req.query;
    let q = sb.from('agent_tasks')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create task
  if (req.method === 'POST') {
    const { title, description, agent_type = 'general', priority = 3, input } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { data, error } = await sb.from('agent_tasks').insert({
      title, description, agent_type, priority, input,
      created_by: user.id,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update task
  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    // Don't allow overwriting output/error via this endpoint (runner owns those)
    const safe = {};
    for (const k of ['title','description','agent_type','priority','status','input']) {
      if (k in updates) safe[k] = updates[k];
    }
    if (safe.status === 'todo') { safe.started_at = null; safe.completed_at = null; }
    const { data, error } = await sb.from('agent_tasks').update(safe).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove task
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await sb.from('agent_tasks').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
