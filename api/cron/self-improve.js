export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/cron-jobs?job=self_improve&secret=${process.env.CRON_SECRET}`, { method: 'POST' });
  return Response.json(await r.json());
}
