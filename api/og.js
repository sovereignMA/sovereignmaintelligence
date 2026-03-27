// Dynamic OG image generator
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') || 'Project Sovereign';
  const sub = searchParams.get('sub') || 'UK SaaS M&A Command Engine';

  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0a0a0f"/>
    <rect x="2" y="2" width="1196" height="626" rx="12" fill="none" stroke="#c9a84c" stroke-width="2" opacity="0.3"/>
    <text x="600" y="250" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="60" fill="#fff">${escXml(title)}</text>
    <text x="600" y="320" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#c9a84c">${escXml(sub)}</text>
    <text x="240" y="460" text-anchor="middle" font-family="monospace" font-size="36" font-weight="700" fill="#c9a84c">21</text>
    <text x="240" y="490" text-anchor="middle" font-family="monospace" font-size="14" fill="#6b6b80">AI AGENTS</text>
    <text x="480" y="460" text-anchor="middle" font-family="monospace" font-size="36" font-weight="700" fill="#2dd4bf">4-8×</text>
    <text x="480" y="490" text-anchor="middle" font-family="monospace" font-size="14" fill="#6b6b80">ENTRY EBITDA</text>
    <text x="720" y="460" text-anchor="middle" font-family="monospace" font-size="36" font-weight="700" fill="#a78bfa">15-30×</text>
    <text x="720" y="490" text-anchor="middle" font-family="monospace" font-size="14" fill="#6b6b80">EXIT MULTIPLE</text>
    <text x="960" y="460" text-anchor="middle" font-family="monospace" font-size="36" font-weight="700" fill="#4ade80">£0 PGs</text>
    <text x="960" y="490" text-anchor="middle" font-family="monospace" font-size="14" fill="#6b6b80">PERSONAL RISK</text>
    <text x="600" y="580" text-anchor="middle" font-family="monospace" font-size="16" fill="#4a4a5c">sovereigncmd.xyz</text>
  </svg>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

function escXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
