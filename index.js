import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { google } from 'googleapis';

const app = express();
app.use(express.json());

// ───── CORS ───────────────────────────────────────────────────────────────────
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

// ───── Переменные окружения ───────────────────────────────────────────────────
const BOT_TOKEN        = process.env.BOT_TOKEN;
const ADMIN_ID         = process.env.ADMIN_ID;
const GOOGLE_SHEET_ID  = process.env.GOOGLE_SHEET_ID;
const PORT             = process.env.PORT || 3001;

// ───── Нормализация — эталон из breathing-lead-bot ───────────────────────────

const SEGMENT_LABELS = {
  good:     'Без нарушений',
  mild:     'Лёгкие нарушения',
  moderate: 'Умеренные нарушения',
  severe:   'Выраженные нарушения',
};

const VALUE_LABELS = {
  '18-30':          '18–30 лет',
  '31-45':          '31–45 лет',
  '46-60':          '46–60 лет',
  '60+':            '60+ лет',
  'for_child':      'Заполняю для ребёнка',
  'office_work':    'Офисная работа',
  'home_work':      'Работа дома / фриланс',
  'physical_work':  'Физический труд',
  'student':        'Учёба',
  'maternity_leave':'В декрете',
  'retired':        'На пенсии',
  'management':     'Руководящая должность',
  'chronic_stress':       'Хронический стресс, напряжение',
  'insomnia':             'Плохой сон, бессонница',
  'breathing_issues':     'Одышка, нехватка воздуха',
  'high_pressure':        'Повышенное давление',
  'headaches':            'Частые головные боли',
  'fatigue':              'Постоянная усталость',
  'anxiety':              'Тревожность, панические атаки',
  'concentration_issues': 'Проблемы с концентрацией',
  'back_pain':            'Боли в шее, плечах, спине',
  'digestion_issues':     'Проблемы с пищеварением',
  'nose':     'В основном носом',
  'mouth':    'Часто дышу ртом',
  'mixed':    'Попеременно носом и ртом',
  'unaware':  'Не обращаю внимания',
  'constantly': 'Постоянно (каждый день)',
  'often':      'Часто (несколько раз в неделю)',
  'yes_often':  'Да, часто ловлю себя на этом',
  'no':         'Нет, дышу нормально и глубоко',
  'rapid_shallow':      'Учащается, становится поверхностным',
  'breath_holding':     'Начинаю задерживать дыхание',
  'air_shortage':       'Чувствую нехватку воздуха',
  'mouth_breathing':    'Дышу ртом вместо носа',
  'no_change':          'Не замечаю изменений',
  'conscious_breathing':'Стараюсь дышать глубже',
  'few_times':    'Пробовал(а) пару раз, не пошло',
  'theory_only':  'Изучал(а) теорию, но не практиковал(а)',
  'regularly':    'Практикую регулярно (несколько раз в неделю)',
  'expert':       'Опытный практик (ежедневно)',
  '3-5_minutes':   '3–5 минут',
  '10-15_minutes': '10–15 минут',
  '20-30_minutes': '20–30 минут',
  '30+_minutes':   '30+ минут',
  'video':       'Видеоуроки с демонстрацией',
  'audio':       'Аудиопрактики с голосом',
  'text':        'Текст с картинками',
  'online_live': 'Живые онлайн-занятия',
  'individual':  'Индивидуальные консультации',
  'mobile_app':  'Мобильное приложение',
  'quick_relaxation':   'Быстро расслабляться в стрессе',
  'stress_resistance':  'Повысить стрессоустойчивость',
  'reduce_anxiety':     'Избавиться от тревожности и паники',
  'improve_sleep':      'Наладить качественный сон',
  'increase_energy':    'Повысить энергию и работоспособность',
  'normalize_pressure': 'Нормализовать давление/пульс',
  'improve_breathing':  'Улучшить работу лёгких и дыхания',
  'improve_focus':      'Улучшить концентрацию внимания',
  'weight_management':  'Поддержать процесс похудения',
  'general_health':     'Общее оздоровление организма',
  'respiratory_diseases':   'Астма / бронхит / ХОБЛ',
  'cardiovascular_diseases':'Гипертония / аритмия',
  'diabetes':               'Диабет 1 или 2 типа',
  'spine_problems':         'Остеохондроз / грыжи',
  'chronic_headaches':      'Мигрени / головные боли',
  'panic_disorder':         'Панические атаки / ВСД',
  'thyroid_diseases':       'Заболевания щитовидной железы',
  'digestive_diseases':     'Гастрит / язва / рефлюкс',
  'none':                   'Нет хронических заболеваний',
};

// Перевод одного или массива значений
function translateValue(val) {
  if (Array.isArray(val)) return val.map(v => VALUE_LABELS[v] || v).join(', ');
  if (typeof val === 'number') return String(val);
  return VALUE_LABELS[val] || val || '';
}

// Форматирование шкалы 0–10 → "05/10"
function formatScale(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return `${String(num).padStart(2, '0')}/10`;
}

// Форматирование индекса срочности 0–100 → "77/100"
function formatScore(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return `${num}/100`;
}

// Нормализация сегмента → человекочитаемый вид
function normalizeSegment(segment) {
  return SEGMENT_LABELS[String(segment || '').toLowerCase()] || segment || '';
}

// ───── Google Sheets авторизация через JSON целиком ───────────────────────────
function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw || !GOOGLE_SHEET_ID) return null;

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    console.error('[SHEETS] Не удалось распарсить GOOGLE_SERVICE_ACCOUNT:', e.message);
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ───── Создать лист purchases если не существует ──────────────────────────────
async function ensurePurchasesSheet(sheets) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const exists = meta.data.sheets.some(s => s.properties.title === 'purchases');
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'purchases' } } }] },
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

