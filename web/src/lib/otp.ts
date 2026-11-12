// OTP delivery helper — abstracts WhatsApp + Email channels.
// In demo mode: generates code locally and logs it (UI displays it as banner).
// In production: replace bodies with calls to backend endpoints
//   POST /api/auth/otp/send  { channel, dest }
//   POST /api/auth/otp/verify { channel, dest, code }
// Backend reads provider from systemConfig.whatsapp / Firebase Auth email link.

export type OtpChannel = "whatsapp" | "email";

export interface OtpSendResult {
  /** 6-digit code — only returned in DEMO mode so the UI can display it. */
  demoCode: string;
  sentAt: number;
}

export async function sendOtp(channel: OtpChannel, dest: string): Promise<OtpSendResult> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  // eslint-disable-next-line no-console
  console.log(`[Demo] OTP via ${channel} ke ${dest}: ${code}`);
  await new Promise((r) => setTimeout(r, 700));
  return { demoCode: code, sentAt: Date.now() };
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, 4) + "•".repeat(Math.max(0, phone.length - 6)) + phone.slice(-2);
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  const head = u.slice(0, Math.min(2, u.length));
  return head + "•".repeat(Math.max(1, u.length - 2)) + "@" + d;
}
