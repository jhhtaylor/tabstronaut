import * as vscode from "vscode";
import * as path from "path";
import { SuggestedGroup } from "./groupSuggester";

const AI_TIMEOUT_MS = 8000;
const MAX_NAME_LENGTH = 40;

/**
 * Attempts to improve a heuristic suggestion's name using the VS Code Language
 * Model API (e.g. GitHub Copilot). Only file basenames — never full paths or
 * file contents — are sent to the model.
 *
 * Returns the original suggestion unchanged if:
 *   - No LM provider is installed or available
 *   - The request fails or times out
 *   - The model returns an unusable response
 *
 * Never throws.
 */
export async function aiEnhanceSuggestion(
  suggestion: SuggestedGroup
): Promise<SuggestedGroup> {
  try {
    // Guard: vscode.lm may not exist in very old VS Code builds
    if (
      !vscode.lm ||
      typeof vscode.lm.selectChatModels !== "function"
    ) {
      return suggestion;
    }

    const models = await vscode.lm.selectChatModels();
    if (!models || models.length === 0) {
      return suggestion;
    }

    const model = models[0];
    const fileNames = suggestion.files
      .map((f) => path.basename(f))
      .join(", ");

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `These files are frequently opened together in a code editor: ${fileNames}\n\n` +
          `Suggest a short group name (1–3 words) that describes what these files are for.\n` +
          `Reply with ONLY the name — no punctuation, no explanation.`
      ),
    ];

    const cancellation = new vscode.CancellationTokenSource();
    const timeout = setTimeout(
      () => cancellation.cancel(),
      AI_TIMEOUT_MS
    );

    let name = "";
    try {
      const response = await model.sendRequest(
        messages,
        {},
        cancellation.token
      );
      for await (const chunk of response.text) {
        name += chunk;
        if (name.length > MAX_NAME_LENGTH) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
      cancellation.dispose();
    }

    // Strip surrounding quotes/backticks the model sometimes adds
    name = name.trim().replace(/^[`"']+|[`"']+$/g, "").trim();

    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return suggestion;
    }

    return { ...suggestion, name, source: "ai" };
  } catch {
    return suggestion;
  }
}