// ───── Записать заявку (покупку) в Sheets ─────────────────────────────────────
async function appendToSheets({ plan, contacts }) {
  const sheets = getSheetsClient();
  if (!sheets) {
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
        plan.title        || '',
        `${plan.price} ${plan.unit}`,
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

// ───── Отправить Telegram-уведомление (покупка) ───────────────────────────────
async function sendTelegram({ plan, contacts }) {
  if (!BOT_TOKEN || !ADMIN_ID) {
    console.warn('[TG] BOT_TOKEN или ADMIN_ID не заданы');
    return false;
  }
  const text = [
    `🛒 Заявка на покупку с лендинга`,
    ``,
    `📦 Продукт: ${plan.title}`,
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
      body: JSON.stringify({ chat_id: ADMIN_ID, text }),
    }
  );
  const data = await res.json();
  if (!data.ok) console.error('[TG] Ошибка:', data.description);
  return data.ok;
}

// ───── Telegram уведомление о новом лиде ─────────────────────────────────────
async function sendLeadTelegram(data) {
  if (!BOT_TOKEN || !ADMIN_ID) return false;

  const text = [
    `📋 Новый лид с анкеты лендинга`,
    ``,
    `👤 Имя: ${data.name}`,
    `📧 Email: ${data.email || '—'}`,
    `📞 Телефон: ${data.phone || '—'}`,
    ``,
    `📊 Результат: ${data.profile || '—'}`,
    `🎯 Сегмент: ${normalizeSegment(data.segment)}`,
    `⚡ Срочность: ${formatScore(data.score)}`,
    ``,
    `📝 Возраст: ${translateValue(data.age_group)}`,
    `💼 Деятельность: ${translateValue(data.occupation)}`,
    `🎯 Главная проблема: ${translateValue(data.priority_problem)}`,
    `🏆 Цели: ${translateValue(data.main_goals)}`,
  ].join('\n');

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_ID, text }),
    }
  );
  const json = await res.json();
  if (!json.ok) console.error('[TG-LEAD] Ошибка:', json.description);
  return json.ok;
}

// ───── Запись лида в Sheet1 (эталон: breathing-lead-bot/lead_transfer.js) ─────
const SHEET1_HEADERS = [
  'Дата', 'Источник', 'Имя', 'Телефон', 'Email',
  'Сегмент', 'Счёт', 'Профиль',
  'Возраст', 'Деятельность', 'Стресс', 'Сон',
  'Тип дыхания', 'Опыт практик', 'Проблемы',
  'Главная проблема', 'Цели', 'Время', 'Форматы', 'Хр. заболевания',
];

async function appendLeadToSheets(data) {
  const sheets = getSheetsClient();
  if (!sheets) return;

  const date = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });

  // Проверить заголовки Sheet1, выставить если пусто
  const meta = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Sheet1!A1:T1',
  });
  const existingHeaders = meta.data.values?.[0] || [];
  const needsHeaders = existingHeaders.length === 0 ||
    SHEET1_HEADERS.some((h, i) => existingHeaders[i] !== h);

  if (needsHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!A1:T1',
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET1_HEADERS] },
    });
    console.log('[SHEETS] Заголовки Sheet1 обновлены');
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Sheet1!A:T',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        date,
        'landing',
        data.name                           || '',
        data.phone                          || '',
        data.email                          || '',
        normalizeSegment(data.segment),
        formatScore(data.score),
        data.profile                        || '',
        translateValue(data.age_group),
        translateValue(data.occupation),
        formatScale(data.stress_level),
        formatScale(data.sleep_quality),
        translateValue(data.breathing_method),
        translateValue(data.breathing_experience),
        translateValue(data.current_problems),
        translateValue(data.priority_problem),
        translateValue(data.main_goals),
        translateValue(data.time_commitment),
        translateValue(data.format_preferences),
        translateValue(data.chronic_conditions),
      ]],
    },
  });
  console.log('[SHEETS] Лид записан:', data.name);
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
  if (tgResult.status === 'rejected')     console.error('[NOTIFY] Telegram error:', tgResult.reason?.message);
  if (sheetsResult.status === 'rejected') console.error('[NOTIFY] Sheets error:',   sheetsResult.reason?.message);

  res.json({ ok: tgOk, sheets: sheetsResult.status === 'fulfilled' });
});

// ───── POST /notify-lead (лиды с анкеты лендинга) ────────────────────────────
app.post('/notify-lead', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ ok: false, error: 'Missing name' });
  }

  const [tgResult, sheetsResult] = await Promise.allSettled([
    sendLeadTelegram(req.body),
    appendLeadToSheets(req.body),
  ]);

  const tgOk = tgResult.status === 'fulfilled' && tgResult.value === true;
  if (tgResult.status === 'rejected')     console.error('[NOTIFY-LEAD] Telegram error:', tgResult.reason?.message);
  if (sheetsResult.status === 'rejected') console.error('[NOTIFY-LEAD] Sheets error:',   sheetsResult.reason?.message);

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
      sa:     !!process.env.GOOGLE_SERVICE_ACCOUNT,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Прокси запущен на порту ${PORT}`);
  console.log(`[SERVER] URL:      https://buteyko-api.bothost.tech`);
  console.log(`[SERVER] Telegram: ${BOT_TOKEN ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] Sheets:   ${GOOGLE_SHEET_ID ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] SA JSON:  ${process.env.GOOGLE_SERVICE_ACCOUNT ? '✅' : '❌ не задан'}`);
});
