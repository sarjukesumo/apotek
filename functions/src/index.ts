// Cloud Functions entry point.
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { app } from "./http";
import { db, FieldValue } from "./firebase";
import { enqueue } from "./util/tasks";

setGlobalOptions({ region: "asia-southeast2", maxInstances: 20 });

const allowedOrigins = ["https://batam-farma.web.app", /^http:\/\/localhost(?::\d+)?$/];
export const api = onRequest({ cors: allowedOrigins, memory: "512MiB", timeoutSeconds: 60 }, app);

// Daily subscription scan: mark expiring/suspended + send reminder
export const subscriptionScanner = onSchedule(
  { schedule: "0 1 * * *", timeZone: "Asia/Jakarta" },
  async () => {
    const now = Date.now();
    const snap = await db.collection("tenants").get();
    for (const doc of snap.docs) {
      const t = doc.data() as any;
      const sub = t.subscription;
      if (!sub?.endAt) continue;
      const end = sub.endAt.toMillis?.() ?? 0;
      const grace = sub.graceEndAt?.toMillis?.() ?? end;
      let newStatus = sub.status;
      if (now > grace) newStatus = "SUSPENDED";
      else if (now > end) newStatus = "EXPIRING";
      if (newStatus !== sub.status) {
        await doc.ref.update({
          "subscription.status": newStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      // 7-day reminder
      const daysLeft = Math.ceil((end - now) / 86400_000);
      if ([7, 3, 1].includes(daysLeft) && t.notifications?.subscriptionReminders) {
        await enqueue("sendTelegramTask", {
          tenantId: doc.id,
          templateKey: "subscriptionReminder",
          payload: { plan: sub.plan, endAt: new Date(end).toISOString().slice(0, 10) },
        });
      }
    }
    logger.info("subscriptionScanner done");
  }
);
