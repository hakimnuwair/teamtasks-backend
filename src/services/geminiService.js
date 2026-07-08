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
