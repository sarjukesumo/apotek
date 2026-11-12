// Demo / local store for admin's pharmacy + sample tenants.
// Persists in localStorage so changes survive page reload.
// All data here is "demo" — it does NOT touch Firestore.
//
// Marketplace.tsx merges these products with real Firestore products
// + hardcoded SAMPLE_PRODUCTS, so the admin (and other demo tenants)
// can showcase a fully working flow without a live backend.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DemoTenant {
  id: string;            // e.g. "demo-admin-apotek"
  name: string;          // e.g. "Apotek Sentosa"
  slug: string;          // url slug
  logoEmoji: string;     // e.g. "💊"
  primaryColor: string;  // hex
  city: string;
  address: string;
  lat?: number;
  lng?: number;
  phone: string;
  whatsapp: string;
  distanceKm: number;    // for marketplace sorting
  rating: number;
  marketplaceEnabled: boolean;
  bank: {
    bankName: string;       // BCA, Mandiri, BNI, etc
    accountNumber: string;
    accountHolder: string;
  };
  npwp?: string;
  sia?: string;             // Surat Ijin Apotek
  // SaaS subscription metadata (so demo tenants appear in Admin SaaS dashboard)
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  subscriptionStatus: "ACTIVE" | "TRIAL" | "EXPIRED";
  subscribedAtISO: string;     // YYYY-MM-DD
  nextBillingISO: string;      // YYYY-MM-DD
  mrr: number;                 // Monthly recurring revenue (Rp)
}

export interface DemoBatch {
  id: string;
  batchNo: string;
  qty: number;
  expiryISO: string; // YYYY-MM-DD
  supplierId?: string; // sumber batch (untuk retur)
  supplierCode?: string;
  supplierName?: string;
  sourceType?: "PURCHASE" | "OPENING_STOCK" | "TRANSFER" | "DONATION" | "UNKNOWN";
  purchaseDateISO?: string;
  invoiceNo?: string;
  costPrice?: number;  // HPP per unit (Rp) — diisi saat GRN
  poId?: string;       // referensi PO yang menerima batch ini
  grnId?: string;      // referensi GRN penerima
}

export interface DemoSupplier {
  id: string;
  tenantId: string;
  code?: string;
  name: string;
  picName: string;        // contact person
  phone: string;
  whatsapp?: string;
  email?: string;
  address: string;
  // Kebijakan retur (default industri Indonesia):
  returnable: boolean;             // boleh retur sama sekali?
  returnMinDaysBeforeED: number;   // min sisa hari ED untuk diterima retur
  returnNotes?: string;            // contoh: "hanya kemasan utuh, max 5% omzet/bulan"
  active: boolean;
  createdAtISO: string;
}

export type DemoReturnStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "COMPLETED";
export type DemoReturnReason = "NEAR_EXPIRY" | "DAMAGED" | "WRONG_ITEM" | "RECALL" | "OVERSTOCK" | "OTHER";

export interface DemoReturn {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierName: string;     // snapshot
  noReturn: string;         // RTN/2026/05/001
  dateISO: string;
  reason: DemoReturnReason;
  status: DemoReturnStatus;
  notes?: string;
  items: {
    productId: string;
    productName: string;
    batchNo: string;
    qty: number;
    unit: string;
    expiryISO: string;
    valueRp: number;        // qty * price (HPP proxy)
  }[];
  totalValueRp: number;
  createdAtISO: string;
  acceptedAtISO?: string;
  rejectionReason?: string;
}

// === Pembelian (PO + GRN) ===
export type DemoPOStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED";
export interface DemoPOItem {
  productId: string;
  productName: string;
  unit: string;
  qty: number;
  costPrice: number;       // harga beli per unit (Rp) — jadi HPP saat GRN
  subtotalRp: number;
  receivedQty: number;     // diisi seiring GRN
}
export interface DemoPO {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierName: string;
  noPO: string;            // PO/2026/05/001
  dateISO: string;
  expectedDateISO?: string;
  status: DemoPOStatus;
  items: DemoPOItem[];
  totalRp: number;
  notes?: string;
  createdAtISO: string;
  createdByName?: string;
}
export interface DemoGRNItem {
  productId: string;
  productName: string;
  unit: string;
  batchNo: string;
  qty: number;
  expiryISO: string;
  costPrice: number;       // disimpan ke batch.costPrice
  subtotalRp: number;
}
export interface DemoGRN {
  id: string;
  tenantId: string;
  poId?: string;
  supplierId: string;
  supplierName: string;
  noGRN: string;           // GRN/2026/05/001
  dateISO: string;
  items: DemoGRNItem[];
  totalRp: number;
  receivedByName: string;
  notes?: string;
  createdAtISO: string;
}

// === Resep + PMR (Patient Medication Record) ===
export interface DemoPatient {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  nik?: string;
  dob?: string;             // YYYY-MM-DD
  gender?: "M" | "F";
  address?: string;
  allergies: string[];      // contoh: ["penisilin", "sulfa"]
  chronicConditions: string[]; // contoh: ["DM tipe 2", "hipertensi"]
  insurer?: string;         // BPJS / Admedika / cash
  membershipId?: string;    // -> DemoMember.id (loyalty)
  pointsBalance: number;
  createdAtISO: string;
}
export type DemoPrescriptionStatus = "RECEIVED" | "SCREENED" | "DISPENSED" | "COUNSELED" | "CANCELLED";
export interface DemoPrescriptionItem {
  productId: string;
  productName: string;
  qty: number;
  unit: string;
  signa: string;            // aturan pakai (contoh: "3x1 tab pc")
  notes?: string;
}
export interface DemoDRPFinding {
  type: "INTERACTION" | "ALLERGY" | "DOSE" | "DUPLICATION" | "OTHER";
  severity: "INFO" | "WARN" | "DANGER";
  message: string;
}
export interface DemoPrescription {
  id: string;
  tenantId: string;
  noResep: string;          // R/2026/05/001
  patientId?: string;
  patientName: string;      // snapshot (untuk walk-in)
  doctorName: string;
  doctorSIP?: string;
  dateISO: string;
  items: DemoPrescriptionItem[];
  drpFindings: DemoDRPFinding[];
  apothecaryId?: string;    // user APOTEKER
  apothecaryName?: string;
  apothecarySIPA?: string;
  status: DemoPrescriptionStatus;
  counselingNotes?: string;
  imageDataUrl?: string;    // foto resep
  createdAtISO: string;
}

// === Defekta (purchase request) + ROP ===
export interface DemoDefektaItem {
  productId: string;
  productName: string;
  unit: string;
  currentStock: number;
  rop: number;              // reorder point dihitung
  suggestQty: number;       // EOQ-ish
  preferredSupplierId?: string;
  notes?: string;
}
export interface DemoDefekta {
  id: string;
  tenantId: string;
  noDefekta: string;        // DFK/2026/05/001
  dateISO: string;
  items: DemoDefektaItem[];
  status: "OPEN" | "ORDERED" | "CLOSED";
  notes?: string;
  createdAtISO: string;
}

// === Stock Opname (cycle / annual) ===
export interface DemoStockOpnameItem {
  productId: string;
  productName: string;
  batchNo: string;
  expiryISO: string;
  unit: string;
  systemQty: number;
  physicalQty: number;
  variance: number;         // physical - system
  reason?: "DAMAGED" | "LOST" | "ADMIN" | "FOUND" | "OTHER";
  valueRp: number;          // variance * price
}
export interface DemoStockOpname {
  id: string;
  tenantId: string;
  noSO: string;             // SO/2026/05/001
  type: "CYCLE" | "ANNUAL" | "SPOT";
  dateISO: string;
  scope: string;            // "Rak A1", "Semua", dll
  items: DemoStockOpnameItem[];
  totalVarianceValueRp: number;
  status: "DRAFT" | "POSTED";
  approvedByName?: string;
  notes?: string;
  createdAtISO: string;
}

// === SIPNAP / OOT / Cold-chain ===
export interface DemoNarcoticLog {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  category: "NARKOTIKA" | "PSIKOTROPIKA" | "OOT" | "PREKURSOR";
  movementType: "IN" | "OUT";
  qty: number;
  balanceAfter: number;
  refType: "GRN" | "RX" | "BAP" | "RTN" | "OPNAME";
  refNo: string;
  patientName?: string;
  doctorName?: string;
  dateISO: string;
  createdAtISO: string;
}
export interface DemoColdChainReading {
  id: string;
  tenantId: string;
  unitName: string;          // "Kulkas Vaksin 1"
  tempCelsius: number;
  withinRange: boolean;      // 2-8 °C
  takenAtISO: string;        // ISO datetime
  takenByName: string;
  notes?: string;
}

// === Akuntansi ringan ===
export interface DemoLedgerEntry {
  id: string;
  tenantId: string;
  dateISO: string;
  type: "CASH_IN" | "CASH_OUT" | "AP" | "AR";
  category: string;          // "Penjualan POS", "Pembelian", "Beban Gaji", "Piutang BPJS"...
  description: string;
  amountRp: number;
  refType?: "POS" | "GRN" | "RX" | "MANUAL";
  refNo?: string;
  createdAtISO: string;
}
export type DemoPayableStatus = "OPEN" | "PARTIAL" | "PAID" | "OVERDUE";
export interface DemoPayable {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierName: string;
  grnId?: string;
  invoiceNo: string;
  invoiceDateISO: string;
  dueDateISO: string;
  totalRp: number;
  paidRp: number;
  status: DemoPayableStatus;
  notes?: string;
  createdAtISO: string;
}
export type DemoReceivableStatus = "OPEN" | "PARTIAL" | "PAID" | "OVERDUE";
export interface DemoReceivable {
  id: string;
  tenantId: string;
  source: "PATIENT" | "INSURER" | "OTHER";
  partyName: string;         // pasien atau asuransi
  refType?: "POS" | "RX" | "CLAIM";
  refNo?: string;
  invoiceDateISO: string;
  dueDateISO: string;
  totalRp: number;
  paidRp: number;
  status: DemoReceivableStatus;
  notes?: string;
  createdAtISO: string;
}

// === Multi-outlet (cabang & mutasi stok) ===
export interface DemoBranch {
  id: string;
  tenantId: string;          // group/HO id
  name: string;
  address: string;
  phone?: string;
  managerName?: string;
  active: boolean;
  isHQ: boolean;
  createdAtISO: string;
}
export type DemoTransferStatus = "DRAFT" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
export interface DemoTransfer {
  id: string;
  tenantId: string;
  noTransfer: string;        // TRF/2026/05/001
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  dateISO: string;
  items: { productId: string; productName: string; batchNo: string; qty: number; unit: string; expiryISO: string }[];
  status: DemoTransferStatus;
  notes?: string;
  createdAtISO: string;
  receivedAtISO?: string;
}

