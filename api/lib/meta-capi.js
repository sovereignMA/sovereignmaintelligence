// api/lib/meta-capi.js
// Meta Conversions API helper — server-side event forwarding with SHA-256 user hashing
// Pixel ID and API version come from meta-config.js  |  Token: META_ACCESS_TOKEN env var

import crypto from 'crypto';
import { PIXEL_ID, API_VERSION } from './meta-config.js';

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

/**
 * Send one event to the Meta Conversions API.
 *
 * @param {object} opts
 * @param {string}  opts.event_name        Standard or custom event name
 * @param {string}  [opts.event_id]        Dedup ID — share with browser fbq() call
 * @param {object}  [opts.user_data]       { email, first_name, last_name, phone, ip, user_agent, fbc, fbp, external_id }
 * @param {object}  [opts.custom_data]     { currency, value, content_name, ... }
 * @param {string}  [opts.event_source_url]
 */
export async function sendMetaEvent({ event_name, event_id, user_data = {}, custom_data = {}, event_source_url }) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) { console.warn('[meta-capi] META_ACCESS_TOKEN not set — skipping'); return; }

  const ud = {};
  if (user_data.email)       ud.em          = [sha256(user_data.email)];
  if (user_data.phone)       ud.ph          = [sha256(user_data.phone)];
  if (user_data.first_name)  ud.fn          = [sha256(user_data.first_name)];
  if (user_data.last_name)   ud.ln          = [sha256(user_data.last_name)];
  if (user_data.external_id) ud.external_id = [sha256(user_data.external_id)];
  if (user_data.ip)          ud.client_ip_address  = user_data.ip;
  if (user_data.user_agent)  ud.client_user_agent  = user_data.user_agent;
  if (user_data.fbc)         ud.fbc = user_data.fbc;
  if (user_data.fbp)         ud.fbp = user_data.fbp;

  const evt = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_id: event_id || crypto.randomUUID(),
    event_source_url: event_source_url || 'https://sovereigncmd.xyz',
    user_data: ud,
  };
  if (Object.keys(custom_data).length) evt.custom_data = custom_data;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [evt] }) }
    );
    const result = await res.json();
    if (!res.ok || result?.error) console.error(`[meta-capi] ${event_name} error:`, result?.error?.message || JSON.stringify(result));
    else                          console.log(`[meta-capi] ${event_name} sent — events_received:${result.events_received}`);
    return result;
  } catch (e) {
    console.error('[meta-capi] fetch error:', e.message);
  }
}
