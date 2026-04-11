// api/cron/agent-runner.js
// Autonomous agent runner — picks pending tasks, runs Claude, writes results.
// Triggered by Vercel cron every 5 minutes, or manually via POST from the admin UI.
// Processes up to BATCH_SIZE tasks per invocation.
//
// CONTEXT INJECTION: before each task, top learnings from agent_learnings are
// prepended to the system prompt so every agent benefits from past outcomes.

export const config = { runtime: 'edge' };

import { sendEmail } from '../lib/send-email.js';
import { outreachTemplate, parseOutreachOutput } from '../lib/email-templates.js';
import { unsubscribeUrl as buildUnsubUrl } from '../lib/unsub-token.js';

const BATCH_SIZE = 3;
// Minimum confidence threshold to include a learning in the context injection.
// Prevents low-signal noise from polluting prompts early in the system's life.
const MIN_CONFIDENCE = 0.25;

const SYSTEM_PROMPTS = {
  research:
    'You are a research agent for a UK SaaS acquisition fund. Investigate the task thoroughly. ' +
    'Return a structured response with: **Summary**, **Key Findings** (bullet list), and **Recommended Actions**.',
  outreach:
    'You are a deal sourcing agent. Draft professional outreach for the described target. ' +
    'Return: **Subject Line**, **Email Body** (ready to send), and **Follow-up Note** (2 sentences).',
  analysis:
    'You are a business analysis agent for a UK SaaS acquisition fund. Analyse the situation described. ' +
    'Return: **Assessment**, **Risk Factors** (bullet list), **Opportunities** (bullet list), and **Decision Recommendation**.',
  pipeline:
    'You are a deal pipeline agent. Review the described deal or stage and return: ' +
    '**Stage Assessment**, **Blockers** (if any), **Next Steps** (numbered list), and **Priority Score** (1–10 with reasoning).',
  general:
    'You are an autonomous business intelligence agent for a UK SaaS acquisition fund. ' +
    'Complete the task and return clear, actionable, structured results.',
};

// Fetch top learnings for an agent type and return a context prefix string.
// Results are cached per agent_type for the lifetime of this handler invocation —
// tasks of the same type in one batch share the same learnings (avoids N+1 fetches).
// Returns '' on error or no qualifying learnings; never blocks task execution.
// Targets < 400 tokens injected (5 × ~20 word outcomes ≈ 200 tokens).
const _learningsCache = {};

async function buildContextPrefix(base, headers, agentType) {
  if (_learningsCache[agentType] !== undefined) return _learningsCache[agentType];
  try {
    const res = await fetch(
      `${base}/rest/v1/agent_learnings?agent_type=eq.${agentType}` +
      `&confidence=gte.${MIN_CONFIDENCE}&order=confidence.desc&limit=5&select=outcome`,
      { headers }
    );
    if (!res.ok) { _learningsCache[agentType] = ''; return ''; }
    const learnings = await res.json();
    const prefix = learnings.length
      ? `Based on previous outcomes for this agent type:\n${learnings.map(l => `• ${l.outcome}`).join('\n')}\n\n`
      : '';
    _learningsCache[agentType] = prefix;
    return prefix;
  } catch {
    _learningsCache[agentType] = '';
    return '';
  }
}

