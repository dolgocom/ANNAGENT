# LOS — Life Operating System

Многоагентная AI-система управления жизнью и бизнесом через Telegram-бот.
CoS (Аня) — единственный человеческий интерфейс.

---

## Fresh setup (new Replit account)

> Следуй этим шагам строго по порядку после импорта репозитория с GitHub.

### 1. Добавь PostgreSQL базу данных
В Replit: **Tools → Database** → создай PostgreSQL БД.
Replit автоматически добавит `DATABASE_URL` в секреты.

### 2. Добавь остальные секреты
**Tools → Secrets** — добавь каждый из этих:

| Ключ | Где взять |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| `TELEGRAM_BOT_TOKEN` | @BotFather в Telegram → `/newbot` |
| `OURA_API_TOKEN` | https://cloud.ouraring.com/personal-access-tokens |
| `SESSION_SECRET` | любая случайная строка, ≥32 символа |

### 3. Установи зависимости и подними схему БД
```bash
pnpm install
pnpm --filter @workspace/db run push
```

### 4. Запусти сервер
Нажми **Run** (или запусти workflow `artifacts/api-server: API Server`).

### 5. Активируй Telegram-бот
Напиши `/start` боту в Telegram — бот сам зарегистрирует webhook и запомнит chat ID.

### 6. Проверь
```bash
curl localhost:80/api/healthz
```
Должно вернуть `{"status":"ok"}`.

---

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev   # запустить сервер (порт из $PORT)
pnpm run typecheck                             # полная проверка типов
pnpm run build                                 # typecheck + сборка
pnpm --filter @workspace/db run push           # применить изменения схемы БД
pnpm --filter @workspace/api-spec run codegen  # перегенерить API hooks из OpenAPI
```

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (`claude-sonnet-4-5`) via own API key
- Telegram: node-telegram-bot-api (webhook mode)
- Scheduler: node-cron (07:00 и 22:00 MSK)
- Biometrics: Oura Ring API
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

---

## Where things live

```
artifacts/api-server/src/
  agents/
    orchestrator.ts       — Master Orchestrator (утренняя/вечерняя последовательность)
    neuro-bio.ts          — Neuro & Bio Agent (Oura + ручной ввод)
    decision-support.ts   — Decision Support Agent (приоритеты + анализ решений)
  lib/
    telegram.ts           — Telegram бот, клавиатуры, отправка сообщений
    telegram-handler.ts   — обработчик сообщений и callback-кнопок
    oura.ts               — Oura Ring API клиент
    scheduler.ts          — cron-планировщик (07:00 / 22:00 MSK)
    anthropic.ts          — обёртка над Anthropic SDK
    logger.ts             — pino logger
  routes/
    los.ts                — REST API эндпоинты LOS
    telegram.ts           — /api/telegram/webhook endpoint

lib/db/src/schema/
  biometrics.ts           — биометрика (Oura + ручной ввод)
  agent_memory.ts         — память агентов
  digests.ts              — история дайджестов
  cos_inputs.ts           — сырые вводы от Ани
```

---

## Architecture decisions

- Система **только рекомендует**, никогда не действует самостоятельно
- Все решения принимает Аня (CoS) — единственный человеческий интерфейс
- Язык системы — **русский**
- Часовой пояс — Москва (MSK, UTC+3), cron jobs в UTC (04:00 = 07:00 MSK, 19:00 = 22:00 MSK)
- Агенты запускаются **последовательно**, не параллельно
- Telegram бот в **webhook mode** (не polling) — надёжнее на Replit

---

## Product — MVP (Фаза 1)

- **Master Orchestrator** — утренний дайджест в 07:00 MSK, вечерний в 22:00 MSK
- **Neuro & Bio Agent** — анализирует Oura Ring + ручные вводы Ани, выдаёт рекомендации
- **Decision Support Agent** — утренние приоритеты + анализ конкретных решений по запросу
- **Telegram Bot (CoS интерфейс)** — кнопочный UI + команды

---

## Telegram команды

- `/start` — активация, регистрация webhook
- `/morning` — интерактивный утренний чек-лист (кнопки)
- `/decide <описание>` — анализ решения
- `/status` — статус всех агентов
- `/help` — справка

### Утренний чек-лист (поля)
| Поле | Тип | Варианты |
|---|---|---|
| Энергия | 1–10 | числа |
| Фокус | 1–10 | числа |
| Настроение | 1–10 | числа |
| Тренировка | выбор | нет / кардио / силовая / йога |
| Массаж | выбор | нет / обычный / тайский / другой |
| Алкоголь | выбор | нет / немного / умеренно / много |

---

## API endpoints

- `POST /api/los/morning` — ручной запуск утренней последовательности
- `POST /api/los/evening` — ручной запуск вечернего дайджеста
- `POST /api/los/decide` — анализ решения `{description, financialContext?, peopleContext?}`
- `GET  /api/los/digests` — история дайджестов
- `GET  /api/los/biometrics` — история биометрики
- `POST /api/telegram/webhook` — Telegram webhook endpoint
- `GET  /api/healthz` — health check

---

## Gotchas

- **Webhook**: регистрируется автоматически при старте сервера через `REPLIT_DOMAINS`
- **COS_TELEGRAM_CHAT_ID**: устанавливается автоматически после первого `/start` от Ани (в memory, не в секретах — если сервер перезапускается, нужен ещё раз `/start`)
- **Cron UTC**: 04:00 UTC = 07:00 MSK, 19:00 UTC = 22:00 MSK
- **Whitelist**: только chat IDs `243075616` и `668776362` могут писать боту (в `telegram-handler.ts`)
- **Telegram polling mode**: НЕ используется — только webhook

---

## Roadmap

- **Фаза 1 (MVP)** ✅ — Orchestrator, Neuro & Bio, Decision Support, Telegram bot
- **Фаза 2** — Conversational orchestrator (свободный текст → агент), вечерний ввод
- **Фаза 3** — Esoteric Agent, Network & Relationship Agent, Treasury Agent

---

## User preferences

- Язык системы — русский
- CoS зовут Аня
