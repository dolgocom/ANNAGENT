# LOS — Life Operating System

Многоагентная AI-система управления жизнью и бизнесом через Telegram-бот. CoS (Аня) — единственный человеческий интерфейс.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (claude-sonnet-4-6) via own API key
- Telegram: node-telegram-bot-api (polling mode)
- Scheduler: node-cron (07:00 и 22:00 MSK)
- Biometrics: Oura Ring API
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/agents/` — агенты системы (neuro-bio, decision-support, orchestrator)
- `artifacts/api-server/src/lib/telegram.ts` — Telegram бот
- `artifacts/api-server/src/lib/telegram-handler.ts` — обработчик команд Telegram
- `artifacts/api-server/src/lib/oura.ts` — Oura Ring API клиент
- `artifacts/api-server/src/lib/scheduler.ts` — cron-планировщик (07:00/22:00 MSK)
- `artifacts/api-server/src/routes/los.ts` — REST API эндпоинты LOS
- `lib/db/src/schema/` — DB схема (biometrics, agent_memory, digests, cos_inputs)

## Architecture decisions

- Система только рекомендует, никогда не действует самостоятельно
- Все решения принимает Аня (CoS) — единственный человеческий интерфейс
- Язык системы — русский
- Часовой пояс — Москва (MSK, UTC+3), cron в UTC (04:00/19:00)
- Агенты запускаются последовательно, не параллельно (per ТЗ)
- Telegram бот в polling mode (не webhook)

## Product — MVP (Фаза 1)

- **Master Orchestrator** — утренний дайджест в 07:00 MSK, вечерний в 22:00 MSK
- **Neuro & Bio Agent** — анализирует Oura Ring + ручные вводы Ани, выдаёт рекомендации по состоянию
- **Decision Support Agent** — утренние приоритеты + анализ конкретных решений по запросу
- **Telegram Bot (CoS интерфейс)** — команды: /start, /morning, /evening, /decide, /status, /help

## Telegram команды

- `/start` — активация бота
- `/morning 7 8 7 н д н` — утренний ввод (энергия фокус настроение тренировка массаж алкоголь)
- `/morning` — интерактивный режим (вопрос за вопросом)
- `/decide <описание>` — анализ решения
- `/status` — статус всех агентов системы
- `/help` — справка

## API эндпоинты

- `POST /api/los/morning` — ручной запуск утренней последовательности
- `POST /api/los/evening` — ручной запуск вечернего дайджеста
- `POST /api/los/decide` — анализ решения (body: `{description, financialContext?, peopleContext?}`)
- `GET /api/los/digests` — история дайджестов
- `GET /api/los/biometrics` — история биометрики

## User preferences

- Язык системы — русский
- CoS зовут Аня

## Gotchas

- Telegram бот в polling mode — при деплое переключить на webhook
- COS_TELEGRAM_CHAT_ID устанавливается автоматически после первого /start от Ани
- Cron time в UTC: 04:00 = 07:00 MSK, 19:00 = 22:00 MSK
- Morning checklist отправляется в 07:00, auto-sequence с данными Oura в 07:30

## Поinters

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
