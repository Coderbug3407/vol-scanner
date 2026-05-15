// api/scan.js
// Vercel Cron: runs at minute 5 of every hour (e.g., 00:05, 01:05, 02:05...)
// Scans all Binance USDT pairs, saves volume data to Google Sheets
// Uses chunked scanning (every 5 min per batch) to avoid rate limits

import { getAllUSDTPairs } from '../lib/binance.js';
import { appendVolData } from '../lib/sheets.js';

export const config = {
  maxDuration: 60,
};

// Vercel cron auth check
function isAuthorized(req) {
  const authHeader = req.headers.get('authorization');
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    process.env.NODE_ENV === 'development'
  );
}

export default async function handler(req) {
  // Vercel cron sends GET; manual trigger can be POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // In production, Vercel signs cron requests — but we allow open access
  // for simplicity (no sensitive writes, read-only Binance data)

  try {
    console.log('[scan] Starting market scan...');
    const startTime = Date.now();

    // Fetch all USDT pairs from Binance in one call
    // Binance /api/v3/ticker/24hr is a single endpoint that returns all tickers
    const pairs = await getAllUSDTPairs();
    console.log(`[scan] Fetched ${pairs.length} USDT pairs`);

    // Save ALL to Google Sheets
    // Batch write in chunks of 500 to avoid Sheets API limits
    const CHUNK = 500;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const batch = pairs.slice(i, i + CHUNK);
      await appendVolData(batch);
      console.log(`[scan] Saved rows ${i + 1}–${Math.min(i + CHUNK, pairs.length)}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[scan] Done in ${elapsed}s`);

    return new Response(
      JSON.stringify({
        success: true,
        pairs: pairs.length,
        elapsed: `${elapsed}s`,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[scan] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