// === Loyalty / Membership ===
export type DemoMemberTier = "SILVER" | "GOLD" | "PLATINUM";
export interface DemoMember {
  id: string;
  tenantId: string;
  patientId?: string;
  cardNo: string;            // M-2026-0001
  name: string;
  phone: string;
  email?: string;
  birthDateISO?: string;
  joinedISO: string;
  tier: DemoMemberTier;
  pointsBalance: number;
  totalSpendRp: number;      // lifetime
  active: boolean;
}
export interface DemoLoyaltyTx {
  id: string;
  tenantId: string;
  memberId: string;
  type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST";
  points: number;            // negative = redeem
  refType?: "POS" | "MANUAL";
  refNo?: string;
  description: string;
  createdAtISO: string;
}

// === Asuransi & Klaim ===
export interface DemoInsurer {
  id: string;
  tenantId: string;
  name: string;              // BPJS / Admedika / Inhealth / dll
  type: "BPJS" | "PRIVATE";
  picName?: string;
  phone?: string;
  contractNo?: string;
  active: boolean;
  createdAtISO: string;
}
export type DemoClaimStatus = "DRAFT" | "SUBMITTED" | "PROCESSED" | "APPROVED" | "REJECTED" | "PAID";
export interface DemoInsuranceClaim {
  id: string;
  tenantId: string;
  insurerId: string;
  insurerName: string;
  noClaim: string;           // CLM/2026/05/001
  patientName: string;
  patientMemberNo: string;   // no kartu BPJS / asuransi
  serviceDateISO: string;
  submittedDateISO?: string;
  items: { description: string; qty: number; priceRp: number }[];
  totalClaimRp: number;
  approvedRp: number;
  status: DemoClaimStatus;
  rejectionReason?: string;
  notes?: string;
  createdAtISO: string;
}

// === Audit trail + Permission ===
export interface DemoAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  userRole: DemoUserRole;
  action: string;            // "PRODUCT_PRICE_UPDATE", "BATCH_DELETE", "POS_VOID"...
  target: string;            // entitas / id
  details?: string;          // text
  ipAddress?: string;
  createdAtISO: string;      // ISO datetime
}
export type DemoPermission =
  | "POS_USE" | "POS_VOID" | "PRODUCT_EDIT" | "PRICE_EDIT" | "BATCH_EDIT"
  | "USER_MANAGE" | "ROLE_MANAGE" | "REPORT_VIEW" | "REPORT_EXPORT"
  | "PURCHASE_CREATE" | "PURCHASE_RECEIVE" | "RETURN_MANAGE"
  | "DISPOSAL_APPROVE" | "RX_DISPENSE" | "RX_COUNSEL" | "OPNAME_POST"
  | "PAYABLE_PAY" | "RECEIVABLE_RECEIVE" | "CLAIM_SUBMIT"
  | "MEMBER_MANAGE" | "PROMO_MANAGE" | "AUDIT_VIEW" | "SETTINGS_EDIT";

// === Promo & Pricing Engine ===
export type DemoPromoType = "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "BUNDLE" | "ED_NEAR_AUTO";
export interface DemoPromo {
  id: string;
  tenantId: string;
  code: string;              // PROMO123 (atau auto: ED-NEAR-PCM)
  name: string;
  type: DemoPromoType;
  discountPercent?: number;  // untuk PERCENT_OFF / ED_NEAR_AUTO
  discountAmountRp?: number; // untuk AMOUNT_OFF
  buyQty?: number;           // untuk BUY_X_GET_Y
  getQty?: number;
  applyToProductIds?: string[];
  applyToCategory?: string;
  minSubtotalRp?: number;
  startISO: string;
  endISO: string;
  active: boolean;
  // ED auto-discount config
  edZoneTrigger?: "WARNING" | "CRITICAL";
  createdAtISO: string;
}

// === Notifikasi multi-channel ===
export type DemoNotifChannel = "WA" | "SMS" | "EMAIL" | "INAPP";
export type DemoNotifStatus = "QUEUED" | "SENT" | "FAILED" | "READ";
export interface DemoNotification {
  id: string;
  tenantId: string;
  channel: DemoNotifChannel;
  template: string;          // ID template
  recipient: string;         // phone / email / userId
  recipientName: string;
  subject?: string;
  body: string;
  status: DemoNotifStatus;
  refType?: "RX" | "PROMO" | "STOCK" | "MEMBER" | "RETURN";
  refNo?: string;
  scheduledISO?: string;
  sentISO?: string;
  createdAtISO: string;
}

// === Telemedicine lite ===
export interface DemoTelemedSession {
  id: string;
  tenantId: string;
  doctorId: string;
  doctorName: string;
  patientName: string;
  patientPhone: string;
  channel: "CHAT" | "VIDEO";
  startedISO: string;
  endedISO?: string;
  status: "ACTIVE" | "ENDED";
  prescriptionId?: string;   // e-prescription dihasilkan
}
export interface DemoChatMessage {
  id: string;
  sessionId: string;
  senderRole: "DOCTOR" | "PATIENT" | "PHARMACIST";
  senderName: string;
  text: string;
  createdAtISO: string;
}

// === Hardware preferences ===
export interface DemoHardwareSettings {
  tenantId: string;
  printerType: "THERMAL_58" | "THERMAL_80" | "A4";
  scannerEnabled: boolean;
  cashDrawerEnabled: boolean;
  customerDisplayEnabled: boolean;
  scaleEnabled: boolean;
  rfidEnabled: boolean;
}

// === API & Webhook ===
export interface DemoWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];          // ["pos.completed", "stock.low", "rx.dispensed"]
  active: boolean;
  secretMasked: string;      // "whsec_***1234"
  lastDeliveryISO?: string;
  lastStatus?: number;
  createdAtISO: string;
}
export interface DemoApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyMasked: string;         // "pk_live_***abcd"
  scopes: string[];
  lastUsedISO?: string;
  active: boolean;
  createdAtISO: string;
}

export interface DemoProduct {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  price: number;
  emoji: string;
  gradient: string;
  imageUrl?: string;     // optional product image URL (auto-fetched or manual)
  desc: string;
  unit: string;
  rxRequired: boolean;
  active?: boolean;
  sampleOnly?: boolean;
  code?: string;
  marketplaceEnabled: boolean;
  minStock: number;
  batches: DemoBatch[];
}

export type DemoUserRole = "OWNER" | "APOTEKER" | "KASIR" | "STAFF";

export interface DemoUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  role: DemoUserRole;
  active: boolean;
  avatarEmoji: string;
  joinedISO: string;     // YYYY-MM-DD
  lastLoginISO?: string; // YYYY-MM-DD
  sipa?: string;         // for APOTEKER (Surat Izin Praktik Apoteker)
}

export interface DemoDoctor {
  id: string;
  tenantId: string;
  name: string;
  specialty: string;
  avatarEmoji: string;
  fee: number;             // konsultasi fee (Rp)
  slotMinutes: number;     // durasi per slot
  active: boolean;
  // schedule: 0=Min..6=Sab. Empty array = libur.
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[];
  about?: string;
  sip?: string;            // Surat Izin Praktik
}

export type DemoBookingStatus = "BOOKED" | "DONE" | "CANCELLED";

// Pemusnahan obat (BAP — Berita Acara Pemusnahan)
export interface DemoDisposal {
  id: string;
  tenantId: string;
  dateISO: string;          // YYYY-MM-DD tanggal pemusnahan
  reason: "EXPIRED" | "DAMAGED" | "RECALL" | "OTHER";
  method: string;           // mis. "Insinerasi pihak ke-3", "Hancurkan + buang"
  witnesses: string[];      // nama saksi (apoteker + 1 staff lain)
  notes?: string;
  items: {
    productId: string;
    productName: string;
    batchNo: string;
    qty: number;
    unit: string;
    expiryISO: string;
    valueRp: number;        // qty * price saat pemusnahan
  }[];
  totalValueRp: number;
  createdAtISO: string;
  bapNo: string;            // mis. BAP/2026/05/001
}

export interface DemoBooking {
  id: string;
  tenantId: string;
  doctorId: string;
  dateISO: string;       // YYYY-MM-DD
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  patientName: string;
  patientPhone: string;
  complaint?: string;
  status: DemoBookingStatus;
  createdAtISO: string;
}

// === POS Sales (untuk laporan Laba Kotor / gross profit) ===
export interface DemoPOSSaleItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;       // harga jual per unit (setelah diskon item, kalau ada)
  subtotalRp: number;      // qty * unitPrice
  costRp: number;          // total HPP item ini (sum qty*costPrice per batch yang dipakai)
  consumed: { batchNo: string; qty: number; costPrice: number }[];
}
export interface DemoPOSSale {
  id: string;
  tenantId: string;
  trxId: string;           // TRX-XXXX
  dateISO: string;         // YYYY-MM-DD
  ts: string;              // ISO timestamp
  items: DemoPOSSaleItem[];
  subtotalRp: number;
  discountRp: number;
  totalRp: number;         // omzet (revenue) yang masuk kas
  totalCostRp: number;     // HPP total semua item
  grossProfitRp: number;   // totalRp - totalCostRp
  cashier: string;
  customerName?: string;
  paymentMethod: string;
}

