// api/video/script.js
// Generate structured video slide JSON via Claude
// POST { template, topic, context, format }
// Requires: Authorization: Bearer <admin supabase jwt>

import { createClient } from '@supabase/supabase-js';
import { setCORS } from '../lib/cors-auth.js';

const TEMPLATES = {
  product_demo: {
    name: 'Product Demo',
    slides: 8,
    prompt: `Create an 8-slide professional product demo video for "Project Sovereign" — a UK M&A command engine using 21 AI agents to find, analyse and acquire UK SaaS companies at 4-8x EBITDA. Target: serious operators and investors. Tone: authoritative, precise, data-driven. Flow: Title → Problem → Solution → 3 Features → Stats → CTA.`,
  },
  feature_spotlight: {
    name: 'Feature Spotlight',
    slides: 6,
    prompt: `Create a 6-slide feature spotlight video for Project Sovereign. Focus on the specific feature/topic provided. Benefit-driven, clear value proposition. Flow: Title → Context → Feature detail → 2 Benefits → CTA.`,
  },
  social_ad: {
    name: 'Social Ad',
    slides: 5,
    prompt: `Create a 5-slide vertical LinkedIn/X social ad for Project Sovereign. Hook-first, punchy, maximum impact. Each slide must land a single point. Flow: Hook → Problem → Solution → Social proof → CTA. Short durations (3-4s per slide).`,
  },
  investor_pitch: {
    name: 'Investor Pitch',
    slides: 7,
    prompt: `Create a 7-slide investor pitch video for Project Sovereign. Data-driven, credible, compelling for UK/EU sophisticated investors. Flow: Opportunity → Market Size → Product → Traction → Business Model → Team → Ask/CTA.`,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCORS(req, res); return res.status(200).end(); }
  setCORS(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await sb.from('user_profiles').select('role').eq('id', user.id).single();
  if (!['admin','superadmin'].includes(profile?.role)) return res.status(403).json({ error: 'Admin only' });

  const { template = 'product_demo', topic = '', context = '', format = '16:9' } = req.body || {};
  const tpl = TEMPLATES[template] || TEMPLATES.product_demo;

  const system = `You are a world-class SaaS video producer. Return ONLY a valid JSON object — no markdown, no explanation, no code fences. Match this schema exactly:

{
  "title": "string — video title max 6 words",
  "slides": [
    {
      "type": "title|problem|solution|feature|stats|quote|cta",
      "duration": 5,
      "headline": "string — max 8 punchy words",
      "subtitle": "string — optional, max 14 words",
      "label": "string — optional section label 1-3 words, will be uppercased",
      "body": "string — optional, max 28 words, benefit-focused",
      "icon": "string — optional single character emoji from this set only: ◈ ⬡ ◉ ⌘ ▤ ◎ ✦ ⚡ ◆ ▸ ⚙ ⬢ ◐ △ ⬟",
      "stats": [{"value": "string e.g. 21 or 4-8x or £2M", "label": "string max 3 words"}],
      "url": "string — only on cta slide, e.g. sovereigncmd.xyz"
    }
  ]
}

Rules:
- First slide: type must be "title"
- Last slide: type must be "cta"
- stats array: only on type "stats", 2-4 items, real impressive numbers
- duration: 4 for social_ad, 5-6 for other slides, 7 for title and cta
- icon: only include on feature/problem/solution slides
- NO quotes inside string values — use apostrophes
- url on cta: always "sovereigncmd.xyz"
- All text: professional British English`;

  const user_msg = `${tpl.prompt}

Topic/Focus: ${topic || 'General overview'}
Additional context: ${context || 'None'}
Format: ${format}
Slide count: exactly ${tpl.slides} slides`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system,
        messages: [{ role: 'user', content: user_msg }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON returned from Claude');

    const script = JSON.parse(match[0]);
    return res.status(200).json(script);
  } catch (e) {
    console.error('[video/script]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
