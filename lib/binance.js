// lib/binance.js
// Fetch all USDT spot pairs from Binance, filter out gold/silver/stablecoins

const EXCLUDED_KEYWORDS = [
  'XAU', 'XAG', 'PAXG', // Gold, Silver
  'USDC', 'BUSD', 'TUSD', 'USDP', 'FDUSD', 'DAI', 'USDD', // Stablecoins
  'EUR', 'GBP', 'BRL', 'TRY', 'ARS', // Fiat pairs
];

const BINANCE_API = 'https://api.binance.com';

export async function getAllUSDTPairs() {
  const res = await fetch(`${BINANCE_API}/api/v3/ticker/24hr`);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();

  return data
    .filter(t => {
      if (!t.symbol.endsWith('USDT')) return false;
      const base = t.symbol.replace('USDT', '');
      if (EXCLUDED_KEYWORDS.some(kw => base.includes(kw))) return false;
      if (parseFloat(t.quoteVolume) < 100000) return false; // Skip very low vol
      return true;
    })
    .map(t => ({
      symbol: t.symbol,
      base: t.symbol.replace('USDT', ''),
      price: parseFloat(t.lastPrice),
      priceChange24h: parseFloat(t.priceChangePercent),
      volume24h: parseFloat(t.quoteVolume), // Volume in USDT
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      timestamp: new Date().toISOString(),
    }));
}

// Split array into chunks for rate-limit-safe scanning
export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
