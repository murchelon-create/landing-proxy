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
const BOT_TOKEN_OTZIV  = process.env.BOT_TOKEN_OTZIV;
const ADMIN_ID         = process.env.ADMIN_ID;
const GOOGLE_SHEET_ID  = process.env.GOOGLE_SHEET_ID;
const PORT             = process.env.PORT || 3001;

// ───── Сессии редактирования отзывов (в памяти) ───────────────────────────────
const editSessions = new Map();

// ───── Сегменты ──────────────────────────────────────────────────────────────
const SEGMENT_LABELS = {
  severe:   '🔥 Горячий — выраженные нарушения',
  moderate: '🌱 Тёплый — умеренные нарушения',
  mild:     '❄️ Холодный — лёгкие нарушения',
  good:     '✅ Без нарушений',
  HOT_LEAD:  '🔥 Горячий — выраженные нарушения',
  WARM_LEAD: '🌱 Тёплый — умеренные нарушения',
  COLD_LEAD: '❄️ Холодный — лёгкие нарушения',
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
  'never':        'Никогда не практиковал(а)',
  'rarely':       'Редко практикую',
  'sometimes':    'Иногда практикую',
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
  'reduce_stress':      'Снизить уровень стресса',
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

function translateValue(val) {
  if (Array.isArray(val)) return val.map(v => VALUE_LABELS[v] || v).join(', ');
  if (typeof val === 'number') return String(val);
  return VALUE_LABELS[val] || val || '';
}

function formatScale(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return `${String(num).padStart(2, '0')}/10`;
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return `${num}/100`;
}

function normalizeSegment(segment) {
  const key = String(segment || '');
  return SEGMENT_LABELS[key] || SEGMENT_LABELS[key.toLowerCase()] || segment || '';
}

const SOURCE_LABELS = {
  'landing':         '🌐 Лендинг',
  'bot_book_trial':  '🤖 Бот — пробное занятие',
  'bot':             '🤖 Бот',
};

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || 'landing';
}

// ───── Google Sheets авторизация ──────────────────────────────────────────────
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

// ───── Создать лист purchases ─────────────────────────────────────────────────
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
        requestBody: { values: [['Дата', 'Продукт', 'Цена', 'Telegram', 'Телефон', 'Email', 'Источник', 'Статус']] },
      });
    }
  } catch (e) {
    console.error('[SHEETS] ensurePurchasesSheet error:', e.message);
  }
}

// ───── Создать лист reviews ───────────────────────────────────────────────────
async function ensureReviewsSheet(sheets) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const exists = meta.data.sheets.some(s => s.properties.title === 'reviews');
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'reviews' } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'reviews!A1:K1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Дата', 'Имя', 'Telegram', 'Оценка', 'Отзыв',
            'Симптомы / с чем пришли', '', '',
            'Статус', 'Аватар URL', 'Фото URL',
          ]],
        },
      });
    }
  } catch (e) {
    console.error('[SHEETS] ensureReviewsSheet error:', e.message);
  }
}

// ───── Записать отзыв в reviews ───────────────────────────────────────────────
async function appendReviewToSheets(data) {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  await ensureReviewsSheet(sheets);

  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'reviews!A:A',
  });
  const rowIndex = (countRes.data.values?.length || 1) + 1;

  const date = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
  const conditionsText = Array.isArray(data.conditions)
    ? data.conditions.filter(Boolean).join(', ')
    : (data.conditions || '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'reviews!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        date,
        data.name             || '',
        data.telegramUsername || '',
        data.rating           || 5,
        data.content          || '',
        conditionsText,
        '',
        '',
        'на модерации',
        '',
        '',
      ]],
    },
  });
  console.log('[SHEETS] Отзыв записан от:', data.name, '| строка:', rowIndex);
  return rowIndex;
}

// ───── Записать заявку ────────────────────────────────────────────────────────
async function appendToSheets({ plan, contacts, source = 'landing' }) {
  const sheets = getSheetsClient();
  if (!sheets) return;
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
        source,
        'новая',
      ]],
    },
  });
}

// ───── Отправить уведомление о покупке ───────────────────────────────────────
async function sendTelegram({ plan, contacts, source = 'landing' }) {
  if (!BOT_TOKEN || !ADMIN_ID) return false;
  const text = [
    `🛒 Новая заявка`,
    `📍 Источник: ${sourceLabel(source)}`,
    ``,
    `📦 Продукт: ${plan.title}`,
    `💰 Цена: ${plan.price} ${plan.unit}`,
    ``,
    `👤 Контакты:`,
    `  📱 Telegram: ${contacts.telegram || '—'}`,
    `  📞 Телефон: ${contacts.phone || '—'}`,
    `  📧 Email: ${contacts.email || '—'}`,
  ].join('\n');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text }),
  });
  const data = await res.json();
  if (!data.ok) console.error('[TG] Ошибка:', data.description);
  return data.ok;
}

