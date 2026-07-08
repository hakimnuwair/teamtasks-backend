/**
 * controllers/aiController.js
 */

import * as geminiService from "../services/geminiService.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const improveTask = async (req, res, next) => {
  try {
    const { improvedTask } = await geminiService.improveTask({
      task: req.body.task,
    });

    return sendSuccess(res, { improvedTask }, "Task improved successfully");
  } catch (error) {
    next(error);
  }
};