interface DemoState {
  tenants: DemoTenant[];
  products: DemoProduct[];
  users: DemoUser[];
  doctors: DemoDoctor[];
  bookings: DemoBooking[];
  disposals: DemoDisposal[];
  suppliers: DemoSupplier[];
  returns: DemoReturn[];
  // Pembelian
  pos_pesanan: DemoPO[];
  grns: DemoGRN[];
  // Resep + Pasien
  patients: DemoPatient[];
  prescriptions: DemoPrescription[];
  // Defekta + Opname
  defektas: DemoDefekta[];
  opnames: DemoStockOpname[];
  // Compliance
  narcoticLogs: DemoNarcoticLog[];
  coldChainReadings: DemoColdChainReading[];
  // Akuntansi
  ledger: DemoLedgerEntry[];
  payables: DemoPayable[];
  receivables: DemoReceivable[];
  // POS sales (untuk gross profit)
  posSales: DemoPOSSale[];
  // Multi-outlet
  branches: DemoBranch[];
  transfers: DemoTransfer[];
  // Loyalty
  members: DemoMember[];
  loyaltyTxs: DemoLoyaltyTx[];
  // Asuransi
  insurers: DemoInsurer[];
  claims: DemoInsuranceClaim[];
  // Audit
  auditLogs: DemoAuditLog[];
  rolePermissions: Record<DemoUserRole, DemoPermission[]>;
  // Promo
  promos: DemoPromo[];
  // Notif
  notifications: DemoNotification[];
  // Telemed
  telemedSessions: DemoTelemedSession[];
  chatMessages: DemoChatMessage[];
  // Hardware
  hardwareSettings: DemoHardwareSettings[];
  // API
  webhooks: DemoWebhook[];
  apiKeys: DemoApiKey[];
  // tenant CRUD
  upsertTenant: (t: Partial<DemoTenant> & { id: string }) => void;
  getTenant: (id: string) => DemoTenant | undefined;
  // product CRUD
  upsertProduct: (p: Partial<DemoProduct> & { id: string; tenantId: string }) => void;
  removeProduct: (id: string) => void;
  toggleMarketplace: (id: string, value?: boolean) => void;
  // batch CRUD (FEFO)
  addBatch: (productId: string, batch: Omit<DemoBatch, "id">) => void;
  removeBatch: (productId: string, batchId: string) => void;
  // user CRUD
  upsertUser: (u: Partial<DemoUser> & { id: string; tenantId: string }) => void;
  removeUser: (id: string) => void;
  toggleUserActive: (id: string, value?: boolean) => void;
  // doctor CRUD
  upsertDoctor: (d: Partial<DemoDoctor> & { id: string; tenantId: string }) => void;
  removeDoctor: (id: string) => void;
  toggleDoctorActive: (id: string, value?: boolean) => void;
  // booking CRUD
  addBooking: (b: Omit<DemoBooking, "id" | "createdAtISO" | "status"> & { status?: DemoBookingStatus }) => DemoBooking;
  cancelBooking: (id: string) => void;
  // disposal (pemusnahan / BAP)
  addDisposal: (d: Omit<DemoDisposal, "id" | "createdAtISO" | "bapNo">) => DemoDisposal;
  // suppliers
  upsertSupplier: (s: Partial<DemoSupplier> & { id: string; tenantId: string }) => void;
  removeSupplier: (id: string) => void;
  toggleSupplierActive: (id: string, value?: boolean) => void;
  // returns to supplier
  addReturn: (r: Omit<DemoReturn, "id" | "createdAtISO" | "noReturn" | "supplierName">) => DemoReturn;
  updateReturnStatus: (id: string, status: DemoReturnStatus, rejectionReason?: string) => void;
  // Pembelian (PO+GRN)
  addPO: (p: Omit<DemoPO, "id" | "createdAtISO" | "noPO" | "supplierName">) => DemoPO;
  updatePOStatus: (id: string, status: DemoPOStatus) => void;
  removePO: (id: string) => void;
  addGRN: (g: Omit<DemoGRN, "id" | "createdAtISO" | "noGRN" | "supplierName">) => DemoGRN;
  // Resep + Pasien
  upsertPatient: (p: Partial<DemoPatient> & { id: string; tenantId: string }) => void;
  addPrescription: (r: Omit<DemoPrescription, "id" | "createdAtISO" | "noResep" | "drpFindings">) => DemoPrescription;
  updatePrescription: (id: string, patch: Partial<DemoPrescription>) => void;
  // Defekta
  addDefekta: (d: Omit<DemoDefekta, "id" | "createdAtISO" | "noDefekta">) => DemoDefekta;
  updateDefektaStatus: (id: string, status: DemoDefekta["status"]) => void;
  // Opname
  addOpname: (o: Omit<DemoStockOpname, "id" | "createdAtISO" | "noSO">) => DemoStockOpname;
  postOpname: (id: string, approverName: string) => void;
  // Compliance
  addNarcoticLog: (l: Omit<DemoNarcoticLog, "id" | "createdAtISO">) => void;
  addColdChainReading: (r: Omit<DemoColdChainReading, "id">) => void;
  // Akuntansi
  addLedger: (e: Omit<DemoLedgerEntry, "id" | "createdAtISO">) => DemoLedgerEntry;
  addPayable: (p: Omit<DemoPayable, "id" | "createdAtISO" | "status" | "paidRp">) => DemoPayable;
  payPayable: (id: string, amountRp: number) => void;
  addReceivable: (r: Omit<DemoReceivable, "id" | "createdAtISO" | "status" | "paidRp">) => DemoReceivable;
  receiveReceivable: (id: string, amountRp: number) => void;
  // POS sales
  addPosSale: (s: Omit<DemoPOSSale, "id">) => DemoPOSSale;
  // Multi-outlet
  upsertBranch: (b: Partial<DemoBranch> & { id: string; tenantId: string }) => void;
  removeBranch: (id: string) => void;
  addTransfer: (t: Omit<DemoTransfer, "id" | "createdAtISO" | "noTransfer">) => DemoTransfer;
  updateTransferStatus: (id: string, status: DemoTransferStatus) => void;
  // Loyalty
  upsertMember: (m: Partial<DemoMember> & { id: string; tenantId: string }) => void;
  addLoyaltyTx: (t: Omit<DemoLoyaltyTx, "id" | "createdAtISO">) => void;
  // Asuransi
  upsertInsurer: (i: Partial<DemoInsurer> & { id: string; tenantId: string }) => void;
  addClaim: (c: Omit<DemoInsuranceClaim, "id" | "createdAtISO" | "noClaim" | "insurerName" | "approvedRp">) => DemoInsuranceClaim;
  updateClaimStatus: (id: string, status: DemoClaimStatus, approvedRp?: number, rejectionReason?: string) => void;
  // Audit
  addAuditLog: (l: Omit<DemoAuditLog, "id" | "createdAtISO">) => void;
  setRolePermissions: (role: DemoUserRole, perms: DemoPermission[]) => void;
  // Promo
  upsertPromo: (p: Partial<DemoPromo> & { id: string; tenantId: string }) => void;
  removePromo: (id: string) => void;
  // Notif
  enqueueNotification: (n: Omit<DemoNotification, "id" | "createdAtISO" | "status"> & { status?: DemoNotifStatus }) => DemoNotification;
  markNotificationSent: (id: string) => void;
  // Telemed
  startTelemedSession: (s: Omit<DemoTelemedSession, "id" | "startedISO" | "status">) => DemoTelemedSession;
  endTelemedSession: (id: string) => void;
  addChatMessage: (m: Omit<DemoChatMessage, "id" | "createdAtISO">) => void;
  // Hardware
  upsertHardwareSettings: (h: DemoHardwareSettings) => void;
  // API
  upsertWebhook: (w: Partial<DemoWebhook> & { id: string; tenantId: string }) => void;
  removeWebhook: (id: string) => void;
  upsertApiKey: (k: Partial<DemoApiKey> & { id: string; tenantId: string }) => void;
  removeApiKey: (id: string) => void;
  // helpers
  productStock: (productId: string) => number;
}

// ---------- Helpers ----------
const newId = () => Math.random().toString(36).slice(2, 10);
const today = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const totalQty = (batches: DemoBatch[]) => batches.reduce((s, b) => s + (b.qty || 0), 0);

// ---------- Seed data ----------
const SEED_TENANTS: DemoTenant[] = [
  {
    id: "demo-admin-apotek",
    name: "Apotek Yuyun",
    slug: "apotek-yuyun",
    logoEmoji: "🏥",
    primaryColor: "#10b981",
    city: "Batam",
    address: "Piayu, Sei Beduk, Kota Batam, Kepulauan Riau",
    lat: 1.0628,
    lng: 104.0408,
    phone: "0778-123456",
    whatsapp: "081234567890",
    distanceKm: 0.5,
    rating: 4.9,
    marketplaceEnabled: true,
    bank: { bankName: "BCA", accountNumber: "1234567890", accountHolder: "Apotek Yuyun" },
    npwp: "12.345.678.9-012.000",
    sia: "SIA/2024/0001",
    plan: "PRO",
    subscriptionStatus: "ACTIVE",
    subscribedAtISO: today(-365),
    nextBillingISO: today(15),
    mrr: 499000,
  },
  {
    id: "demo-tenant-maju",
    name: "Apotek Maju Jaya",
    slug: "maju-jaya",
    logoEmoji: "💊",
    primaryColor: "#0ea5e9",
    city: "Jakarta Selatan",
    address: "Jl. Sudirman No. 88, Jakarta Selatan",
    lat: -6.2088,
    lng: 106.8456,
    phone: "021-7654321",
    whatsapp: "081298765432",
    distanceKm: 1.2,
    rating: 4.7,
    marketplaceEnabled: true,
    bank: { bankName: "Mandiri", accountNumber: "9876543210", accountHolder: "Apotek Maju Jaya" },
    plan: "STARTER",
    subscriptionStatus: "ACTIVE",
    subscribedAtISO: today(-180),
    nextBillingISO: today(7),
    mrr: 199000,
  },
  {
    id: "demo-tenant-mitra",
    name: "Apotek Mitra Sehat",
    slug: "mitra-sehat",
    logoEmoji: "🌿",
    primaryColor: "#f59e0b",
    city: "Jakarta Barat",
    address: "Jl. Daan Mogot KM 5, Jakarta Barat",
    lat: -6.1683,
    lng: 106.7588,
    phone: "021-5556677",
    whatsapp: "081355667788",
    distanceKm: 2.0,
    rating: 4.8,
    marketplaceEnabled: true,
    bank: { bankName: "BNI", accountNumber: "5544332211", accountHolder: "Apotek Mitra Sehat" },
    plan: "ENTERPRISE",
    subscriptionStatus: "ACTIVE",
    subscribedAtISO: today(-540),
    nextBillingISO: today(22),
    mrr: 1499000,
  },
];

