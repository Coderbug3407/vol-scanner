// api/dashboard.js
// Returns current top volume movers as JSON for the dashboard

import { getAllUSDTPairs } from '../lib/binance.js';

export const config = {
  maxDuration: 30,
};

export default async function handler(req) {
  try {
    const pairs = await getAllUSDTPairs();

    // Sort by volume descending, take top 100
    const top = pairs
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 100);

    return new Response(JSON.stringify({ success: true, data: top }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate', // 5-min cache
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
