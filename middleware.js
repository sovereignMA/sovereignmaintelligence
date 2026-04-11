// Vercel Edge Middleware — server-side auth gate
// Runs before any HTML is served. Checks for sv_auth session cookie.
// Authenticated users (cookie present) are served immediately — no client-side flash.
// Unauthenticated users are redirected to /login before the page renders.
//
// Security note: sv_auth cookie is a presence signal set after client-side auth confirms.
// Actual authorization (JWT validation, role checks) is enforced at the API layer.
// This middleware prevents unauthenticated rendering and improves perceived security.

export const config = {
  matcher: [
    '/command',
    '/pipeline',
    '/intelligence',
    '/scout',
    '/comms',
    '/analytics',
    '/vault',
    '/security',
    '/mail',
    '/campaigns',
    '/admin',
    '/admin/is-policy',
    '/admin/asset-register',
    '/admin/ir-playbook',
    '/admin/bcp',
    '/admin/agents',
    '/admin/video',
  ],
};

const ADMIN_PATHS = new Set([
  '/admin',
  '/admin/is-policy',
  '/admin/asset-register',
  '/admin/ir-playbook',
  '/admin/bcp',
  '/admin/agents',
  '/admin/video',
]);

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';

  // Parse sv_auth cookie value
  const match = cookie.match(/(?:^|;\s*)sv_auth=([^;]+)/);
  const authVal = match ? match[1] : null;

  // No session at all — redirect to login
  if (!authVal) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname.replace(/^\//, ''));
    return Response.redirect(login, 302);
  }

  // Admin-only paths require sv_auth=admin
  if (ADMIN_PATHS.has(pathname) && authVal !== 'admin') {
    return Response.redirect(new URL('/command', request.url), 302);
  }

  // Authenticated — serve normally
  return;
}