const SEED_PRODUCTS: DemoProduct[] = [
  // === Apotek Sentosa Admin ===
  { id: "p-adm-001", tenantId: "demo-admin-apotek", name: "Paracetamol 500mg", category: "Obat Bebas", price: 8000,
    emoji: "💊", gradient: "from-brand-100 to-accent-100", desc: "Pereda demam & nyeri ringan. Per strip isi 10 tablet.",
    unit: "strip", rxRequired: false, marketplaceEnabled: true, minStock: 50,
    batches: [
      { id: newId(), batchNo: "PCM-2027A", qty: 120, expiryISO: today(420), supplierId: "sup-001" }, // SAFE
      { id: newId(), batchNo: "PCM-2026B", qty: 80, expiryISO: today(150), supplierId: "sup-001" },  // WATCH
      { id: newId(), batchNo: "PCM-2026C", qty: 40, expiryISO: today(20), supplierId: "sup-002" },   // CRITICAL
    ] },
  { id: "p-adm-002", tenantId: "demo-admin-apotek", name: "Vitamin C 1000mg", category: "Vitamin", price: 45000,
    emoji: "🍊", gradient: "from-warn-100 to-brand-100", desc: "Suplemen daya tahan tubuh. Botol isi 30 tablet effervescent.",
    unit: "botol", rxRequired: false, marketplaceEnabled: true, minStock: 20,
    batches: [{ id: newId(), batchNo: "VTC-2027", qty: 60, expiryISO: today(540) }] },
  { id: "p-adm-003", tenantId: "demo-admin-apotek", name: "Masker Medis 3-Ply (50pcs)", category: "Alat Kesehatan", price: 25000,
    emoji: "😷", gradient: "from-brand-100 to-brand-200", desc: "Masker bedah 3 lapis, BPOM. Box isi 50 pcs.",
    unit: "box", rxRequired: false, marketplaceEnabled: true, minStock: 100,
    batches: [{ id: newId(), batchNo: "MSK-A001", qty: 320, expiryISO: today(900) }] },
  { id: "p-adm-004", tenantId: "demo-admin-apotek", name: "OBH Combi Plus Batuk Flu", category: "Obat Bebas", price: 22000,
    emoji: "🍯", gradient: "from-warn-100 to-warn-200", desc: "Sirup batuk + flu untuk dewasa. Botol 100ml.",
    unit: "botol", rxRequired: false, marketplaceEnabled: true, minStock: 30,
    batches: [
      { id: newId(), batchNo: "OBH-2026X", qty: 60, expiryISO: today(75), supplierId: "sup-004" },  // WARNING
      { id: newId(), batchNo: "OBH-2025Y", qty: 15, expiryISO: today(-12), supplierId: "sup-004" }, // EXPIRED
    ] },
  { id: "p-adm-005", tenantId: "demo-admin-apotek", name: "Amoxicillin 500mg", category: "Antibiotik", price: 15000,
    emoji: "💉", gradient: "from-accent-100 to-warn-100", desc: "Antibiotik resep dokter. Per strip isi 10 kapsul.",
    unit: "strip", rxRequired: true, marketplaceEnabled: true, minStock: 40,
    batches: [{ id: newId(), batchNo: "AMX-2026", qty: 95, expiryISO: today(360) }] },
  { id: "p-adm-006", tenantId: "demo-admin-apotek", name: "Plester Hansaplast (20pcs)", category: "P3K", price: 12000,
    emoji: "🩹", gradient: "from-warn-100 to-danger-100", desc: "Plester luka tahan air, isi 20 pcs.",
    unit: "box", rxRequired: false, marketplaceEnabled: true, minStock: 100,
    batches: [
      { id: newId(), batchNo: "PLT-A1", qty: 200, expiryISO: today(720) },
      { id: newId(), batchNo: "PLT-OLD", qty: 8, expiryISO: today(-45) }, // EXPIRED kecil
    ] },

  // === Apotek Maju Jaya ===
  { id: "p-maj-001", tenantId: "demo-tenant-maju", name: "Insulin Pen NovoRapid", category: "Diabetes", price: 285000,
    emoji: "💉", gradient: "from-danger-100 to-warn-100", desc: "Insulin kerja cepat untuk penderita diabetes. Resep wajib.",
    unit: "pen", rxRequired: true, marketplaceEnabled: true, minStock: 5,
    batches: [{ id: newId(), batchNo: "INS-NR-2026", qty: 18, expiryISO: today(300) }] },
  { id: "p-maj-002", tenantId: "demo-tenant-maju", name: "Hand Sanitizer 100ml", category: "Antiseptik", price: 18000,
    emoji: "🧴", gradient: "from-brand-100 to-brand-200", desc: "Alkohol 70%. Praktis dibawa kemana-mana.",
    unit: "botol", rxRequired: false, marketplaceEnabled: true, minStock: 100,
    batches: [{ id: newId(), batchNo: "HSN-A", qty: 250, expiryISO: today(540) }] },
  { id: "p-maj-003", tenantId: "demo-tenant-maju", name: "Multivitamin Anak Sirup", category: "Vitamin", price: 38000,
    emoji: "🧒", gradient: "from-warn-100 to-accent-100", desc: "Multivitamin rasa jeruk untuk anak 1-12 tahun.",
    unit: "botol", rxRequired: false, marketplaceEnabled: true, minStock: 25,
    batches: [{ id: newId(), batchNo: "MVA-2026", qty: 70, expiryISO: today(420) }] },

  // === Apotek Mitra Sehat ===
  { id: "p-mit-001", tenantId: "demo-tenant-mitra", name: "Madu Murni 250ml", category: "Herbal", price: 65000,
    emoji: "🍯", gradient: "from-warn-100 to-warn-200", desc: "Madu murni hutan, tanpa gula tambahan.",
    unit: "botol", rxRequired: false, marketplaceEnabled: true, minStock: 15,
    batches: [{ id: newId(), batchNo: "MAD-2026", qty: 40, expiryISO: today(720) }] },
  { id: "p-mit-002", tenantId: "demo-tenant-mitra", name: "Tensimeter Digital Omron", category: "Alat Kesehatan", price: 485000,
    emoji: "🩺", gradient: "from-accent-100 to-brand-100", desc: "Pengukur tekanan darah otomatis. Garansi 5 tahun.",
    unit: "unit", rxRequired: false, marketplaceEnabled: true, minStock: 3,
    batches: [{ id: newId(), batchNo: "OMR-A1", qty: 12, expiryISO: today(1825) }] },
  { id: "p-mit-003", tenantId: "demo-tenant-mitra", name: "Susu Formula Bayi 0-6", category: "Ibu & Anak", price: 125000,
    emoji: "🍼", gradient: "from-brand-100 to-accent-100", desc: "Formula gizi lengkap usia 0-6 bulan. Kaleng 400gr.",
    unit: "kaleng", rxRequired: false, marketplaceEnabled: true, minStock: 10,
    batches: [{ id: newId(), batchNo: "SF-0M6-26", qty: 55, expiryISO: today(360) }] },
  { id: "p-mit-004", tenantId: "demo-tenant-mitra", name: "Salbutamol Inhaler", category: "Pernapasan", price: 95000,
    emoji: "💨", gradient: "from-accent-100 to-brand-100", desc: "Inhaler asma kerja cepat. Resep dokter.",
    unit: "tabung", rxRequired: true, marketplaceEnabled: true, minStock: 5,
    batches: [{ id: newId(), batchNo: "SBT-26", qty: 22, expiryISO: today(450) }] },
];

const SEED_USERS: DemoUser[] = [
  // === Apotek Sentosa Admin ===
  { id: "u-adm-001", tenantId: "demo-admin-apotek", name: "Dr. Budi Santoso, S.Farm., Apt.", email: "budi@sentosa.co.id", phone: "081234567890",
    role: "OWNER", active: true, avatarEmoji: "👨‍💼", joinedISO: today(-720), lastLoginISO: today(0), sipa: "SIPA/2020/0123" },
  { id: "u-adm-002", tenantId: "demo-admin-apotek", name: "Apt. Siti Aminah, S.Farm.", email: "siti@sentosa.co.id", phone: "081298765432",
    role: "APOTEKER", active: true, avatarEmoji: "👩‍⚕️", joinedISO: today(-540), lastLoginISO: today(-1), sipa: "SIPA/2021/0456" },
  { id: "u-adm-003", tenantId: "demo-admin-apotek", name: "Andi Kurniawan", email: "andi@sentosa.co.id", phone: "081312345678",
    role: "KASIR", active: true, avatarEmoji: "🛒", joinedISO: today(-365), lastLoginISO: today(0) },
  { id: "u-adm-004", tenantId: "demo-admin-apotek", name: "Rina Marlina", email: "rina@sentosa.co.id", phone: "081387654321",
    role: "KASIR", active: true, avatarEmoji: "👩‍💼", joinedISO: today(-180), lastLoginISO: today(0) },
  { id: "u-adm-005", tenantId: "demo-admin-apotek", name: "Joko Susilo", email: "joko@sentosa.co.id", phone: "081555444333",
    role: "STAFF", active: false, avatarEmoji: "👨", joinedISO: today(-90), lastLoginISO: today(-30) },

  // === Apotek Maju Jaya ===
  { id: "u-maj-001", tenantId: "demo-tenant-maju", name: "Hendra Wijaya", email: "hendra@majujaya.co.id", phone: "081200001111",
    role: "OWNER", active: true, avatarEmoji: "👨‍💼", joinedISO: today(-900), lastLoginISO: today(-2) },
  { id: "u-maj-002", tenantId: "demo-tenant-maju", name: "Apt. Dewi Lestari, S.Farm.", email: "dewi@majujaya.co.id", phone: "081200002222",
    role: "APOTEKER", active: true, avatarEmoji: "👩‍⚕️", joinedISO: today(-600), lastLoginISO: today(-1), sipa: "SIPA/2022/0789" },

  // === Apotek Mitra Sehat ===
  { id: "u-mit-001", tenantId: "demo-tenant-mitra", name: "Bambang Pratama", email: "bambang@mitrasehat.co.id", phone: "081300001111",
    role: "OWNER", active: true, avatarEmoji: "👨‍💼", joinedISO: today(-1200), lastLoginISO: today(0) },
];

// ---------- Seed doctors ----------
const SEED_DOCTORS: DemoDoctor[] = [
  {
    id: "d-yuyun-001",
    tenantId: "demo-admin-apotek",
    name: "dr. Andini Pratiwi, Sp.A",
    specialty: "Dokter Anak",
    avatarEmoji: "👩‍⚕️",
    fee: 150000,
    slotMinutes: 30,
    active: true,
    sip: "SIP/2022/001",
    about: "Dokter spesialis anak, lulusan FK UI 2015. Praktik 7 tahun di RS dan klinik anak.",
    schedule: [
      { dayOfWeek: 1, startTime: "16:00", endTime: "20:00" },
      { dayOfWeek: 3, startTime: "16:00", endTime: "20:00" },
      { dayOfWeek: 5, startTime: "16:00", endTime: "20:00" },
      { dayOfWeek: 6, startTime: "09:00", endTime: "13:00" },
    ],
  },
  {
    id: "d-yuyun-002",
    tenantId: "demo-admin-apotek",
    name: "dr. Bambang Setiawan",
    specialty: "Dokter Umum",
    avatarEmoji: "👨‍⚕️",
    fee: 80000,
    slotMinutes: 20,
    active: true,
    sip: "SIP/2018/045",
    about: "Dokter umum, melayani konsultasi penyakit harian, surat sakit, vaksinasi.",
    schedule: [
      { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 2, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 3, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 4, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 5, startTime: "08:00", endTime: "12:00" },
      { dayOfWeek: 6, startTime: "08:00", endTime: "11:00" },
    ],
  },
  {
    id: "d-yuyun-003",
    tenantId: "demo-admin-apotek",
    name: "drg. Citra Lestari",
    specialty: "Dokter Gigi",
    avatarEmoji: "🦷",
    fee: 200000,
    slotMinutes: 45,
    active: true,
    sip: "SIP/2020/078",
    about: "Dokter gigi umum: scaling, penambalan, cabut gigi, konsultasi ortodonti.",
    schedule: [
      { dayOfWeek: 2, startTime: "14:00", endTime: "19:00" },
      { dayOfWeek: 4, startTime: "14:00", endTime: "19:00" },
      { dayOfWeek: 6, startTime: "13:00", endTime: "17:00" },
    ],
  },
];

