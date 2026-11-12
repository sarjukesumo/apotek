// Cloud Tasks enqueue helper. Falls back to direct invocation in emulator.
import { CloudTasksClient } from "@google-cloud/tasks";
import { logger } from "firebase-functions";

const client = new CloudTasksClient();
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "pharmaos-ai-dev";
const LOCATION = process.env.TASKS_LOCATION || "asia-southeast2";
const QUEUE = process.env.TASKS_QUEUE || "pharmaos-default";
const TASK_BASE_URL = process.env.TASK_BASE_URL || ""; // e.g. https://<region>-<project>.cloudfunctions.net/taskWorker
const SA_EMAIL = process.env.TASKS_SA_EMAIL || "";

export type TaskName =
  | "processMidtransWebhookTask"
  | "deductFefoTask"
  | "executeIrisPayoutTask"
  | "sendTelegramTask"
  | "sendWhatsAppTask";

export interface EnqueueOptions { delaySeconds?: number; }

// In-process fallback so dev works without Cloud Tasks.
import { handleTask } from "./taskHandlers";

export async function enqueue(
  name: TaskName,
  payload: Record<string, any>,
  opts: EnqueueOptions = {}
): Promise<void> {
  if (!TASK_BASE_URL || process.env.FUNCTIONS_EMULATOR === "true") {
    setTimeout(() => {
      handleTask(name, payload).catch((e) => logger.error(`task ${name} failed`, e));
    }, (opts.delaySeconds ?? 0) * 1000);
    return;
  }
  const parent = client.queuePath(PROJECT, LOCATION, QUEUE);
  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: TASK_BASE_URL,
      headers: { "Content-Type": "application/json", "X-Task-Name": name },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: SA_EMAIL ? { serviceAccountEmail: SA_EMAIL } : undefined,
    },
    scheduleTime: opts.delaySeconds
      ? { seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds }
      : undefined,
  };
  await client.createTask({ parent, task });
}

export function backoff(attempts: number): number {
  return Math.min(60 * 30, Math.pow(2, attempts) * 5); // up to 30 minutes
}
