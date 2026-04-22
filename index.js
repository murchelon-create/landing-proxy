import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { google } from 'googleapis';

const app = express();
app.use(express.json());

// ───── CORS — разрешаем только лендинг ──────────────────────────────────────
app.use(cors({
  origin: [
    'https://dyhanie-buteiko72.ru',
    'https://www.dyhanie-buteiko72.ru',
    'https://buteyko-api.bothost.tech',
    'https://murchelon-create.github.io',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET', 'POST'],
}));

// ───── Переменные окружения ──────────────────────────────────────────────────
const BOT_TOKEN          = process.env.BOT_TOKEN;
const ADMIN_ID           = process.env.ADMIN_ID;
const GOOGLE_SHEET_ID    = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PORT               = process.env.PORT || 3001;

// ───── Google Sheets авторизация ─────────────────────────────────────────────
function getSheetsClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) return null;
  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ───── Создать лист purchases если не существует ─────────────────────────────
async function ensurePurchasesSheet(sheets) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const exists = meta.data.sheets.some(s => s.properties.title === 'purchases');
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'purchases' } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'purchases!A1:H1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Дата', 'Продукт', 'Цена', 'Telegram', 'Телефон', 'Email', 'Источник', 'Статус']],
        },
      });
      console.log('[SHEETS] Лист purchases создан');
    }
  } catch (e) {
    console.error('[SHEETS] ensurePurchasesSheet error:', e.message);
  }
}

// ───── Записать заявку в Sheets ──────────────────────────────────────────────
async function appendToSheets({ plan, contacts }) {
  const sheets = getSheetsClient();
  if (!sheets || !GOOGLE_SHEET_ID) {
    console.warn('[SHEETS] Не настроен — пропускаем запись');
    return;
  }
  await ensurePurchasesSheet(sheets);
  const date = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'purchases!A:H',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        date,
        plan.title      || '',
        `${plan.price} ${plan.unit}` || '',
        contacts.telegram || '',
        contacts.phone    || '',
        contacts.email    || '',
        'landing',
        'новая',
      ]],
    },
  });
  console.log('[SHEETS] Запись добавлена:', plan.title);
}

// ───── Отправить Telegram-уведомление ────────────────────────────────────────
async function sendTelegram({ plan, contacts }) {
  if (!BOT_TOKEN || !ADMIN_ID) {
    console.warn('[TG] BOT_TOKEN или ADMIN_ID не заданы');
    return false;
  }
  const text = [
    `🛒 *Заявка на покупку с лендинга*`,
    ``,
    `📦 Продукт: *${plan.title}*`,
    `💰 Цена: ${plan.price} ${plan.unit}`,
    ``,
    `👤 Контакты:`,
    `  📱 Telegram: ${contacts.telegram || '—'}`,
    `  📞 Телефон: ${contacts.phone || '—'}`,
    `  📧 Email: ${contacts.email || '—'}`,
  ].join('\n');

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' }),
    }
  );
  const data = await res.json();
  if (!data.ok) console.error('[TG] Ошибка:', data.description);
  return data.ok;
}

// ───── POST /notify ───────────────────────────────────────────────────────────
app.post('/notify', async (req, res) => {
  const { plan, contacts } = req.body;

  if (!plan?.title || !contacts?.telegram) {
    return res.status(400).json({ ok: false, error: 'Missing plan.title or contacts.telegram' });
  }

  const [tgResult, sheetsResult] = await Promise.allSettled([
    sendTelegram({ plan, contacts }),
    appendToSheets({ plan, contacts }),
  ]);

  const tgOk = tgResult.status === 'fulfilled' && tgResult.value === true;

  if (tgResult.status === 'rejected') console.error('[NOTIFY] Telegram error:', tgResult.reason?.message);
  if (sheetsResult.status === 'rejected') console.error('[NOTIFY] Sheets error:', sheetsResult.reason?.message);

  res.json({ ok: tgOk, sheets: sheetsResult.status === 'fulfilled' });
});

// ───── GET /health ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      bot:    !!BOT_TOKEN,
      admin:  !!ADMIN_ID,
      sheets: !!GOOGLE_SHEET_ID,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Прокси запущен на порту ${PORT}`);
  console.log(`[SERVER] URL:      https://buteyko-api.bothost.tech`);
  console.log(`[SERVER] Telegram: ${BOT_TOKEN ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] Sheets:   ${GOOGLE_SHEET_ID ? '✅' : '❌ не задан'}`);
});