const SEED_BOOKINGS: DemoBooking[] = [
  {
    id: "b-yuyun-001", tenantId: "demo-admin-apotek", doctorId: "d-yuyun-002",
    dateISO: today(0), startTime: "09:00", endTime: "09:20",
    patientName: "Pak Hasan", patientPhone: "081298765432",
    complaint: "Demam & batuk 2 hari", status: "BOOKED", createdAtISO: today(-1),
  },
  {
    id: "b-yuyun-002", tenantId: "demo-admin-apotek", doctorId: "d-yuyun-001",
    dateISO: today(1), startTime: "16:30", endTime: "17:00",
    patientName: "Bu Sari (anak: Lila, 4thn)", patientPhone: "081387654321",
    complaint: "Imunisasi lanjutan", status: "BOOKED", createdAtISO: today(0),
  },
];

// ---------- Seed suppliers ----------
const SEED_SUPPLIERS: DemoSupplier[] = [
  {
    id: "sup-001", tenantId: "demo-admin-apotek",
    name: "PT Kimia Farma Trading & Distribution",
    picName: "Bp. Hendra (Sales Area Batam)",
    phone: "0778-451200", whatsapp: "081377001122",
    email: "sales.batam@kfd.co.id",
    address: "Jl. Hang Tuah No. 12, Batam Center",
    returnable: true, returnMinDaysBeforeED: 90,
    returnNotes: "Boleh retur kemasan utuh, ED ≥ 3 bulan, max 5% omzet/bulan.",
    active: true, createdAtISO: today(-540),
  },
  {
    id: "sup-002", tenantId: "demo-admin-apotek",
    name: "PT Phapros Tbk",
    picName: "Ibu Ratna",
    phone: "0778-323411", whatsapp: "081299887766",
    email: "cs.batam@phapros.co.id",
    address: "Komplek Bisnis Central Sudirman Blok C-12, Batam",
    returnable: true, returnMinDaysBeforeED: 60,
    returnNotes: "Retur diterima jika ED ≥ 2 bulan. Wajib BAR (Berita Acara Retur).",
    active: true, createdAtISO: today(-360),
  },
  {
    id: "sup-003", tenantId: "demo-admin-apotek",
    name: "CV Sumber Sehat (Lokal)",
    picName: "Pak Anto",
    phone: "0778-110099", whatsapp: "081234001100",
    address: "Ruko Mega Legenda Blok A-7, Batam",
    returnable: false, returnMinDaysBeforeED: 0,
    returnNotes: "Tidak menerima retur (barang putus). Wajib opname ketat sebelum order.",
    active: true, createdAtISO: today(-180),
  },
  {
    id: "sup-004", tenantId: "demo-admin-apotek",
    name: "PT Combiphar",
    picName: "Bp. Yuda",
    phone: "021-50112233", whatsapp: "08111223344",
    email: "sales.kepri@combiphar.com",
    address: "Jakarta (DC Region Sumatera)",
    returnable: true, returnMinDaysBeforeED: 90,
    returnNotes: "Form retur online. Pickup tiap Jumat.",
    active: true, createdAtISO: today(-720),
  },
];

// ---------- Seed pasien ----------
const SEED_PATIENTS: DemoPatient[] = [
  {
    id: "pt-001", tenantId: "demo-admin-apotek",
    name: "Ibu Sari Nurhayati", phone: "081298765432",
    nik: "2171015804850001", dob: "1985-04-18", gender: "F",
    address: "Perumahan Bukit Indah Blok C-12, Batam",
    allergies: ["penisilin"], chronicConditions: ["hipertensi"],
    insurer: "BPJS", membershipId: "mem-001", pointsBalance: 240,
    createdAtISO: today(-300),
  },
  {
    id: "pt-002", tenantId: "demo-admin-apotek",
    name: "Bp. Hasan Budiman", phone: "081387654321",
    nik: "2171010101800002", dob: "1980-01-01", gender: "M",
    address: "Jl. Hang Tuah No. 45, Batam",
    allergies: [], chronicConditions: ["DM tipe 2"],
    insurer: "Cash", pointsBalance: 80,
    createdAtISO: today(-180),
  },
  {
    id: "pt-003", tenantId: "demo-admin-apotek",
    name: "An. Lila (anak Bu Sari)", phone: "081298765432",
    dob: "2021-03-10", gender: "F",
    allergies: [], chronicConditions: [],
    insurer: "BPJS", pointsBalance: 0,
    createdAtISO: today(-90),
  },
];

// ---------- Seed cold-chain readings (vaksin/insulin) ----------
const SEED_COLDCHAIN: DemoColdChainReading[] = [
  { id: "cc-001", tenantId: "demo-admin-apotek", unitName: "Kulkas Vaksin 1", tempCelsius: 5.2, withinRange: true,  takenAtISO: new Date(Date.now() - 6 * 3600_000).toISOString(), takenByName: "Apt. Siti Aminah" },
  { id: "cc-002", tenantId: "demo-admin-apotek", unitName: "Kulkas Vaksin 1", tempCelsius: 4.8, withinRange: true,  takenAtISO: new Date(Date.now() - 12 * 3600_000).toISOString(), takenByName: "Andi Kurniawan" },
  { id: "cc-003", tenantId: "demo-admin-apotek", unitName: "Kulkas Insulin",  tempCelsius: 7.6, withinRange: true,  takenAtISO: new Date(Date.now() - 18 * 3600_000).toISOString(), takenByName: "Apt. Siti Aminah" },
  { id: "cc-004", tenantId: "demo-admin-apotek", unitName: "Kulkas Vaksin 1", tempCelsius: 9.1, withinRange: false, takenAtISO: new Date(Date.now() - 24 * 3600_000).toISOString(), takenByName: "Joko Susilo", notes: "Pintu kulkas dibiarkan terbuka 15 menit — dilaporkan ke apoteker." },
];

// ---------- Seed branches (cabang) ----------
const SEED_BRANCHES: DemoBranch[] = [
  {
    id: "br-001", tenantId: "demo-admin-apotek",
    name: "Apotek Yuyun — HQ Piayu", address: "Piayu, Sei Beduk, Batam",
    phone: "0778-123456", managerName: "Dr. Budi Santoso, S.Farm., Apt.",
    active: true, isHQ: true, createdAtISO: today(-720),
  },
  {
    id: "br-002", tenantId: "demo-admin-apotek",
    name: "Apotek Yuyun — Cabang Batam Center", address: "Komplek Mahkota Raya Blok A-9, Batam Center",
    phone: "0778-457788", managerName: "Apt. Siti Aminah, S.Farm.",
    active: true, isHQ: false, createdAtISO: today(-365),
  },
  {
    id: "br-003", tenantId: "demo-admin-apotek",
    name: "Apotek Yuyun — Cabang Bengkong", address: "Ruko Bengkong Sadai No. 14, Batam",
    phone: "0778-998822", managerName: "Andi Kurniawan",
    active: true, isHQ: false, createdAtISO: today(-180),
  },
];

// ---------- Seed members loyalty ----------
const SEED_MEMBERS: DemoMember[] = [
  { id: "mem-001", tenantId: "demo-admin-apotek", patientId: "pt-001", cardNo: "M-2026-0001", name: "Ibu Sari Nurhayati", phone: "081298765432", email: "sari@example.com", birthDateISO: "1985-04-18", joinedISO: today(-300), tier: "GOLD",     pointsBalance: 240, totalSpendRp: 4_800_000, active: true },
  { id: "mem-002", tenantId: "demo-admin-apotek", patientId: "pt-002", cardNo: "M-2026-0002", name: "Bp. Hasan Budiman",  phone: "081387654321", joinedISO: today(-180), tier: "SILVER",   pointsBalance: 80,  totalSpendRp: 1_200_000, active: true },
  { id: "mem-003", tenantId: "demo-admin-apotek",                       cardNo: "M-2026-0003", name: "Ibu Lina Wijaya",   phone: "081234500011", joinedISO: today(-30),  tier: "PLATINUM", pointsBalance: 1250,totalSpendRp: 25_000_000,active: true },
];

// ---------- Seed asuransi ----------
const SEED_INSURERS: DemoInsurer[] = [
  { id: "ins-bpjs",      tenantId: "demo-admin-apotek", name: "BPJS Kesehatan", type: "BPJS",    picName: "Cabang Batam", phone: "0778-461234", contractNo: "PKS-BPJS/2024/0123", active: true, createdAtISO: today(-540) },
  { id: "ins-admedika",  tenantId: "demo-admin-apotek", name: "Admedika",       type: "PRIVATE", picName: "Bp. Aditya",   phone: "021-29977888", contractNo: "PKS-ADM/2025/088", active: true, createdAtISO: today(-365) },
  { id: "ins-inhealth",  tenantId: "demo-admin-apotek", name: "Mandiri Inhealth", type: "PRIVATE", picName: "Ibu Tania",  phone: "021-25503999", contractNo: "PKS-INH/2025/045", active: true, createdAtISO: today(-200) },
];

// ---------- Default permission matrix per role ----------
const DEFAULT_ROLE_PERMISSIONS: Record<DemoUserRole, DemoPermission[]> = {
  OWNER: [
    "POS_USE","POS_VOID","PRODUCT_EDIT","PRICE_EDIT","BATCH_EDIT",
    "USER_MANAGE","ROLE_MANAGE","REPORT_VIEW","REPORT_EXPORT",
    "PURCHASE_CREATE","PURCHASE_RECEIVE","RETURN_MANAGE",
    "DISPOSAL_APPROVE","RX_DISPENSE","RX_COUNSEL","OPNAME_POST",
    "PAYABLE_PAY","RECEIVABLE_RECEIVE","CLAIM_SUBMIT",
    "MEMBER_MANAGE","PROMO_MANAGE","AUDIT_VIEW","SETTINGS_EDIT",
  ],
  APOTEKER: [
    "POS_USE","POS_VOID","PRODUCT_EDIT","BATCH_EDIT",
    "REPORT_VIEW","PURCHASE_CREATE","PURCHASE_RECEIVE","RETURN_MANAGE",
    "DISPOSAL_APPROVE","RX_DISPENSE","RX_COUNSEL","OPNAME_POST",
    "MEMBER_MANAGE","CLAIM_SUBMIT",
  ],
  KASIR: [
    "POS_USE","MEMBER_MANAGE","RX_DISPENSE",
  ],
  STAFF: [
    "REPORT_VIEW",
  ],
};

