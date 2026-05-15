// api/alert-check.js
// Vercel Cron: chạy mỗi giờ lúc :00
// ĐIỀU KIỆN KÉP:
//   1) Vol 24h tăng LIÊN TỤC ≥ MIN_CONSECUTIVE_HOURS giờ
//   2) Mỗi giờ trong chuỗi đó Vol phải tăng ≥ MIN_GROWTH_PCT_PER_HOUR %
//   3) Tổng tăng cả chuỗi ≥ MIN_TOTAL_GROWTH_PCT %
// → Cả ba cùng đúng mới gửi Telegram

import { getAllSymbolsHistory, logAlert, getAlertedSymbols, markAlerted } from '../lib/sheets.js';
import { sendMessage, formatAlertMessage } from '../lib/telegram.js';

export const config = { maxDuration: 60 };

// ─── CẤU HÌNH NGƯỠNG CẢNH BÁO ───────────────────────────────────────────────
const MIN_CONSECUTIVE_HOURS = 3;    // Số giờ tăng liên tiếp tối thiểu
const MIN_GROWTH_PCT_PER_HOUR = 5;  // % tăng tối thiểu MỖI giờ
const MIN_TOTAL_GROWTH_PCT = 15;    // % tăng tổng cộng tối thiểu toàn chuỗi
const MIN_VOL_USDT = 500_000;       // Vol tối thiểu (USDT) lọc coin rác
const ALERT_COOLDOWN_HOURS = 3;     // Không gửi lại cùng coin trong N giờ
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    console.log('[alert-check] Bắt đầu phân tích vol trend...');

    const history = await getAllSymbolsHistory(8);
    const symbols = Object.keys(history);
    console.log(`[alert-check] Đang phân tích ${symbols.length} symbols`);

    const recentlyAlerted = await getAlertedSymbols(ALERT_COOLDOWN_HOURS);
    const alertList = [];
    const skippedLog = [];

    for (const symbol of symbols) {
      const readings = history[symbol];
      if (readings.length < MIN_CONSECUTIVE_HOURS + 1) continue;

      const lastReading = readings[readings.length - 1];
      if (lastReading.volume24h < MIN_VOL_USDT) continue;
      if (recentlyAlerted.has(symbol)) continue;

      // ── Tìm chuỗi tăng liên tục từ reading mới nhất ──────────────────────
      let streak = 0;
      let streakStart = readings.length - 1;

      for (let i = readings.length - 1; i >= 1; i--) {
        const prev = readings[i - 1].volume24h;
        const curr = readings[i].volume24h;
        if (prev <= 0) break;
        const growthPct = ((curr - prev) / prev) * 100;
        // Điều kiện 1 + 2: tăng liên tiếp VÀ đủ % mỗi giờ
        if (growthPct >= MIN_GROWTH_PCT_PER_HOUR) {
          streak++;
          streakStart = i - 1;
        } else {
          break;
        }
      }

      if (streak < MIN_CONSECUTIVE_HOURS) continue;

      // Điều kiện 3: tổng % tăng toàn chuỗi
      const firstInStreak = readings[streakStart];
      const totalGrowthPct = firstInStreak.volume24h > 0
        ? ((lastReading.volume24h - firstInStreak.volume24h) / firstInStreak.volume24h) * 100
        : 0;

      if (totalGrowthPct < MIN_TOTAL_GROWTH_PCT) {
        skippedLog.push({ symbol, streak, totalGrowthPct: totalGrowthPct.toFixed(1) });
        continue;
      }

      // Thu thập % tăng từng giờ trong chuỗi để hiển thị
      const hourlyGrowths = [];
      for (let i = streakStart + 1; i < readings.length; i++) {
        const prev = readings[i - 1].volume24h;
        const curr = readings[i].volume24h;
        hourlyGrowths.push(((curr - prev) / prev) * 100);
      }

      alertList.push({
        symbol,
        consecutiveHours: streak,
        firstVol: firstInStreak.volume24h,
        lastVol: lastReading.volume24h,
        growthPct: totalGrowthPct,
        hourlyGrowths,
        priceChange24h: lastReading.priceChange24h,
        price: lastReading.price,
      });
    }

    alertList.sort((a, b) =>
      b.consecutiveHours - a.consecutiveHours || b.growthPct - a.growthPct
    );

    console.log(`[alert-check] Kết quả: ${alertList.length} alerts`);
    if (skippedLog.length) console.log('[alert-check] Gần đủ:', JSON.stringify(skippedLog.slice(0, 5)));

    if (alertList.length > 0) {
      await logAlert(alertList);
      await markAlerted(alertList.map(a => a.symbol));

      const BATCH_SIZE = 10;
      for (let i = 0; i < alertList.length; i += BATCH_SIZE) {
        const batch = alertList.slice(i, i + BATCH_SIZE);
        const msg = formatAlertMessage(batch, {
          isFirst: i === 0,
          totalAlerts: alertList.length,
          batchNum: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(alertList.length / BATCH_SIZE),
          conditions: { MIN_CONSECUTIVE_HOURS, MIN_GROWTH_PCT_PER_HOUR, MIN_TOTAL_GROWTH_PCT },
        });
        await sendMessage(msg);
        if (i + BATCH_SIZE < alertList.length) await new Promise(r => setTimeout(r, 1200));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        symbolsAnalyzed: symbols.length,
        alertsTriggered: alertList.length,
        conditions: {
          minConsecutiveHours: MIN_CONSECUTIVE_HOURS,
          minGrowthPctPerHour: `${MIN_GROWTH_PCT_PER_HOUR}%`,
          minTotalGrowthPct: `${MIN_TOTAL_GROWTH_PCT}%`,
          minVolUsdt: MIN_VOL_USDT,
        },
        alerts: alertList.map(a => ({
          symbol: a.symbol,
          consecutiveHours: a.consecutiveHours,
          totalGrowthPct: a.growthPct.toFixed(2) + '%',
          hourlyGrowths: a.hourlyGrowths.map(g => g.toFixed(1) + '%'),
        })),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[alert-check] Lỗi:', err);
    try {
      await sendMessage(
        `❌ <b>Vol Scanner Error</b>\n<code>${err.message}</code>\n` +
        `🕐 ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
      );
    } catch {}
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
