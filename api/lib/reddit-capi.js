// api/lib/reddit-capi.js
// Reddit Conversions API helper — server-side event forwarding with SHA-256 user hashing
// Pixel ID: a2_itp5sg1ycosw  |  Tokens: REDDIT_CAPI_ACCESS_TOKEN + REDDIT_ADS_ACCOUNT_ID env vars

import crypto from 'crypto';

const CAPI_BASE = 'https://ads-api.reddit.com/api/v2.0/conversions/events';

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

/**
 * Send one event to the Reddit Conversions API.
 *
 * @param {object} opts
 * @param {string}  opts.event_type       e.g. 'Purchase', 'SignUp', 'Lead', 'PageVisit'
 * @param {string}  [opts.click_id]       rdt_cid captured from ad click URL
 * @param {object}  [opts.user_data]      { email, external_id, ip, user_agent, uuid }
 * @param {object}  [opts.event_metadata] { currency, value_decimal, conversion_id, item_count, products }
 */
export async function sendRedditEvent({ event_type, click_id, user_data = {}, event_metadata = {} }) {
  const token      = process.env.REDDIT_CAPI_ACCESS_TOKEN;
  const account_id = process.env.REDDIT_ADS_ACCOUNT_ID;
  if (!token || !account_id) {
    console.warn('[reddit-capi] REDDIT_CAPI_ACCESS_TOKEN or REDDIT_ADS_ACCOUNT_ID not set — skipping');
    return;
  }

  const user = {};
  if (user_data.email)       user.email       = sha256(user_data.email);
  if (user_data.external_id) user.external_id = sha256(user_data.external_id);
  if (user_data.ip)          user.ip_address  = user_data.ip;
  if (user_data.user_agent)  user.user_agent  = user_data.user_agent;
  if (user_data.uuid)        user.uuid        = user_data.uuid;

  const event = {
    event_at: new Date().toISOString(),
    event_type: { tracking_type: event_type },
    user,
    event_metadata: {
      conversion_id: event_metadata.conversion_id || crypto.randomUUID(),
      ...event_metadata,
    },
  };
  if (click_id) event.click_id = click_id;

  try {
    const res = await fetch(`${CAPI_BASE}/${account_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_mode: false, events: [event] }),
    });
    const result = await res.json();
    if (!res.ok || result?.status === 'error') {
      console.error(`[reddit-capi] ${event_type} error:`, result?.message || JSON.stringify(result));
    } else {
      console.log(`[reddit-capi] ${event_type} sent`);
    }
    return result;
  } catch (e) {
    console.error('[reddit-capi] fetch error:', e.message);
  }
}
