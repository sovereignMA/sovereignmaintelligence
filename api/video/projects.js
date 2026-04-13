// api/video/projects.js
// CRUD for video_projects table — save/load generated video scripts
// GET              → list user's projects (most recent first)
// POST  { title, template, topic, context, format, script }  → create
// PATCH { id, title?, script? }                              → update
// DELETE ?id=<uuid>                                          → delete

import { setCORS, requireAdmin, sbAdmin } from '../lib/cors-auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS'); return res.status(200).end(); }
  setCORS(req, res, 'GET, POST, PATCH, DELETE, OPTIONS');

  const sb = sbAdmin();
  const user = await requireAdmin(req, sb);
  if (!user) return res.status(401).json({ error: 'Admin only' });

  // GET — list projects
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('video_projects')
      .select('id, title, template, topic, context, format, script, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — create project
  if (req.method === 'POST') {
    const { title, template, topic, context, format, script } = req.body || {};
    if (!script) return res.status(400).json({ error: 'script required' });
    const { data, error } = await sb
      .from('video_projects')
      .insert({ user_id: user.id, title: title || 'Untitled Video', template, topic, context, format, script })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — update title or script
  if (req.method === 'PATCH') {
    const { id, title, script } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (script !== undefined) updates.script = script;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'nothing to update' });
    const { data, error } = await sb
      .from('video_projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove project
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await sb
      .from('video_projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
