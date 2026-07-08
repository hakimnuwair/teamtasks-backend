/**
 * config/gemini.js
 *
 * Lazy singleton for the Google Gen AI SDK client.
 * Mirrors the initPassport() pattern — env vars must be loaded before use.
 */

import { GoogleGenAI } from "@google/genai";

let client = null;

export const getGeminiModel = () =>
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("AI service configuration error");
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }

  return client;
};