// ───── Уведомление о лиде ────────────────────────────────────────────────────
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
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_ID, text }),
  });
  const json = await res.json();
  if (!json.ok) console.error('[TG-LEAD] Ошибка:', json.description);
  return json.ok;
}

// ───── Запись лида в Sheet1 ───────────────────────────────────────────────────
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
  const meta = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: 'Sheet1!A1:T1' });
  const existingHeaders = meta.data.values?.[0] || [];
  const needsHeaders = existingHeaders.length === 0 || SHEET1_HEADERS.some((h, i) => existingHeaders[i] !== h);
  if (needsHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!A1:T1',
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET1_HEADERS] },
    });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Sheet1!A:T',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        date, 'landing',
        data.name || '', data.phone || '', data.email || '',
        normalizeSegment(data.segment), formatScore(data.score), data.profile || '',
        translateValue(data.age_group), translateValue(data.occupation),
        formatScale(data.stress_level), formatScale(data.sleep_quality),
        translateValue(data.breathing_method), translateValue(data.breathing_experience),
        translateValue(data.current_problems), translateValue(data.priority_problem),
        translateValue(data.main_goals), translateValue(data.time_commitment),
        translateValue(data.format_preferences), translateValue(data.chronic_conditions),
      ]],
    },
  });
  console.log('[SHEETS] Лид записан:', data.name);
}

// ───── GET /get-reviews ───────────────────────────────────────────────────────
app.get('/get-reviews', async (req, res) => {
  const sheets = getSheetsClient();
  if (!sheets) return res.json([]);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'reviews!A2:K',
    });

    const rows = response.data.values || [];

    const approved = rows
      .filter(row => String(row[8] || '').toLowerCase().trim() === 'одобрен')
      .map((row, idx) => ({
        id:               `sheet_${idx}`,
        date:             row[0]  || '',
        name:             row[1]  || '',
        telegramUsername: row[2]  || '',
        rating:           Number(row[3]) || 5,
        content:          row[4]  || '',
        fullContent:      row[4]  || '',
        conditions:       row[5]
          ? row[5].split(',').map(s => s.trim()).filter(Boolean)
          : [],
        avatar:           row[9]  || null,
        image:            row[10] || '',
        verified:         true,
      }));

    console.log(`[GET-REVIEWS] Отдаём ${approved.length} одобренных отзывов`);
    res.json(approved);
  } catch (e) {
    console.error('[GET-REVIEWS] Ошибка:', e.message);
    res.json([]);
  }
});

// ───── POST /notify ───────────────────────────────────────────────────────────
app.post('/notify', async (req, res) => {
  const { plan, contacts, source = 'landing' } = req.body;
  if (!plan?.title || !contacts?.telegram) {
    return res.status(400).json({ ok: false, error: 'Missing plan.title or contacts.telegram' });
  }
  const [tgResult, sheetsResult] = await Promise.allSettled([
    sendTelegram({ plan, contacts, source }),
    appendToSheets({ plan, contacts, source }),
  ]);
  const tgOk = tgResult.status === 'fulfilled' && tgResult.value === true;
  if (tgResult.status === 'rejected')     console.error('[NOTIFY] Telegram error:', tgResult.reason?.message);
  if (sheetsResult.status === 'rejected') console.error('[NOTIFY] Sheets error:',   sheetsResult.reason?.message);
  res.json({ ok: tgOk, sheets: sheetsResult.status === 'fulfilled' });
});

// ───── POST /notify-lead ──────────────────────────────────────────────────────
app.post('/notify-lead', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: 'Missing name' });
  const [tgResult, sheetsResult] = await Promise.allSettled([
    sendLeadTelegram(req.body),
    appendLeadToSheets(req.body),
  ]);
  const tgOk = tgResult.status === 'fulfilled' && tgResult.value === true;
  if (tgResult.status === 'rejected')     console.error('[NOTIFY-LEAD] Telegram error:', tgResult.reason?.message);
  if (sheetsResult.status === 'rejected') console.error('[NOTIFY-LEAD] Sheets error:',   sheetsResult.reason?.message);
  res.json({ ok: tgOk, sheets: sheetsResult.status === 'fulfilled' });
});

