import fetch from "node-fetch";
import { logger } from "firebase-functions";
import { db } from "../firebase";
import { getSecret, loadSystemConfig } from "../config";

interface Input {
  tenantId: string;
  templateKey: string;
  payload: Record<string, any>;
}

function render(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

export async function sendTelegramTask(input: Input): Promise<void> {
  const config = await loadSystemConfig();
  const tokenRef = config.telegram?.botTokenRef;
  const template = config.telegram?.templates?.[input.templateKey];
  if (!tokenRef || !template) {
    logger.warn("telegram config or message template missing", input.templateKey);
    return;
  }

  const settingsSnapshot = await db.doc(`tenants/${input.tenantId}/privateSettings/notifications`).get();
  const settings = settingsSnapshot.data() as any;
  const chatIds = (settings?.telegramChatIds ?? [])
    .map((chatId: unknown) => String(chatId).trim())
    .filter(Boolean);
  if (!chatIds.length) {
    logger.info("no telegram recipients", input.tenantId);
    return;
  }

  const token = await getSecret(tokenRef);
  const text = render(template, input.payload);
  await Promise.all(chatIds.map(async (chatId: string) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const result = await response.json() as { ok?: boolean; description?: string };
      if (!response.ok || !result.ok) {
        logger.warn("telegram send failed", { status: response.status, description: result.description });
      }
    } catch (error) {
      logger.error("telegram send error", error);
    }
  }));
}