// ---------- Seed promo ----------
const SEED_PROMOS: DemoPromo[] = [
  {
    id: "pm-ed-auto", tenantId: "demo-admin-apotek",
    code: "ED-NEAR-AUTO", name: "Auto-diskon batch ED dekat",
    type: "ED_NEAR_AUTO", discountPercent: 20,
    edZoneTrigger: "WARNING",
    startISO: today(-30), endISO: today(365), active: true,
    createdAtISO: today(-30),
  },
  {
    id: "pm-vit-c", tenantId: "demo-admin-apotek",
    code: "SEHAT10", name: "Diskon 10% Vitamin & Suplemen",
    type: "PERCENT_OFF", discountPercent: 10,
    applyToCategory: "Vitamin", minSubtotalRp: 50000,
    startISO: today(-7), endISO: today(30), active: true,
    createdAtISO: today(-7),
  },
  {
    id: "pm-mask-bundle", tenantId: "demo-admin-apotek",
    code: "MASKBUY2", name: "Beli 2 Masker Gratis 1",
    type: "BUY_X_GET_Y", buyQty: 2, getQty: 1,
    applyToProductIds: ["p-adm-003"],
    startISO: today(-3), endISO: today(20), active: true,
    createdAtISO: today(-3),
  },
];

// ---------- Default hardware settings per tenant ----------
const SEED_HARDWARE: DemoHardwareSettings[] = [
  { tenantId: "demo-admin-apotek", printerType: "THERMAL_80", scannerEnabled: true, cashDrawerEnabled: true, customerDisplayEnabled: false, scaleEnabled: false, rfidEnabled: false },
];

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      tenants: [],
      products: [],
      users: [],
      doctors: [],
      bookings: [],
      disposals: [],
      suppliers: [],
      returns: [],
      pos_pesanan: [], grns: [],
      patients: [], prescriptions: [],
      defektas: [], opnames: [],
      narcoticLogs: [], coldChainReadings: [],
      ledger: [], payables: [], receivables: [],
      posSales: [],
      branches: [], transfers: [],
      members: [], loyaltyTxs: [],
      insurers: [], claims: [],
      auditLogs: [], rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      promos: [],
      notifications: [],
      telemedSessions: [], chatMessages: [],
      hardwareSettings: [],
      webhooks: [], apiKeys: [],

      upsertTenant: (t) => set((s) => {
        const idx = s.tenants.findIndex((x) => x.id === t.id);
        if (idx === -1) return { tenants: [...s.tenants, t as DemoTenant] };
        const next = [...s.tenants];
        next[idx] = { ...next[idx], ...t };
        return { tenants: next };
      }),

      getTenant: (id) => get().tenants.find((t) => t.id === id),

      upsertProduct: (p) => set((s) => {
        const idx = s.products.findIndex((x) => x.id === p.id);
        if (idx === -1) {
          const seeded: DemoProduct = {
            id: p.id,
            tenantId: p.tenantId,
            name: p.name ?? "Produk Baru",
            category: p.category ?? "Lainnya",
            price: p.price ?? 0,
            emoji: p.emoji ?? "💊",
            gradient: p.gradient ?? "from-brand-100 to-accent-100",
            desc: p.desc ?? "",
            unit: p.unit ?? "pcs",
            rxRequired: !!p.rxRequired,
            marketplaceEnabled: p.marketplaceEnabled ?? true,
            minStock: p.minStock ?? 10,
            batches: p.batches ?? [],
          };
          return { products: [...s.products, seeded] };
        }
        const next = [...s.products];
        next[idx] = { ...next[idx], ...p };
        return { products: next };
      }),

      removeProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      toggleMarketplace: (id, value) => set((s) => ({
        products: s.products.map((p) =>
          p.id === id ? { ...p, marketplaceEnabled: value ?? !p.marketplaceEnabled } : p
        ),
      })),

      addBatch: (productId, batch) => set((s) => ({
        products: s.products.map((p) =>
          p.id === productId ? { ...p, batches: [...p.batches, { ...batch, id: newId() }] } : p
        ),
      })),

      removeBatch: (productId, batchId) => set((s) => ({
        products: s.products.map((p) =>
          p.id === productId ? { ...p, batches: p.batches.filter((b) => b.id !== batchId) } : p
        ),
      })),

      upsertUser: (u) => set((s) => {
        const idx = s.users.findIndex((x) => x.id === u.id);
        if (idx === -1) {
          const seeded: DemoUser = {
            id: u.id,
            tenantId: u.tenantId,
            name: u.name ?? "User Baru",
            email: u.email ?? "",
            phone: u.phone ?? "",
            role: (u.role as DemoUserRole) ?? "STAFF",
            active: u.active ?? true,
            avatarEmoji: u.avatarEmoji ?? "👤",
            joinedISO: u.joinedISO ?? today(0),
            lastLoginISO: u.lastLoginISO,
            sipa: u.sipa,
          };
          return { users: [...s.users, seeded] };
        }
        const next = [...s.users];
        next[idx] = { ...next[idx], ...u };
        return { users: next };
      }),

      removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

      toggleUserActive: (id, value) => set((s) => ({
        users: s.users.map((u) => (u.id === id ? { ...u, active: value ?? !u.active } : u)),
      })),

      upsertDoctor: (d) => set((s) => {
        const idx = s.doctors.findIndex((x) => x.id === d.id);
        if (idx === -1) {
          const seeded: DemoDoctor = {
            id: d.id,
            tenantId: d.tenantId,
            name: d.name ?? "Dokter Baru",
            specialty: d.specialty ?? "Dokter Umum",
            avatarEmoji: d.avatarEmoji ?? "👨‍⚕️",
            fee: d.fee ?? 100000,
            slotMinutes: d.slotMinutes ?? 30,
            active: d.active ?? true,
            schedule: d.schedule ?? [],
            about: d.about,
            sip: d.sip,
          };
          return { doctors: [...s.doctors, seeded] };
        }
        const next = [...s.doctors];
        next[idx] = { ...next[idx], ...d };
        return { doctors: next };
      }),

      removeDoctor: (id) => set((s) => ({ doctors: s.doctors.filter((d) => d.id !== id) })),

      toggleDoctorActive: (id, value) => set((s) => ({
        doctors: s.doctors.map((d) => (d.id === id ? { ...d, active: value ?? !d.active } : d)),
      })),

      addBooking: (b) => {
        const created: DemoBooking = {
          ...b,
          id: "bk-" + newId(),
          status: b.status ?? "BOOKED",
          createdAtISO: new Date().toISOString().slice(0, 10),
        };
        set((s) => ({ bookings: [...s.bookings, created] }));
        return created;
      },

      cancelBooking: (id) => set((s) => ({
        bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: "CANCELLED" } : b)),
      })),

      addDisposal: (d) => {
        const now = new Date();
        const yy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const seq = String(get().disposals.filter((x) => x.tenantId === d.tenantId && x.bapNo.includes(`/${yy}/${mm}/`)).length + 1).padStart(3, "0");
        const created: DemoDisposal = {
          ...d,
          id: "dsp-" + newId(),
          createdAtISO: now.toISOString().slice(0, 10),
          bapNo: `BAP/${yy}/${mm}/${seq}`,
        };
        // Remove disposed batches from product.batches
        set((s) => ({
          disposals: [...s.disposals, created],
          products: s.products.map((p) => {
            const items = d.items.filter((it) => it.productId === p.id);
            if (items.length === 0) return p;
            const removeIds = new Set(items.map((it) => `${it.productId}::${it.batchNo}::${it.expiryISO}`));
            return {
              ...p,
              batches: p.batches.filter((b) => !removeIds.has(`${p.id}::${b.batchNo}::${b.expiryISO}`)),
            };
          }),
        }));
        return created;
      },

      upsertSupplier: (s) => set((state) => {
        const idx = state.suppliers.findIndex((x) => x.id === s.id);
        if (idx === -1) {
          const seeded: DemoSupplier = {
            id: s.id,
            tenantId: s.tenantId,
            name: s.name ?? "Supplier Baru",
            picName: s.picName ?? "",
            phone: s.phone ?? "",
            whatsapp: s.whatsapp,
            email: s.email,
            address: s.address ?? "",
            returnable: s.returnable ?? true,
            returnMinDaysBeforeED: s.returnMinDaysBeforeED ?? 90,
            returnNotes: s.returnNotes,
            active: s.active ?? true,
            createdAtISO: s.createdAtISO ?? new Date().toISOString().slice(0, 10),
          };
          return { suppliers: [...state.suppliers, seeded] };
        }
        const next = [...state.suppliers];
        next[idx] = { ...next[idx], ...s };
        return { suppliers: next };
      }),

      removeSupplier: (id) => set((state) => ({ suppliers: state.suppliers.filter((s) => s.id !== id) })),

      toggleSupplierActive: (id, value) => set((state) => ({
        suppliers: state.suppliers.map((s) => (s.id === id ? { ...s, active: value ?? !s.active } : s)),
      })),

      addReturn: (r) => {
        const now = new Date();
        const yy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const seq = String(get().returns.filter((x) => x.tenantId === r.tenantId && x.noReturn.includes(`/${yy}/${mm}/`)).length + 1).padStart(3, "0");
        const supplier = get().suppliers.find((s) => s.id === r.supplierId);
        const created: DemoReturn = {
          ...r,
          id: "rtn-" + newId(),
          createdAtISO: now.toISOString().slice(0, 10),
          noReturn: `RTN/${yy}/${mm}/${seq}`,
          supplierName: supplier?.name ?? r.supplierId,
        };
        // Remove returned batches from inventory (status SENT or above commits stock removal).
        const commits = r.status !== "DRAFT";
        set((state) => ({
          returns: [...state.returns, created],
          products: commits ? state.products.map((p) => {
            const items = r.items.filter((it) => it.productId === p.id);
            if (items.length === 0) return p;
            // Decrement matched batches by qty (FIFO across same batchNo+expiry)
            const next = [...p.batches];
            for (const it of items) {
              const idx = next.findIndex((b) => b.batchNo === it.batchNo && b.expiryISO === it.expiryISO);
              if (idx === -1) continue;
              const remaining = next[idx].qty - it.qty;
              if (remaining <= 0) next.splice(idx, 1);
              else next[idx] = { ...next[idx], qty: remaining };
            }
            return { ...p, batches: next };
          }) : state.products,
        }));
        return created;
      },

      updateReturnStatus: (id, status, rejectionReason) => set((state) => ({
        returns: state.returns.map((r) => {
          if (r.id !== id) return r;
          const next: DemoReturn = { ...r, status };
          if (status === "ACCEPTED" || status === "COMPLETED") next.acceptedAtISO = new Date().toISOString().slice(0, 10);
          if (status === "REJECTED" && rejectionReason) next.rejectionReason = rejectionReason;
          return next;
        }),
        // If transitioning DRAFT → SENT, also commit stock removal (for safety)
        products: (() => {
          const old = state.returns.find((r) => r.id === id);
          if (!old || old.status !== "DRAFT" || status === "DRAFT" || status === "REJECTED") return state.products;
          return state.products.map((p) => {
            const items = old.items.filter((it) => it.productId === p.id);
            if (items.length === 0) return p;
            const next = [...p.batches];
            for (const it of items) {
              const idx = next.findIndex((b) => b.batchNo === it.batchNo && b.expiryISO === it.expiryISO);
              if (idx === -1) continue;
              const remaining = next[idx].qty - it.qty;
              if (remaining <= 0) next.splice(idx, 1);
              else next[idx] = { ...next[idx], qty: remaining };
            }
            return { ...p, batches: next };
          });
        })(),
      })),

      productStock: (productId) => {
        const p = get().products.find((x) => x.id === productId);
        return p ? totalQty(p.batches) : 0;
      },

      // ==================== Pembelian (PO + GRN) ====================
      addPO: (p) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().pos_pesanan.filter((x)=>x.tenantId===p.tenantId && x.noPO.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const sup = get().suppliers.find((s)=>s.id===p.supplierId);
        const created: DemoPO = {
          ...p, id: "po-"+newId(), createdAtISO: now.toISOString().slice(0,10),
          noPO: `PO/${yy}/${mm}/${seq}`,
          supplierName: sup?.name ?? p.supplierId,
        };
        set((s)=>({ pos_pesanan: [...s.pos_pesanan, created] }));
        return created;
      },
      updatePOStatus: (id, status) => set((s)=>({
        pos_pesanan: s.pos_pesanan.map((p)=> p.id===id ? { ...p, status } : p),
      })),
      removePO: (id) => set((s)=>({ pos_pesanan: s.pos_pesanan.filter((p)=>p.id!==id) })),

      addGRN: (g) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().grns.filter((x)=>x.tenantId===g.tenantId && x.noGRN.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const sup = get().suppliers.find((s)=>s.id===g.supplierId);
        const created: DemoGRN = {
          ...g, id: "grn-"+newId(), createdAtISO: now.toISOString().slice(0,10),
          noGRN: `GRN/${yy}/${mm}/${seq}`,
          supplierName: sup?.name ?? g.supplierId,
        };
        // Add batches dengan costPrice ke produk + auto-create payable
        set((s)=>({
          grns: [...s.grns, created],
          products: s.products.map((p)=>{
            const items = g.items.filter((it)=>it.productId===p.id);
            if (items.length===0) return p;
            const newBatches = items.map((it)=>({
              id: newId(), batchNo: it.batchNo, qty: it.qty,
              expiryISO: it.expiryISO, supplierId: g.supplierId,
              costPrice: it.costPrice, poId: g.poId, grnId: created.id,
            }));
            return { ...p, batches: [...p.batches, ...newBatches] };
          }),
          // update PO received qty + auto status
          pos_pesanan: g.poId ? s.pos_pesanan.map((po)=>{
            if (po.id !== g.poId) return po;
            const items = po.items.map((pi)=>{
              const grnQty = g.items.filter((gi)=>gi.productId===pi.productId).reduce((sum,gi)=>sum+gi.qty,0);
              return { ...pi, receivedQty: pi.receivedQty + grnQty };
            });
            const allDone = items.every((i)=>i.receivedQty >= i.qty);
            const anyDone = items.some((i)=>i.receivedQty > 0);
            return { ...po, items, status: allDone ? "RECEIVED" : anyDone ? "PARTIAL" : po.status };
          }) : s.pos_pesanan,
          // auto-create payable
          payables: [...s.payables, {
            id: "ap-"+newId(),
            tenantId: g.tenantId, supplierId: g.supplierId, supplierName: created.supplierName,
            grnId: created.id,
            invoiceNo: `INV-${created.noGRN.replace(/\//g,"-")}`,
            invoiceDateISO: g.dateISO,
            dueDateISO: new Date(Date.now()+30*86400_000).toISOString().slice(0,10),
            totalRp: g.totalRp, paidRp: 0, status: "OPEN" as DemoPayableStatus,
            createdAtISO: now.toISOString().slice(0,10),
          }],
          // auto-ledger entry
          ledger: [...s.ledger, {
            id: "le-"+newId(),
            tenantId: g.tenantId, dateISO: g.dateISO, type: "AP",
            category: "Pembelian (GRN)",
            description: `${created.noGRN} dari ${created.supplierName}`,
            amountRp: g.totalRp, refType: "GRN", refNo: created.noGRN,
            createdAtISO: now.toISOString().slice(0,10),
          }],
        }));
        return created;
      },

      // ==================== Resep + Pasien ====================
      upsertPatient: (p) => set((s)=>{
        const idx = s.patients.findIndex((x)=>x.id===p.id);
        if (idx===-1) {
          const seeded: DemoPatient = {
            id: p.id, tenantId: p.tenantId,
            name: p.name ?? "Pasien Baru", phone: p.phone ?? "",
            nik: p.nik, dob: p.dob, gender: p.gender, address: p.address,
            allergies: p.allergies ?? [], chronicConditions: p.chronicConditions ?? [],
            insurer: p.insurer, membershipId: p.membershipId,
            pointsBalance: p.pointsBalance ?? 0,
            createdAtISO: p.createdAtISO ?? today(0),
          };
          return { patients: [...s.patients, seeded] };
        }
        const next=[...s.patients]; next[idx]={...next[idx], ...p}; return { patients: next };
      }),
      addPrescription: (r) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().prescriptions.filter((x)=>x.tenantId===r.tenantId && x.noResep.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        // Auto DRP screening sederhana
        const findings: DemoDRPFinding[] = [];
        const patient = r.patientId ? get().patients.find((p)=>p.id===r.patientId) : undefined;
        const productNames = r.items.map((it)=>it.productName.toLowerCase());
        // Allergy check
        if (patient) {
          for (const al of patient.allergies) {
            for (const it of r.items) {
              if (it.productName.toLowerCase().includes(al.toLowerCase()) ||
                  (al==="penisilin" && /amoxi|ampicil|peni/.test(it.productName.toLowerCase()))) {
                findings.push({ type:"ALLERGY", severity:"DANGER", message:`Pasien alergi ${al} — produk ${it.productName} mengandung kelompok yang sama.` });
              }
            }
          }
        }
        // Drug-drug interaction (heuristic minimal)
        if (productNames.some((n)=>n.includes("warfarin")) && productNames.some((n)=>n.includes("aspirin"))) {
          findings.push({ type:"INTERACTION", severity:"DANGER", message:"Warfarin + Aspirin: risiko perdarahan tinggi." });
        }
        if (productNames.filter((n)=>n.includes("paracetamol")||n.includes("pcm")).length >= 2) {
          findings.push({ type:"DUPLICATION", severity:"WARN", message:"Duplikasi paracetamol pada resep — cek total dosis harian." });
        }
        const created: DemoPrescription = {
          ...r, id: "rx-"+newId(), createdAtISO: now.toISOString().slice(0,10),
          noResep: `R/${yy}/${mm}/${seq}`,
          drpFindings: findings,
        };
        set((s)=>({ prescriptions: [...s.prescriptions, created] }));
        return created;
      },
      updatePrescription: (id, patch) => set((s)=>({
        prescriptions: s.prescriptions.map((r)=> r.id===id ? { ...r, ...patch } : r),
      })),

      // ==================== Defekta ====================
      addDefekta: (d) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().defektas.filter((x)=>x.tenantId===d.tenantId && x.noDefekta.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const created: DemoDefekta = { ...d, id: "dfk-"+newId(), createdAtISO: now.toISOString().slice(0,10), noDefekta: `DFK/${yy}/${mm}/${seq}` };
        set((s)=>({ defektas: [...s.defektas, created] }));
        return created;
      },
      updateDefektaStatus: (id, status) => set((s)=>({
        defektas: s.defektas.map((d)=> d.id===id ? { ...d, status } : d),
      })),

      // ==================== Stock Opname ====================
      addOpname: (o) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().opnames.filter((x)=>x.tenantId===o.tenantId && x.noSO.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const created: DemoStockOpname = { ...o, id: "so-"+newId(), createdAtISO: now.toISOString().slice(0,10), noSO: `SO/${yy}/${mm}/${seq}` };
        set((s)=>({ opnames: [...s.opnames, created] }));
        return created;
      },
      postOpname: (id, approverName) => set((s)=>{
        const op = s.opnames.find((x)=>x.id===id);
        if (!op || op.status==="POSTED") return s;
        // Apply variance ke products: physicalQty menjadi qty batch yang baru
        const products = s.products.map((p)=>{
          const items = op.items.filter((it)=>it.productId===p.id);
          if (items.length===0) return p;
          const next=[...p.batches];
          for (const it of items) {
            const idx = next.findIndex((b)=>b.batchNo===it.batchNo && b.expiryISO===it.expiryISO);
            if (idx===-1) continue;
            if (it.physicalQty<=0) next.splice(idx,1);
            else next[idx] = { ...next[idx], qty: it.physicalQty };
          }
          return { ...p, batches: next };
        });
        return {
          opnames: s.opnames.map((x)=> x.id===id ? { ...x, status:"POSTED", approvedByName: approverName } : x),
          products,
        };
      }),

      // ==================== Compliance ====================
      addNarcoticLog: (l) => set((s)=>({
        narcoticLogs: [...s.narcoticLogs, { ...l, id: "nl-"+newId(), createdAtISO: new Date().toISOString() }],
      })),
      addColdChainReading: (r) => set((s)=>({
        coldChainReadings: [...s.coldChainReadings, { ...r, id: "cc-"+newId() }],
      })),

      // ==================== Akuntansi ====================
      addLedger: (e) => {
        const created: DemoLedgerEntry = { ...e, id: "le-"+newId(), createdAtISO: new Date().toISOString().slice(0,10) };
        set((s)=>({ ledger: [...s.ledger, created] }));
        return created;
      },
      addPosSale: (sale) => {
        const created: DemoPOSSale = { ...sale, id: "ps-"+newId() };
        set((s)=>({ posSales: [...s.posSales, created] }));
        return created;
      },
      addPayable: (p) => {
        const created: DemoPayable = { ...p, id: "ap-"+newId(), createdAtISO: today(0), paidRp: 0, status: "OPEN" };
        set((s)=>({ payables: [...s.payables, created] }));
        return created;
      },
      payPayable: (id, amountRp) => set((s)=>({
        payables: s.payables.map((p)=>{
          if (p.id!==id) return p;
          const paid = p.paidRp + amountRp;
          const status: DemoPayableStatus = paid>=p.totalRp ? "PAID" : paid>0 ? "PARTIAL" : p.status;
          return { ...p, paidRp: paid, status };
        }),
        ledger: [...s.ledger, {
          id: "le-"+newId(), tenantId: s.payables.find((p)=>p.id===id)?.tenantId ?? "",
          dateISO: today(0), type: "CASH_OUT",
          category: "Pelunasan Hutang Supplier",
          description: `Pembayaran AP ${id}`,
          amountRp, refType: "MANUAL", refNo: id,
          createdAtISO: today(0),
        }],
      })),
      addReceivable: (r) => {
        const created: DemoReceivable = { ...r, id: "ar-"+newId(), createdAtISO: today(0), paidRp: 0, status: "OPEN" };
        set((s)=>({ receivables: [...s.receivables, created] }));
        return created;
      },
      receiveReceivable: (id, amountRp) => set((s)=>({
        receivables: s.receivables.map((r)=>{
          if (r.id!==id) return r;
          const paid = r.paidRp + amountRp;
          const status: DemoReceivableStatus = paid>=r.totalRp ? "PAID" : paid>0 ? "PARTIAL" : r.status;
          return { ...r, paidRp: paid, status };
        }),
        ledger: [...s.ledger, {
          id: "le-"+newId(), tenantId: s.receivables.find((r)=>r.id===id)?.tenantId ?? "",
          dateISO: today(0), type: "CASH_IN",
          category: "Penerimaan Piutang",
          description: `Penerimaan AR ${id}`,
          amountRp, refType: "MANUAL", refNo: id,
          createdAtISO: today(0),
        }],
      })),

      // ==================== Multi-outlet ====================
      upsertBranch: (b) => set((s)=>{
        const idx = s.branches.findIndex((x)=>x.id===b.id);
        if (idx===-1) {
          const seeded: DemoBranch = {
            id: b.id, tenantId: b.tenantId, name: b.name ?? "Cabang Baru",
            address: b.address ?? "", phone: b.phone, managerName: b.managerName,
            active: b.active ?? true, isHQ: b.isHQ ?? false,
            createdAtISO: b.createdAtISO ?? today(0),
          };
          return { branches: [...s.branches, seeded] };
        }
        const next=[...s.branches]; next[idx]={...next[idx], ...b}; return { branches: next };
      }),
      removeBranch: (id) => set((s)=>({ branches: s.branches.filter((b)=>b.id!==id) })),
      addTransfer: (t) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().transfers.filter((x)=>x.tenantId===t.tenantId && x.noTransfer.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const created: DemoTransfer = { ...t, id: "trf-"+newId(), createdAtISO: now.toISOString().slice(0,10), noTransfer: `TRF/${yy}/${mm}/${seq}` };
        set((s)=>({ transfers: [...s.transfers, created] }));
        return created;
      },
      updateTransferStatus: (id, status) => set((s)=>({
        transfers: s.transfers.map((t)=>{
          if (t.id!==id) return t;
          const next: DemoTransfer = { ...t, status };
          if (status==="RECEIVED") next.receivedAtISO = new Date().toISOString().slice(0,10);
          return next;
        }),
      })),

      // ==================== Loyalty ====================
      upsertMember: (m) => set((s)=>{
        const idx = s.members.findIndex((x)=>x.id===m.id);
        if (idx===-1) {
          const seq = s.members.length + 1;
          const seeded: DemoMember = {
            id: m.id, tenantId: m.tenantId,
            patientId: m.patientId, cardNo: m.cardNo ?? `M-${new Date().getFullYear()}-${String(seq).padStart(4,"0")}`,
            name: m.name ?? "Member Baru", phone: m.phone ?? "", email: m.email,
            birthDateISO: m.birthDateISO, joinedISO: m.joinedISO ?? today(0),
            tier: m.tier ?? "SILVER",
            pointsBalance: m.pointsBalance ?? 0, totalSpendRp: m.totalSpendRp ?? 0,
            active: m.active ?? true,
          };
          return { members: [...s.members, seeded] };
        }
        const next=[...s.members]; next[idx]={...next[idx], ...m}; return { members: next };
      }),
      addLoyaltyTx: (t) => set((s)=>({
        loyaltyTxs: [...s.loyaltyTxs, { ...t, id: "lt-"+newId(), createdAtISO: new Date().toISOString().slice(0,10) }],
        members: s.members.map((m)=> m.id===t.memberId ? { ...m, pointsBalance: m.pointsBalance + t.points } : m),
      })),

      // ==================== Asuransi ====================
      upsertInsurer: (i) => set((s)=>{
        const idx = s.insurers.findIndex((x)=>x.id===i.id);
        if (idx===-1) {
          const seeded: DemoInsurer = {
            id: i.id, tenantId: i.tenantId, name: i.name ?? "Asuransi Baru",
            type: i.type ?? "PRIVATE", picName: i.picName, phone: i.phone, contractNo: i.contractNo,
            active: i.active ?? true, createdAtISO: i.createdAtISO ?? today(0),
          };
          return { insurers: [...s.insurers, seeded] };
        }
        const next=[...s.insurers]; next[idx]={...next[idx], ...i}; return { insurers: next };
      }),
      addClaim: (c) => {
        const now = new Date(); const yy = now.getFullYear(); const mm = String(now.getMonth()+1).padStart(2,"0");
        const seq = String(get().claims.filter((x)=>x.tenantId===c.tenantId && x.noClaim.includes(`/${yy}/${mm}/`)).length+1).padStart(3,"0");
        const ins = get().insurers.find((i)=>i.id===c.insurerId);
        const created: DemoInsuranceClaim = {
          ...c, id: "clm-"+newId(), createdAtISO: now.toISOString().slice(0,10),
          noClaim: `CLM/${yy}/${mm}/${seq}`,
          insurerName: ins?.name ?? c.insurerId,
          approvedRp: 0,
        };
        set((s)=>({ claims: [...s.claims, created] }));
        return created;
      },
      updateClaimStatus: (id, status, approvedRp, rejectionReason) => set((s)=>({
        claims: s.claims.map((c)=>{
          if (c.id!==id) return c;
          const next: DemoInsuranceClaim = { ...c, status };
          if (typeof approvedRp === "number") next.approvedRp = approvedRp;
          if (rejectionReason) next.rejectionReason = rejectionReason;
          if (status==="SUBMITTED") next.submittedDateISO = today(0);
          return next;
        }),
      })),

      // ==================== Audit + Permission ====================
      addAuditLog: (l) => set((s)=>({
        auditLogs: [{ ...l, id: "log-"+newId(), createdAtISO: new Date().toISOString() }, ...s.auditLogs].slice(0, 1000),
      })),
      setRolePermissions: (role, perms) => set((s)=>({
        rolePermissions: { ...s.rolePermissions, [role]: perms },
      })),

      // ==================== Promo ====================
      upsertPromo: (p) => set((s)=>{
        const idx = s.promos.findIndex((x)=>x.id===p.id);
        if (idx===-1) {
          const seeded: DemoPromo = {
            id: p.id, tenantId: p.tenantId,
            code: p.code ?? "PROMO-"+newId().slice(0,4).toUpperCase(),
            name: p.name ?? "Promo Baru", type: p.type ?? "PERCENT_OFF",
            discountPercent: p.discountPercent, discountAmountRp: p.discountAmountRp,
            buyQty: p.buyQty, getQty: p.getQty,
            applyToProductIds: p.applyToProductIds, applyToCategory: p.applyToCategory,
            minSubtotalRp: p.minSubtotalRp,
            startISO: p.startISO ?? today(0), endISO: p.endISO ?? today(30),
            active: p.active ?? true, edZoneTrigger: p.edZoneTrigger,
            createdAtISO: p.createdAtISO ?? today(0),
          };
          return { promos: [...s.promos, seeded] };
        }
        const next=[...s.promos]; next[idx]={...next[idx], ...p}; return { promos: next };
      }),
      removePromo: (id) => set((s)=>({ promos: s.promos.filter((p)=>p.id!==id) })),

      // ==================== Notifikasi ====================
      enqueueNotification: (n) => {
        const created: DemoNotification = {
          ...n, id: "ntf-"+newId(),
          status: n.status ?? "QUEUED",
          createdAtISO: new Date().toISOString(),
        };
        set((s)=>({ notifications: [created, ...s.notifications].slice(0, 500) }));
        return created;
      },
      markNotificationSent: (id) => set((s)=>({
        notifications: s.notifications.map((n)=> n.id===id ? { ...n, status: "SENT", sentISO: new Date().toISOString() } : n),
      })),

      // ==================== Telemed ====================
      startTelemedSession: (sess) => {
        const created: DemoTelemedSession = { ...sess, id: "tm-"+newId(), startedISO: new Date().toISOString(), status: "ACTIVE" };
        set((s)=>({ telemedSessions: [...s.telemedSessions, created] }));
        return created;
      },
      endTelemedSession: (id) => set((s)=>({
        telemedSessions: s.telemedSessions.map((t)=> t.id===id ? { ...t, status:"ENDED", endedISO: new Date().toISOString() } : t),
      })),
      addChatMessage: (m) => set((s)=>({
        chatMessages: [...s.chatMessages, { ...m, id: "msg-"+newId(), createdAtISO: new Date().toISOString() }],
      })),

      // ==================== Hardware ====================
      upsertHardwareSettings: (h) => set((s)=>{
        const idx = s.hardwareSettings.findIndex((x)=>x.tenantId===h.tenantId);
        if (idx===-1) return { hardwareSettings: [...s.hardwareSettings, h] };
        const next=[...s.hardwareSettings]; next[idx]=h; return { hardwareSettings: next };
      }),

      // ==================== API & Webhook ====================
      upsertWebhook: (w) => set((s)=>{
        const idx = s.webhooks.findIndex((x)=>x.id===w.id);
        if (idx===-1) {
          const seeded: DemoWebhook = {
            id: w.id, tenantId: w.tenantId,
            name: w.name ?? "Webhook Baru", url: w.url ?? "",
            events: w.events ?? [],
            active: w.active ?? true,
            secretMasked: w.secretMasked ?? `whsec_***${newId().slice(0,4)}`,
            createdAtISO: w.createdAtISO ?? today(0),
          };
          return { webhooks: [...s.webhooks, seeded] };
        }
        const next=[...s.webhooks]; next[idx]={...next[idx], ...w}; return { webhooks: next };
      }),
      removeWebhook: (id) => set((s)=>({ webhooks: s.webhooks.filter((w)=>w.id!==id) })),
      upsertApiKey: (k) => set((s)=>{
        const idx = s.apiKeys.findIndex((x)=>x.id===k.id);
        if (idx===-1) {
          const seeded: DemoApiKey = {
            id: k.id, tenantId: k.tenantId,
            name: k.name ?? "API Key Baru",
            keyMasked: k.keyMasked ?? `pk_live_***${newId().slice(0,4)}`,
            scopes: k.scopes ?? ["read"],
            active: k.active ?? true,
            createdAtISO: k.createdAtISO ?? today(0),
          };
          return { apiKeys: [...s.apiKeys, seeded] };
        }
        const next=[...s.apiKeys]; next[idx]={...next[idx], ...k}; return { apiKeys: next };
      }),
      removeApiKey: (id) => set((s)=>({ apiKeys: s.apiKeys.filter((k)=>k.id!==id) })),

    }),
    { name: "batam-farma-production-v1" }
  )
);

export const demoTotalQty = totalQty;
export const newDemoId = newId;
