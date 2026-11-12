// Midtrans HTTP webhook receiver.
// - Always responds 200 immediately.
// - Verifies signature: SHA512(order_id + status_code + gross_amount + ServerKey)
// - Dedupe via sha256(rawBody) -> webhookEvents/{dedupeKey}.
import { Request, Response } from "express";
import { logger } from "firebase-functions";
import { db, FieldValue } from "../firebase";
import { getSecret, loadSystemConfig } from "../config";
import { sha256, sha512, timingSafeEq } from "../util/crypto";
import { enqueue } from "../util/tasks";

export async function midtransWebhookHandler(req: Request, res: Response): Promise<void> {
  // Acknowledge immediately to avoid Midtrans retries.
  res.status(200).send("OK");

  try {
    const rawBuf: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body || {}));
    const raw = rawBuf.toString("utf8");
    const p = JSON.parse(raw);

    const cfg = await loadSystemConfig();
    const serverKey = await getSecret(cfg.midtrans.serverKeyRef);
    const expected = sha512(
      String(p.order_id) + String(p.status_code) + String(p.gross_amount) + serverKey
    );
    const signatureValid = timingSafeEq(expected, String(p.signature_key || ""));

    const dedupeKey = "sha256_" + sha256(raw);
    const ref = db.collection("webhookEvents").doc(dedupeKey);

    const shouldEnqueue = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.processStatus === "PROCESSED") return false;
      tx.set(
        ref,
        {
          provider: "MIDTRANS",
          dedupeKey,
          signatureValid,
          processStatus: signatureValid ? "NEW" : "IGNORED",
          payloadMin: {
            order_id: p.order_id,
            transaction_id: p.transaction_id,
            transaction_status: p.transaction_status,
            status_code: p.status_code,
            gross_amount: p.gross_amount,
            fraud_status: p.fraud_status ?? null,
          },
          receivedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return signatureValid;
    });

    if (shouldEnqueue) {
      await enqueue("processMidtransWebhookTask", { dedupeKey });
    }
  } catch (err) {
    logger.error("midtrans webhook error", err);
    // Already 200'd, log only.
  }
}
