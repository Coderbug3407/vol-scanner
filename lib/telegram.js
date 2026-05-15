// lib/telegram.js
// Send Telegram alerts via Bot API

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(text, parseMode = 'HTML') {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Telegram error:', err);
  }
  return res.ok;
}

export function formatAlertMessage(alerts, opts = {}) {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const {
    isFirst = true,
    totalAlerts = alerts.length,
    batchNum = 1,
    totalBatches = 1,
    conditions = {},
  } = opts;

  const batchLabel = totalBatches > 1 ? ` (${batchNum}/${totalBatches})` : '';

  const lines = alerts.map((a, idx) => {
    const volStr = formatVol(a.lastVol);
    const firstVolStr = formatVol(a.firstVol);
    const growth = a.growthPct >= 0 ? `+${a.growthPct.toFixed(1)}%` : `${a.growthPct.toFixed(1)}%`;
    const priceEmoji = a.priceChange24h >= 0 ? '📈' : '📉';

    // Hourly breakdown: e.g. +6.2% → +8.1% → +12.3%
    const hourlyStr = a.hourlyGrowths
      ? a.hourlyGrowths.map(g => (g >= 0 ? `+${g.toFixed(1)}` : g.toFixed(1)) + '%').join(' → ')
      : '';

    return (
      `🔥 <b>${a.symbol}</b>\n` +
      `   Vol: <code>${firstVolStr}</code> → <code>${volStr}</code> USDT (<b>${growth}</b>)\n` +
      (hourlyStr ? `   📊 Mỗi giờ: <code>${hourlyStr}</code>\n` : '') +
      `   ${priceEmoji} Giá: <code>${a.price.toFixed(6)}</code> | 24h: ${a.priceChange24h >= 0 ? '+' : ''}${a.priceChange24h.toFixed(2)}%\n` +
      `   ⏱ Tăng liên tục: <b>${a.consecutiveHours} giờ</b>`
    );
  });

  const condStr = conditions.MIN_CONSECUTIVE_HOURS
    ? `\n⚙️ Ngưỡng: ≥${conditions.MIN_CONSECUTIVE_HOURS}h | ≥${conditions.MIN_GROWTH_PCT_PER_HOUR}%/h | tổng ≥${conditions.MIN_TOTAL_GROWTH_PCT}%`
    : '';

  return (
    `🚨 <b>VOL TĂNG MẠNH${batchLabel}</b> — ${totalAlerts} coin\n` +
    `📅 ${time}${condStr}\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n━━━━━━━━━━━━━━━━━\n') +
    `\n\n<i>Binance Vol Scanner</i>`
  );
}

function formatVol(vol) {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(2)}K`;
  return vol.toFixed(2);
}

export async function sendStartupMessage() {
  return sendMessage(
    `✅ <b>Binance Vol Scanner đã khởi động</b>\n` +
    `📊 Đang quét toàn bộ thị trường USDT mỗi giờ\n` +
    `🔔 Cảnh báo khi vol tăng liên tục ≥ 3 giờ\n` +
    `🕐 ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
  );
}