export default async function handler(req) {
  const method = req.method;

  // Auth: Vercel cron sends Bearer <CRON_SECRET> on GET.
  // Manual POST from admin UI sends Bearer <supabase_jwt> — verify admin role.
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  const isCron = method === 'GET' && token === process.env.CRON_SECRET;

  let isManual = false;
  if (method === 'POST' && token && token !== process.env.CRON_SECRET) {
    const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (userRes.ok) {
      const u = await userRes.json();
      const profRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${u.id}&select=role`,
        { headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        }}
      );
      const [prof] = profRes.ok ? await profRes.json() : [];
      isManual = ['admin','superadmin'].includes(prof?.role);
    }
  }

  if (!isCron && !isManual) return new Response('Unauthorized', { status: 401 });

  const base = process.env.SUPABASE_URL;
  const headers = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };

  const results = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    // Claim one todo task atomically: fetch then update only if still todo
    const pickRes = await fetch(
      `${base}/rest/v1/agent_tasks?status=eq.todo&order=priority.asc,created_at.asc&limit=1&select=*`,
      { headers }
    );
    if (!pickRes.ok) break;
    const [task] = await pickRes.json();
    if (!task) break;

    // Claim it (optimistic: only update if status is still todo)
    const claimRes = await fetch(
      `${base}/rest/v1/agent_tasks?id=eq.${task.id}&status=eq.todo`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'in_progress', started_at: new Date().toISOString() }),
      }
    );
    const affected = parseInt(claimRes.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    if (!claimRes.ok || affected === 0) continue;

    // ── Context injection ────────────────────────────────────────────────
    // Fetch learnings for this agent type and prepend to the system prompt.
    // Runs in parallel with nothing else so adds minimal latency.
    const contextPrefix = await buildContextPrefix(base, headers, task.agent_type);
    const basePrompt = SYSTEM_PROMPTS[task.agent_type] || SYSTEM_PROMPTS.general;
    const systemPrompt = contextPrefix + basePrompt;
    // ────────────────────────────────────────────────────────────────────

    const userMessage = [
      `**Task:** ${task.title}`,
      task.description ? `**Description:** ${task.description}` : '',
      task.input ? `**Input Data:**\n${JSON.stringify(task.input, null, 2)}` : '',
    ].filter(Boolean).join('\n\n');

    let output = null;
    let error = null;

    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      output = aiData.content?.[0]?.text ?? '';

      // ── Outreach email send ───────────────────────────────────────────
      // If this is an outreach task and input.email is provided, render
      // the branded HTML template and send via Resend.
      if (task.agent_type === 'outreach' && task.input?.email && output) {
        const recipientEmail = task.input.email;
        const { subject, body } = parseOutreachOutput(output);
        const unsub = await buildUnsubUrl(recipientEmail);
        const html = outreachTemplate({
          body,
          senderName:   task.input?.sender_name,
          senderTitle:  task.input?.sender_title,
          unsubscribeUrl: unsub,
        });
        const result = await sendEmail({
          to:             recipientEmail,
          subject:        subject || task.title,
          html,
          text:           body,
          from:           'Sovereign Acquisitions <outreach@sovereigncmd.xyz>',
          unsubscribeUrl: unsub,
        });

        // Log to outreach_log for compliance record
        if (result.ok) {
          await fetch(`${base}/rest/v1/outreach_log`, {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              user_id:       task.created_by,
              channel:       'email',
              direction:     'outbound',
              subject:       subject || task.title,
              body,
              status:        'sent',
              consent_given: true,
            }),
          });
        }

        output += result.suppressed
          ? `\n\n---\n⚠ ${recipientEmail} is suppressed (unsubscribed) — email not sent`
          : result.ok
            ? `\n\n---\n✓ Email sent to ${recipientEmail} (ID: ${result.id})`
            : `\n\n---\n⚠ Draft ready — send failed: ${result.error}`;
      }
      // ─────────────────────────────────────────────────────────────────
    } catch (e) {
      error = e.message;
    }

    // Write result back to agent_tasks
    await fetch(
      `${base}/rest/v1/agent_tasks?id=eq.${task.id}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          status: error ? 'failed' : 'complete',
          output: output ?? null,
          error: error ?? null,
          completed_at: new Date().toISOString(),
        }),
      }
    );

    results.push({ id: task.id, title: task.title, status: error ? 'failed' : 'complete' });
  }

  return Response.json({
    ok: true,
    processed: results.length,
    tasks: results,
    ts: new Date().toISOString(),
  });
}
