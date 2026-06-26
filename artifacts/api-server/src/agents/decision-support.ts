import { callClaude } from "../lib/anthropic";
import { logger } from "../lib/logger";
import type { NeuroBioOutput } from "./neuro-bio";

export interface DecisionSupportInput {
  neuroBioState?: NeuroBioOutput;
  decisionDescription?: string;
  financialContext?: string;
  peopleContext?: string;
  mode: "morning_priorities" | "decision_analysis";
}

export interface PriorityItem {
  priority: number;
  task: string;
  urgency: "high" | "medium" | "low";
  reasoning: string;
}

export interface DecisionSupportOutput {
  mode: "morning_priorities" | "decision_analysis";
  priorities?: PriorityItem[];
  decision_analysis?: {
    recommendation: string;
    risks: string[];
    opportunities: string[];
    optimal_timing?: string;
    financial_lens?: string;
    physical_lens?: string;
    reputation_lens?: string;
  };
  summary: string;
  decision_owner: "Anna";
}

const SYSTEM_PROMPT = `Ты — Decision Support Agent системы LOS (Life Operating System).

Твоя задача: агрегировать контекст и помогать принимать решения. Работаешь в двух режимах:
1. morning_priorities — утренняя расстановка приоритетов
2. decision_analysis — анализ конкретного решения через несколько линз

ПРАВИЛА:
1. Не принимаешь решений самостоятельно — только анализ
2. Решение всегда за Аней
3. Отвечаешь ТОЛЬКО на русском языке
4. Отвечаешь строго в формате JSON без markdown-блоков

ФОРМАТ для morning_priorities:
{
  "mode": "morning_priorities",
  "priorities": [
    {"priority": 1, "task": "...", "urgency": "high|medium|low", "reasoning": "..."}
  ],
  "summary": "краткая сводка дня",
  "decision_owner": "Anna"
}

ФОРМАТ для decision_analysis:
{
  "mode": "decision_analysis",
  "decision_analysis": {
    "recommendation": "...",
    "risks": ["риск 1", "риск 2"],
    "opportunities": ["возможность 1"],
    "optimal_timing": "...",
    "financial_lens": "...",
    "physical_lens": "...",
    "reputation_lens": "..."
  },
  "summary": "итоговый вывод",
  "decision_owner": "Anna"
}`;

export async function runDecisionSupportAgent(input: DecisionSupportInput): Promise<DecisionSupportOutput> {
  const physicalState = input.neuroBioState
    ? `Физическое состояние: ${input.neuroBioState.status} (Readiness: ${input.neuroBioState.readiness_score ?? "н/д"}). ${input.neuroBioState.recommendation}`
    : "Физическое состояние: нет данных";

  let userMessage: string;

  if (input.mode === "morning_priorities") {
    userMessage = `РЕЖИМ: Утренняя расстановка приоритетов

КОНТЕКСТ:
${physicalState}
${input.financialContext ? `Финансовый контекст: ${input.financialContext}` : ""}
${input.peopleContext ? `Контекст по людям: ${input.peopleContext}` : ""}

Составь приоритеты на сегодня. Учти физическое состояние владельца при расстановке задач.`;
  } else {
    userMessage = `РЕЖИМ: Анализ решения

РЕШЕНИЕ ДЛЯ АНАЛИЗА:
${input.decisionDescription ?? "Не указано"}

КОНТЕКСТ:
${physicalState}
${input.financialContext ? `Финансовый контекст: ${input.financialContext}` : ""}
${input.peopleContext ? `Контекст по людям: ${input.peopleContext}` : ""}

Проведи многоуровневый анализ через линзы: финансовую, физическую, репутационную.`;
  }

  try {
    const raw = await callClaude(SYSTEM_PROMPT, userMessage);
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned) as DecisionSupportOutput;
    return result;
  } catch (err) {
    logger.error({ err }, "DecisionSupport agent failed");
    return {
      mode: input.mode,
      summary: "Не удалось провести анализ. Требуется ручная оценка.",
      decision_owner: "Anna",
    };
  }
}
