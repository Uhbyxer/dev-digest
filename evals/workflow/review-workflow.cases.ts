import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — subagent dispatch and skill activation against the real on-disk
 * harness (settingSources:["project"]). CLAUDE.md "Read when" routing lives in claude-md.cases.ts.
 *
 * Budget: 3 Claude sessions total.
 *   - 1 × trace                                           = 1  (subagent dispatch)
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * The dispatch case is the model-sensitive one: some cheap models do the work inline instead of
 * launching the subagent (see README, "Which cheap model"), so CI runs this tier on a model that
 * is known to dispatch.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): the architecture-reviewer subagent actually gets dispatched -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "architecture review request dispatches the architecture-reviewer subagent",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план на " +
      "відповідність onion-шарам — не рецензуй сам.",
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
