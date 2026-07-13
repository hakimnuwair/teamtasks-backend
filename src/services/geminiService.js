/**
 * services/geminiService.js
 *
 * All Gemini API business logic lives here.
 */

import { getGeminiClient, getGeminiModel } from "../config/gemini.js";

const IMPROVE_TASK_PROMPT = (task) =>
  `You are a productivity assistant for a team task management app.

Improve the following task title into a clear, actionable, professional task description.
Keep it concise (1-2 sentences). Do not use bullet points or markdown.
Return only the improved task text, nothing else.

Task: ${task}`;

export const improveTask = async ({ task }) => {
  const trimmedTask = task?.trim();
  if (!trimmedTask) {
    throw new Error("Task is required");
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: IMPROVE_TASK_PROMPT(trimmedTask),
    });

    const improvedTask = response.text?.trim();
    if (!improvedTask) {
      throw new Error("Failed to improve task");
    }

    return { improvedTask };
  } catch (error) {
    if (error.message === "AI service configuration error") {
      console.error("[Gemini] GEMINI_API_KEY is missing or empty");
      throw error;
    }

    if (error.message === "Failed to improve task" || error.message === "Task is required") {
      throw error;
    }

    console.error("[Gemini] improveTask failed:", error);
    throw new Error("AI service is temporarily unavailable");
  }
};

// ─── Generate sub-task suggestions ─────────────────────────────────────────────
// Structured (JSON-schema-constrained) output — asks for a relative
// "dueOffsetDays" per item rather than an absolute date, since models are
// unreliable at absolute date arithmetic. The caller (subTaskService)
// turns the offset into a real date and re-validates every field — this
// function only talks to Gemini and returns the parsed-but-unvalidated array.

const SUBTASK_RESPONSE_SCHEMA = {
  type: "ARRAY",
  minItems: 1,
  maxItems: 8,
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      description: { type: "STRING" },
      dueOffsetDays: { type: "INTEGER" },
      priority: { type: "STRING", enum: ["LOW", "MEDIUM", "HIGH"] },
    },
    required: ["title", "dueOffsetDays"],
  },
};

const SUBTASK_PROMPT = ({ title, description, priority, daysRemaining }) =>
  `You are a productivity assistant for a team task management app.

Break the following task down into a short, actionable execution plan (subtasks).
Each subtask needs: a clear "title", an optional one-sentence "description", a
"priority" (LOW, MEDIUM, or HIGH), and "dueOffsetDays" — the number of whole days
from today the subtask should be done by (0 = today). The subtasks together must
fit within ${daysRemaining} day(s), since that's how long is left until the task
itself is due. Order subtasks logically. Return between 1 and 8 subtasks.

Task title: ${title}
Task description: ${description || "(no description provided)"}
Task priority: ${priority}
Days remaining until the task is due: ${daysRemaining}`;

export const generateSubTasks = async ({ task }) => {
  const daysRemaining = Math.max(
    1,
    Math.ceil(
      (new Date(task.dueDateTime).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000),
    ),
  );

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: SUBTASK_PROMPT({
        title: task.title,
        description: task.description,
        priority: task.priority,
        daysRemaining,
      }),
      config: {
        responseMimeType: "application/json",
        responseSchema: SUBTASK_RESPONSE_SCHEMA,
      },
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error("Failed to generate sub-tasks");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Failed to generate sub-tasks");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Failed to generate sub-tasks");
    }

    return parsed;
  } catch (error) {
    if (error.message === "AI service configuration error") {
      console.error("[Gemini] GEMINI_API_KEY is missing or empty");
      throw error;
    }

    if (error.message === "Failed to generate sub-tasks") {
      throw error;
    }

    console.error("[Gemini] generateSubTasks failed:", error);
    throw new Error("AI service is temporarily unavailable");
  }
};
