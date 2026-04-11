// api/lib/unsub-token.js
// HMAC-SHA256 signed tokens for one-click email unsubscribe links.
// Uses Web Crypto API — works in both Node.js and Vercel Edge runtime.

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || 'sovereign-unsub';
}

async function importKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Returns a URL-safe base64 token for the given email address.
export async function signToken(email) {
  const key = await importKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase().trim()));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Returns true if token is valid for the given email.
export async function verifyToken(email, token) {
  try {
    const expected = await signToken(email.toLowerCase().trim());
    return expected === token;
  } catch {
    return false;
  }
}

// Returns the full unsubscribe URL for use in email headers and links.
export async function unsubscribeUrl(email, baseUrl) {
  const base = baseUrl || 'https://sovereigncmd.xyz';
  const token = await signToken(email);
  return `${base}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}
