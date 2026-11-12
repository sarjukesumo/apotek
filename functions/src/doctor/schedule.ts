// Doctor Schedule + Booking module.
// Data model:
//   /tenants/{tid}/doctors/{doctorId}
//     { name, specialty, photoUrl, active, slotMinutes, fee }
//   /tenants/{tid}/doctorSchedules/{scheduleId}
//     { doctorId, dayOfWeek (0-6), startTime "HH:mm", endTime "HH:mm", active }
//   /tenants/{tid}/doctorBookings/{bookingId}
//     { doctorId, customer:{uid,name,email,phone}, dateISO "YYYY-MM-DD",
//       startTime "HH:mm", endTime "HH:mm", status "BOOKED|CANCELLED|DONE",
//       paymentId?, midtransOrderId?, createdAt }
import { db, FieldValue } from "../firebase";

export interface SlotQuery { tenantId: string; doctorId: string; dateISO: string; }

interface ScheduleDoc {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

interface DoctorDoc {
  name: string;
  slotMinutes: number;
  active: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function parseDate(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("invalid_date");
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateISO) throw new Error("invalid_date");
  const jakartaToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (dateISO < jakartaToday) throw new Error("date_in_past");
  return date;
}

function parseTime(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("invalid_start_time");
  return toMinutes(value);
}

export async function getAvailableSlots(q: SlotQuery): Promise<string[]> {
  const { tenantId, doctorId, dateISO } = q;
  const date = new Date(dateISO + "T00:00:00Z");
  const dow = date.getUTCDay();

  const docSnap = await db.doc(`tenants/${tenantId}/doctors/${doctorId}`).get();
  if (!docSnap.exists) return [];
  const doc = docSnap.data() as DoctorDoc;
  if (!doc.active) return [];
  const slot = doc.slotMinutes || 30;

  const schSnap = await db.collection(`tenants/${tenantId}/doctorSchedules`)
    .where("doctorId", "==", doctorId)
    .where("dayOfWeek", "==", dow)
    .where("active", "==", true)
    .get();
  if (schSnap.empty) return [];

  const bookings = await db.collection(`tenants/${tenantId}/doctorBookings`)
    .where("doctorId", "==", doctorId)
    .where("dateISO", "==", dateISO)
    .where("status", "==", "BOOKED")
    .get();
  const taken = new Set(bookings.docs.map((b) => (b.data() as any).startTime));

  const slots: string[] = [];
  for (const s of schSnap.docs) {
    const sd = s.data() as ScheduleDoc;
    for (let m = toMinutes(sd.startTime); m + slot <= toMinutes(sd.endTime); m += slot) {
      const t = fromMinutes(m);
      if (!taken.has(t)) slots.push(t);
    }
  }
  return slots.sort();
}

export interface BookInput {
  tenantId: string;
  doctorId: string;
  dateISO: string;
  startTime: string;
  customer: { uid: string; name: string; email: string; phone?: string };
}

export async function createBooking(input: BookInput): Promise<{ bookingId: string }> {
  const { tenantId, doctorId, dateISO, startTime, customer } = input;
  const date = parseDate(dateISO);
  const start = parseTime(startTime);
  if (!customer.uid || !customer.name.trim() || customer.name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new Error("invalid_customer");
  }

  // Idempotent unique key prevents double-booking same slot
  const bookingId = `${doctorId}_${dateISO}_${startTime.replace(":", "")}`;
  const ref = db.doc(`tenants/${tenantId}/doctorBookings/${bookingId}`);
  const doctorRef = db.doc(`tenants/${tenantId}/doctors/${doctorId}`);
  const scheduleQuery = db.collection(`tenants/${tenantId}/doctorSchedules`).where("doctorId", "==", doctorId);

  await db.runTransaction(async (tx) => {
    const [doctorSnapshot, scheduleSnapshot, bookingSnapshot] = await Promise.all([
      tx.get(doctorRef),
      tx.get(scheduleQuery),
      tx.get(ref),
    ]);
    if (!doctorSnapshot.exists || !(doctorSnapshot.data() as DoctorDoc).active) throw new Error("doctor_not_found");
    const doctor = doctorSnapshot.data() as DoctorDoc;
    const slot = Number(doctor.slotMinutes || 30);
    if (!Number.isInteger(slot) || slot < 10 || slot > 120) throw new Error("invalid_doctor_slot_length");
    const dow = date.getUTCDay();
    const schedule = scheduleSnapshot.docs
      .map((scheduleDoc) => scheduleDoc.data() as ScheduleDoc)
      .find((entry) => entry.active && entry.dayOfWeek === dow && start >= toMinutes(entry.startTime) && start + slot <= toMinutes(entry.endTime));
    if (!schedule) throw new Error("slot_outside_schedule");
    if ((start - toMinutes(schedule.startTime)) % slot !== 0) throw new Error("slot_not_aligned");
    if (bookingSnapshot.exists && (bookingSnapshot.data() as any).status === "BOOKED") {
      throw new Error("slot_taken");
    }
    tx.set(ref, {
      doctorId,
      customer: { uid: customer.uid, name: customer.name.trim(), email: customer.email.trim().toLowerCase(), ...(customer.phone ? { phone: customer.phone.trim() } : {}) },
      dateISO, startTime, endTime: fromMinutes(start + slot),
      status: "BOOKED",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { bookingId };
}

export async function cancelBooking(tenantId: string, bookingId: string): Promise<void> {
  const ref = db.doc(`tenants/${tenantId}/doctorBookings/${bookingId}`);
  await db.runTransaction(async (transaction) => {
    const booking = await transaction.get(ref);
    if (!booking.exists) throw new Error("booking_not_found");
    if ((booking.data() as any).status !== "BOOKED") throw new Error("booking_not_active");
    transaction.update(ref, { status: "CANCELLED", updatedAt: FieldValue.serverTimestamp() });
  });
}
