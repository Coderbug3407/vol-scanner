// api/trigger.js
// Manual trigger endpoint for testing — POST /api/trigger?action=scan|alert

export const config = { maxDuration: 60 };

export default async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'scan';

  try {
    const target = action === 'alert'
      ? `${url.origin}/api/alert-check`
      : `${url.origin}/api/scan`;

    const res = await fetch(target, { method: 'GET' });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
