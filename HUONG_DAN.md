# 🚀 Hướng Dẫn Cài Đặt Binance Vol Scanner

## Tổng quan kiến trúc

```
Vercel Cron (mỗi giờ)
  └── /api/scan  →  Binance API  →  Google Sheets (lưu Vol 24h)
  └── /api/alert-check  →  Google Sheets  →  Phân tích trend  →  Telegram Bot

Dashboard: yourapp.vercel.app  →  /api/dashboard  →  Binance API (realtime)
```

---

## BƯỚC 1: Tạo Telegram Bot

1. Mở Telegram, tìm **@BotFather**
2. Gửi `/newbot`, đặt tên bot
3. Copy **Bot Token** (dạng: `7123456789:AAxxxxxxxxx`)
4. Lấy Chat ID:
   - Thêm bot vào group của bạn
   - Gửi bất kỳ tin nhắn nào vào group
   - Truy cập: `https://api.telegram.org/bot{TOKEN}/getUpdates`
   - Copy giá trị `"id"` trong `"chat"` (số âm với group, dạng `-100xxxxxxx`)

---

## BƯỚC 2: Tạo Google Sheet + Service Account

### 2a. Tạo Google Sheet
1. Vào [sheets.google.com](https://sheets.google.com), tạo sheet mới
2. Đặt tên: **Binance Vol Scanner**
3. Tạo 2 tab: **RawData** và **Alerts**
4. Copy **Sheet ID** từ URL:
   `https://docs.google.com/spreadsheets/d/`**`1Abc...XYZ`**`/edit`

### 2b. Tạo Service Account
1. Vào [console.cloud.google.com](https://console.cloud.google.com)
2. Tạo project mới (hoặc dùng project có sẵn)
3. Bật **Google Sheets API**: APIs & Services → Enable APIs → tìm "Sheets API"
4. Tạo Service Account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Đặt tên: `vol-scanner`
   - Vai trò: Editor
5. Tạo Key:
   - Click vào service account → Keys → Add Key → JSON
   - Download file JSON
6. Từ file JSON lấy:
   - `client_email` → **GOOGLE_SERVICE_ACCOUNT_EMAIL**
   - `private_key` → **GOOGLE_PRIVATE_KEY**

### 2c. Chia sẻ Sheet với Service Account
- Mở Google Sheet
- Share → nhập email của service account (`vol-scanner@...iam.gserviceaccount.com`)
- Quyền: **Editor**

---

## BƯỚC 3: Deploy lên Vercel

### 3a. Push code lên GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vol-scanner.git
git push -u origin main
```

### 3b. Import vào Vercel
1. Vào [vercel.com](https://vercel.com) → New Project
2. Import repo GitHub vừa tạo
3. Framework: **Other**
4. Click **Deploy**

### 3c. Thêm Environment Variables
Vào Vercel → Project → Settings → Environment Variables, thêm:

| Key | Value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAxxxxxxxxx` |
| `TELEGRAM_CHAT_ID` | `-100xxxxxxxxx` |
| `GOOGLE_SHEET_ID` | `1Abcxxxxxxxxx` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `vol-scanner@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Nội dung private key (bao gồm cả `-----BEGIN...-----`) |

**Lưu ý `GOOGLE_PRIVATE_KEY`**: Copy nguyên dòng từ file JSON, giữ nguyên `\n`:
```
"-----BEGIN RSA PRIVATE KEY-----\nMIIExxxxxxxx\n-----END RSA PRIVATE KEY-----\n"
```

### 3d. Redeploy sau khi thêm ENV
Deployments → chọn build mới nhất → Redeploy

---

## BƯỚC 4: Test hệ thống

### Test thủ công (sau khi deploy)
```
# Quét thị trường ngay:
GET https://yourapp.vercel.app/api/scan

# Kiểm tra cảnh báo ngay:
GET https://yourapp.vercel.app/api/alert-check

# Xem top volume:
GET https://yourapp.vercel.app/api/dashboard
```

### Kiểm tra Cron đang chạy
Vercel → Project → Functions → xem logs của `/api/scan` và `/api/alert-check`

---

## Cấu hình hệ thống

### Lịch chạy (vercel.json)
| Job | Cron | Ý nghĩa |
|-----|------|---------|
| `/api/scan` | `5 * * * *` | Chạy lúc :05 mỗi giờ (sau khi Vol 24h Binance cập nhật) |
| `/api/alert-check` | `0 * * * *` | Chạy lúc :00 mỗi giờ, phân tích trend |

### Ngưỡng cảnh báo (api/alert-check.js)
```js
const MIN_CONSECUTIVE_HOURS = 3;    // Vol tăng ≥ 3 giờ liên tiếp
const MIN_VOL_USDT = 500_000;       // Vol tối thiểu 500K USDT
const MIN_GROWTH_PCT_PER_HOUR = 2;  // Tăng tối thiểu 2%/giờ
```
Chỉnh các giá trị này theo ý muốn.

---

## Cấu trúc dữ liệu Google Sheets

### Sheet: RawData
| Timestamp | Symbol | Volume24h_USDT | PriceChange24h_% | Price_USDT |
|-----------|--------|----------------|------------------|------------|
| 2026-05-15T07:05:00Z | BTCUSDT | 2500000000 | 3.21 | 68500 |
| 2026-05-15T07:05:00Z | ETHUSDT | 850000000 | 2.15 | 3800 |

### Sheet: Alerts
| AlertTime | Symbol | ConsecutiveHours | FirstVol | LastVol | GrowthPct | PriceChange24h% | CurrentPrice |
|-----------|--------|-----------------|---------|---------|----------|-----------------|-------------|

---

## Giải thích logic Vol Scanner

### Tại sao Vol 24h có thể phát hiện tích lũy?
- Vol 24h là **rolling window** — mỗi giờ Binance trượt cửa sổ 1 giờ
- Nếu Vol **tăng liên tục qua 3h**: nghĩa là trong 3 giờ qua, mỗi giờ có nhiều giao dịch hơn 24h trước
- Đây là dấu hiệu **tích lũy / pump** đang diễn ra

### Ví dụ cảnh báo
```
🚨 CẢNH BÁO VOLUME TĂNG MẠNH
📅 15/05/2026, 14:00:05

🔥 XYZUSDT
   Vol 24h: 45.2M USDT (+127.3%)
   📈 Giá: 0.04114 | Đổi 24h: +39.36%
   ⏱ Vol tăng liên tục: 4h
```

---

## Giới hạn Free Tier Vercel

| Tài nguyên | Free | Dùng bởi project |
|-----------|------|-----------------|
| Serverless Function invocations | 100,000/tháng | ~1,440/tháng ✅ |
| Function Duration | 100 GB-hours | << 1 GB-hour ✅ |
| Cron Jobs | 2 cron jobs | 2 ✅ |
| Bandwidth | 100 GB | << 1 GB ✅ |

**Hoàn toàn nằm trong free tier!**

---

## Troubleshooting

### Bot không gửi được Telegram
→ Kiểm tra `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`
→ Đảm bảo bot đã được thêm vào group và có quyền gửi tin

### Lỗi Google Sheets
→ Kiểm tra service account email đã được share vào sheet chưa
→ Kiểm tra `GOOGLE_PRIVATE_KEY` có đầy đủ `\n` chưa

### Không thấy dữ liệu trong sheet
→ Gọi thủ công: `GET /api/scan` và xem logs trong Vercel Functions