// ───── POST /submit-review ────────────────────────────────────────────────────
app.post('/submit-review', async (req, res) => {
  const { name, content, telegramUsername, rating, conditions } = req.body;
  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'Missing name or content' });
  }

  const stars = '★'.repeat(Number(rating) || 5) + '☆'.repeat(5 - (Number(rating) || 5));
  const tgLink = telegramUsername ? `https://t.me/${telegramUsername.replace('@', '')}` : null;
  const conditionsText = Array.isArray(conditions) && conditions.length
    ? conditions.join(', ')
    : '—';

  const text = [
    `⭐ Новый отзыв — на модерации`,
    ``,
    `👤 Имя: ${name}`,
    telegramUsername ? `📱 Telegram: ${telegramUsername} ${tgLink}` : `📱 Telegram: —`,
    `🌟 Оценка: ${stars}`,
    ``,
    `🏷 С чем пришёл(а): ${conditionsText}`,
    ``,
    `💬 Отзыв:`,
    content,
  ].join('\n');

  let rowIndex = null;
  try {
    rowIndex = await appendReviewToSheets(req.body);
  } catch (e) {
    console.error('[REVIEW] Sheets error:', e.message);
  }

  const token = BOT_TOKEN_OTZIV || BOT_TOKEN;
  if (token && ADMIN_ID && rowIndex) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Одобрить',       callback_data: `approve_${rowIndex}` },
              { text: '✏️ Редактировать',  callback_data: `edit_${rowIndex}`    },
              { text: '❌ Отклонить',      callback_data: `reject_${rowIndex}`  },
            ]],
          },
        }),
      });
      const json = await r.json();
      if (!json.ok) console.error('[REVIEW-TG] Ошибка:', json.description);
    } catch (e) {
      console.error('[REVIEW-TG] fetch error:', e.message);
    }
  }

  res.json({ ok: true, status: 'pending_moderation' });
});

// ───── POST /tg-webhook ───────────────────────────────────────────────────────
app.post('/tg-webhook', async (req, res) => {
  const token = BOT_TOKEN_OTZIV || BOT_TOKEN;

  const cb = req.body?.callback_query;
  if (cb) {
    const [action, rowIndex] = cb.data.split('_');
    const sheets = getSheetsClient();

    if (action === 'approve') {
      if (sheets) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `reviews!I${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['одобрен']] },
        });
      }
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: '✅ Отзыв одобрен' }),
      });
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [] },
        }),
      });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_ID, text: `✅ Отзыв (строка ${rowIndex}) одобрен и опубликован на сайте` }),
      });
    }

    else if (action === 'reject') {
      if (sheets) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `reviews!I${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['отклонён']] },
        });
      }
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: '❌ Отзыв отклонён' }),
      });
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [] },
        }),
      });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_ID, text: `❌ Отзыв (строка ${rowIndex}) отклонён` }),
      });
    }

    else if (action === 'edit') {
      editSessions.set(String(cb.from.id), { rowIndex });
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: '✏️ Жду исправленный текст...' }),
      });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `✏️ Напишите исправленный текст отзыва одним сообщением:\n\n(для отмены отправьте /cancel)`,
        }),
      });
    }

    return res.sendStatus(200);
  }

  const msg = req.body?.message;
  if (msg && msg.text && String(msg.from?.id) === String(ADMIN_ID)) {
    const session = editSessions.get(String(msg.from.id));

    if (msg.text === '/cancel') {
      if (session) {
        editSessions.delete(String(msg.from.id));
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: ADMIN_ID, text: '↩️ Редактирование отменено' }),
        });
      }
      return res.sendStatus(200);
    }

    if (session) {
      const { rowIndex } = session;
      const sheets = getSheetsClient();
      if (sheets) {
        // ИСПРАВЛЕНО: values.batchUpdate вместо batchUpdate
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: GOOGLE_SHEET_ID,
          requestBody: {
            valueInputOption: 'RAW',
            data: [
              { range: `reviews!E${rowIndex}`, values: [[msg.text]] },
              { range: `reviews!I${rowIndex}`, values: [['одобрен']] },
            ],
          },
        });
      }
      editSessions.delete(String(msg.from.id));
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `✅ Отзыв (строка ${rowIndex}) отредактирован и одобрен`,
        }),
      });
    }
  }

  res.sendStatus(200);
});

// ───── GET /health ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      bot:        !!BOT_TOKEN,
      bot_otziv:  !!BOT_TOKEN_OTZIV,
      admin:      !!ADMIN_ID,
      sheets:     !!GOOGLE_SHEET_ID,
      sa:         !!process.env.GOOGLE_SERVICE_ACCOUNT,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Прокси запущен на порту ${PORT}`);
  console.log(`[SERVER] URL:         https://buteyko-api.bothost.tech`);
  console.log(`[SERVER] BOT_TOKEN:   ${BOT_TOKEN       ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] BOT_OTZIV:   ${BOT_TOKEN_OTZIV ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] Sheets:      ${GOOGLE_SHEET_ID  ? '✅' : '❌ не задан'}`);
  console.log(`[SERVER] SA JSON:     ${process.env.GOOGLE_SERVICE_ACCOUNT ? '✅' : '❌ не задан'}`);

  // Автоустановка webhook при старте
  const WEBHOOK_URL = 'https://buteyko-api.bothost.tech/tg-webhook';
  const token = BOT_TOKEN_OTZIV || BOT_TOKEN;
  if (token) {
    fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${WEBHOOK_URL}`)
      .then(r => r.json())
      .then(d => console.log('[WEBHOOK] Установлен:', d.ok))
      .catch(e => console.error('[WEBHOOK] Ошибка:', e.message));
  } else {
    console.log('[WEBHOOK] Токен не найден, webhook не установлен');
  }
});
