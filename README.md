# landing-proxy

Прокси-сервер для лендинга [byteyko_lending](https://github.com/murchelon-create/byteyko_lending).

## Что делает

- Принимает заявки с лендинга (`POST /notify`)
- Отправляет Telegram-уведомление администратору
- Записывает заявку в Google Sheets (лист `purchases`)
- Скрывает токен бота от браузера

## Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/notify` | Принять заявку, уведомить Telegram + Sheets |
| GET | `/health` | Проверка работы сервера |

### POST /notify — тело запроса

```json
{
  "plan": {
    "title": "Пробное занятие",
    "price": "1 500",
    "unit": "₽ за занятие"
  },
  "contacts": {
    "telegram": "@username",
    "phone": "+7 999 000-00-00",
    "email": "example@mail.ru"
  }
}
```

## Деплой на Railway

1. Создать новый проект на [railway.com](https://railway.com)
2. Подключить этот репозиторий
3. Добавить переменные окружения (см. `.env.example`)
4. Settings → Networking → Generate Domain

## Переменные окружения

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | Токен Telegram-бота лендинга |
| `ADMIN_ID` | Telegram ID администратора (`981828628`) |
| `GOOGLE_SHEET_ID` | ID Google таблицы |
| `GOOGLE_CLIENT_EMAIL` | Email сервисного аккаунта Google |
| `GOOGLE_PRIVATE_KEY` | Приватный ключ RSA (с `\n`) |

## Лист purchases в Google Sheets

Лист создаётся автоматически при первой заявке.

| Колонка | Данные |
|---|---|
| A | Дата |
| B | Продукт |
| C | Цена |
| D | Telegram |
| E | Телефон |
| F | Email |
| G | Источник |
| H | Статус |
