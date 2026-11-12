// Dispatcher used by Cloud Tasks worker AND the emulator in-process fallback.
import { logger } from "firebase-functions";
import { processMidtransWebhookTask } from "../midtrans/process";
import { deductFefoTask } from "../inventory/fefo";
import { executeIrisPayoutTask } from "../iris/payout";
import { sendTelegramTask } from "../telegram/send";

export async function handleTask(name: string, payload: any): Promise<void> {
  logger.info(`task ${name}`);
  switch (name) {
    case "processMidtransWebhookTask":
      return processMidtransWebhookTask(payload);
    case "deductFefoTask":
      return deductFefoTask(payload);
    case "executeIrisPayoutTask":
      return executeIrisPayoutTask(payload);
    case "sendTelegramTask":
    case "sendWhatsAppTask":
      return sendTelegramTask(payload);
    default:
      throw new Error(`unknown task ${name}`);
  }
}
