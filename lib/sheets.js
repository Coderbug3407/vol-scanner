// lib/sheets.js
// Google Sheets integration for storing volume data

import { google } from 'googleapis';

function getAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function appendVolData(rows) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // Ensure header row exists on first run
  await ensureHeader(sheets, spreadsheetId);

  // Append rows: [timestamp, symbol, vol24h, priceChange24h, price]
  const values = rows.map(r => [
    r.timestamp,
    r.symbol,
    r.volume24h,
    r.priceChange24h,
    r.price,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'RawData!A:E',
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

async function ensureHeader(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawData!A1:E1',
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'RawData!A1:E1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Timestamp', 'Symbol', 'Volume24h_USDT', 'PriceChange24h_%', 'Price_USDT']],
      },
    });
  }
}

// Read recent volume history for a symbol (last N hours)
export async function getVolumeHistory(symbol, hours = 6) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawData!A:E',
  });

  if (!res.data.values) return [];
  const rows = res.data.values.slice(1); // skip header

  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  return rows
    .filter(r => r[1] === symbol && r[0] >= cutoff)
    .map(r => ({
      timestamp: r[0],
      symbol: r[1],
      volume24h: parseFloat(r[2]),
      priceChange24h: parseFloat(r[3]),
      price: parseFloat(r[4]),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// Get all symbols with their last N volume readings
export async function getAllSymbolsHistory(hours = 4) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RawData!A:E',
  });

  if (!res.data.values) return {};
  const rows = res.data.values.slice(1);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const map = {};
  for (const r of rows) {
    if (r[0] < cutoff) continue;
    const sym = r[1];
    if (!map[sym]) map[sym] = [];
    map[sym].push({
      timestamp: r[0],
      volume24h: parseFloat(r[2]),
      priceChange24h: parseFloat(r[3]),
      price: parseFloat(r[4]),
    });
  }

  // Sort each symbol's history chronologically
  for (const sym in map) {
    map[sym].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return map;
}

// Get set of symbols alerted within the last N hours (chống spam Telegram)
export async function getAlertedSymbols(withinHours = 3) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Alerts!A:B',
    });
    if (!res.data.values) return new Set();
    const cutoff = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
    const alerted = new Set();
    for (const row of res.data.values.slice(1)) {
      if (row[0] >= cutoff) alerted.add(row[1]);
    }
    return alerted;
  } catch {
    return new Set();
  }
}

// Stub — cooldown is enforced by reading Alerts sheet in getAlertedSymbols
export async function markAlerted(_symbols) {
  return true;
}

// Write alert log to Alerts sheet
export async function logAlert(alerts) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await ensureAlertsHeader(sheets, spreadsheetId);

  const values = alerts.map(a => [
    new Date().toISOString(),
    a.symbol,
    a.consecutiveHours,
    a.firstVol,
    a.lastVol,
    a.growthPct,
    a.priceChange24h,
    a.price,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Alerts!A:H',
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

async function ensureAlertsHeader(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Alerts!A1:H1',
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Alerts!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['AlertTime', 'Symbol', 'ConsecutiveHours', 'FirstVol', 'LastVol', 'GrowthPct', 'PriceChange24h%', 'CurrentPrice']],
      },
    });
  }
}
