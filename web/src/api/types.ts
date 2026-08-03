export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "professional";
  professionalId: string | null;
  clinic: { id: string; name: string };
  billing?: ClinicBillingInfo;
};

export type ClinicBillingInfo = {
  billingStatus: "none" | "active" | "past_due" | "cancelled";
  billingBlocked: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  complimentary: boolean;
  hasSubscription: boolean;
};

export type SubscriptionPlan = {
  code: string;
  name: string;
  amountCents: number;
  description: string;
  currency: "BRL";
  interval: "month";
};

export type SoftwareSubscription = {
  id: string;
  email: string;
  planCode: string;
  planName: string;
  amountCents: number;
  status: "pending_payment" | "paid" | "completed" | "cancelled";
  method: string | null;
  provider: OnlineProvider | null;
  externalId: string | null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  paidAt: string | null;
  setupEmailSentAt: string | null;
  completedAt: string | null;
  clinicId: string | null;
  createdAt: string;
  sandbox?: boolean;
  simulateToken?: string | null;
  emailConfigured?: boolean;
  mpPreapprovalId?: string | null;
  billingStatus?: "none" | "active" | "past_due" | "cancelled";
  currentPeriodEnd?: string | null;
  lastPaymentAt?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export type Clinic = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  timezone: string;
};

export type CalendarBlock = {
  id: string;
  start: string;
  end: string;
  reason: string | null;
  professional: { id: string; name: string };
};

export type PaymentMethod = "pix" | "card" | "cash";
export type PaymentKind = "session" | "package";

export type OnlineProvider =
  | "mercado_pago"
  | "stripe"
  | "asaas"
  | "pagarme";

export type Payment = {
  id: string;
  amountCents: number;
  status: "pending" | "paid" | "cancelled";
  kind: PaymentKind;
  method: PaymentMethod | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  packageId: string | null;
  provider: OnlineProvider | null;
  externalId: string | null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  patient: { id: string; phone: string; name: string | null };
  appointment: {
    id: string;
    start: string;
    status?: string;
    patientConfirmedAt?: string | null;
    service: { id: string; name: string };
  } | null;
  package: { id: string; name: string; totalSessions: number } | null;
  sandbox?: boolean;
  simulateToken?: string | null;
};

export type OnlineProviderInfo = {
  id: OnlineProvider;
  label: string;
  configured: boolean;
  supports: ("pix" | "card")[];
};

export type PaymentsResponse = {
  stats: {
    pending: number;
    paid: number;
    pendingCents: number;
    paidCents: number;
    sessionCents: number;
    packageCents: number;
  };
  items: Payment[];
};

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "supplies"
  | "payroll"
  | "marketing"
  | "taxes"
  | "other";

export type Expense = {
  id: string;
  title: string;
  category: ExpenseCategory;
  amountCents: number;
  method: PaymentMethod | null;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
};

export type SessionPackage = {
  id: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  amountCents: number;
  status: "active" | "completed" | "cancelled";
  method: PaymentMethod | null;
  notes: string | null;
  startsAt: string | null;
  endsAt: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: { id: string; phone: string; name: string | null };
};

export type FinanceOverview = {
  period: "month" | "year";
  year: number;
  month: number | null;
  kpis: {
    revenueCents: number;
    expenseCents: number;
    balanceCents: number;
    pendingCents: number;
    sessionCents: number;
    packageCents: number;
  };
  byMethod: { pix: number; card: number; cash: number; other: number };
  byKind: { session: number; package: number };
  cashFlow: {
    key: string;
    label: string;
    revenueCents: number;
    expenseCents: number;
    balanceCents: number;
  }[];
  stats: PaymentsResponse["stats"];
  recentPayments: Payment[];
  recentExpenses: Expense[];
};

export type Reminder = {
  id: string;
  kind: "confirmation" | "day_before" | "payment";
  status: "pending" | "sent" | "failed" | "cancelled";
  message: string;
  scheduledAt: string;
  sentAt: string | null;
  emailSentAt: string | null;
  whatsappSentAt: string | null;
  error: string | null;
  channels: { whatsapp: boolean; email: boolean };
  buttons: { id: string; label: string; url: string }[];
  confirmUrl: string | null;
  rescheduleUrl: string | null;
  whenLabel: string;
  patient: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
  };
  appointment: {
    id: string;
    start: string;
    startLabel: string;
    patientConfirmedAt: string | null;
    professionalName: string;
    serviceName: string;
  };
  clinicName: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
};

export type Professional = {
  id: string;
  name: string;
  specialty: string;
  crp: string | null;
  color?: string;
};

export type Slot = {
  id: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  start: string;
  end: string;
};

export type Appointment = {
  id: string;
  status: string;
  start: string;
  end: string;
  startLabel: string;
  notes: string | null;
  meetLink: string | null;
  recurrenceRule: string | null;
  recurrenceGroupId: string | null;
  professional: { id: string; name: string; color?: string };
  service: { id: string; name: string; durationMinutes: number };
  patient: { id: string; phone: string; name: string | null };
};

export type Patient = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  cpf?: string | null;
  city?: string | null;
  state?: string | null;
  insuranceName?: string | null;
  profession?: string | null;
  hasPhoto?: boolean;
  createdAt: string;
  appointmentsCount: number;
  status: "ativo" | "pausado";
  plan: string;
  therapist: { id: string; name: string; tag: string } | null;
  lastAppointment: {
    start: string;
    startLabel: string;
    service: string;
  } | null;
  nextAppointment: {
    start: string;
    startLabel: string;
    service: string;
  } | null;
};

export type PatientDocument = {
  id: string;
  kind: "document" | "attachment" | "photo";
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type PatientWritePayload = {
  phone: string;
  name?: string | null;
  email?: string | null;
  notes?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  profession?: string | null;
  maritalStatus?: string | null;
  zipCode?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  insuranceName?: string | null;
  insuranceNumber?: string | null;
  insurancePlan?: string | null;
  financialName?: string | null;
  financialCpf?: string | null;
  financialPhone?: string | null;
  financialRelation?: string | null;
};

export type PatientTimelineKind =
  | "first_session"
  | "session"
  | "payment"
  | "report"
  | "document"
  | "registered";

export type PatientTimelineEvent = {
  id: string;
  kind: PatientTimelineKind;
  title: string;
  subtitle: string | null;
  at: string;
  status: string | null;
  href: string | null;
  meta?: { amountCents?: number; fileName?: string };
};

export type PatientDetail = PatientWritePayload & {
  id: string;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  documents: PatientDocument[];
  timeline: PatientTimelineEvent[];
  history: {
    appointments: {
      id: string;
      status: string;
      start: string;
      end: string;
      service: string;
      professional: string;
      notes: string | null;
    }[];
    clinicalRecords: {
      id: string;
      status: string;
      updatedAt: string;
      confirmedAt: string | null;
      professional: string;
    }[];
    payments: {
      id: string;
      status: string;
      amountCents: number;
      createdAt: string;
      paidAt: string | null;
    }[];
  };
};

export type PatientsResponse = {
  stats: {
    total: number;
    active: number;
    activePct: number;
    newThisMonth: number;
    returnRate: number;
  };
  items: Patient[];
};

export type ClinicalFileKind = "pdf" | "exam" | "report" | "image" | "audio";

export type ClinicalRecordFile = {
  id: string;
  kind: ClinicalFileKind;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ClinicalRecord = {
  id: string;
  status: "draft" | "confirmed";
  /** Evolução / resumo — texto livre */
  evolution: string;
  draftContent: string;
  /** Objetivos do tratamento */
  objectives: string;
  /** Hipóteses clínicas */
  hypotheses: string;
  recurringThemes: string;
  nextInterventions: string;
  importantPoints: string;
  audioNotes: string;
  /** Diagnósticos */
  diagnosisCid: string;
  diagnosisDsm: string;
  /** Observações — campo livre */
  observations: string;
  sessionNotes: string | null;
  recordingConsent: boolean;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: ClinicalRecordFile[];
  patient: { id: string; phone: string; name: string | null };
  professional: { id: string; name: string };
  appointment: {
    id: string;
    start: string;
    end: string;
    service: { id: string; name: string };
  } | null;
};

export type ClinicalRecordWrite = {
  evolution?: string;
  draftContent?: string;
  objectives?: string | null;
  hypotheses?: string | null;
  recurringThemes?: string | null;
  nextInterventions?: string | null;
  importantPoints?: string | null;
  audioNotes?: string | null;
  diagnosisCid?: string | null;
  diagnosisDsm?: string | null;
  observations?: string | null;
  sessionNotes?: string | null;
  recordingConsent?: boolean;
  professionalId?: string;
};

export type EvolutionDraftResponse = {
  summary: string;
  hypotheses: string;
  recurringThemes: string;
  nextInterventions: string;
  importantPoints: string;
  provider: "openai" | "local";
  model: string | null;
  sources: {
    previousSession: boolean;
    notes: boolean;
    audio: boolean;
  };
  reviewRequired: true;
  message: string;
  record?: ClinicalRecord;
};

export type SessionPrepContext = {
  patient: { id: string; name: string | null; phone: string };
  appointment: {
    id: string;
    start: string;
    end: string;
    serviceName: string;
    professionalName: string;
    status: string;
  } | null;
  recentSessions: {
    id: string;
    start: string;
    serviceName: string;
    professionalName: string;
    status: string;
    summary: string | null;
    recordId: string | null;
    recordStatus: "draft" | "confirmed" | null;
  }[];
  recurringThemes: string[];
  objectives: string[];
  latestEvents: string[];
  pending: {
    kind: "draft" | "payment" | "intervention" | "confirmation" | "reminder";
    label: string;
    href: string | null;
  }[];
  briefing: string;
  provider: "openai" | "local";
  reviewNote: string;
};

export type ClinicalRecordsResponse = {
  stats: { drafts: number; confirmed: number; patients: number };
  items: ClinicalRecord[];
};

export type DashboardPayment = {
  id: string;
  amountCents: number;
  status: string;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: { id: string; phone: string; name: string | null };
  appointment: {
    id: string;
    start: string;
    service: { id: string; name: string };
  } | null;
};

export type DashboardEvolutionDraft = {
  id: string;
  updatedAt: string;
  patient: { id: string; name: string | null; phone: string };
  professional: { id: string; name: string };
  appointment: {
    id: string;
    start: string;
    serviceName: string;
  } | null;
};

export type DashboardData = {
  clinic: { id: string; name: string };
  professional: { id: string; name: string; specialty: string } | null;
  kpis: {
    activePatients: number;
    todayAppointments: number;
    monthlyRevenueCents: number;
    attendanceRate: number;
    newPatientsThisMonth: number;
    todayReceivedCents: number;
    pendingInvoices: number;
    pendingInvoicesCents: number;
    pendingEvolutions: number;
  };
  evolution: { label: string; count: number }[];
  week: Appointment[];
  upcoming: Appointment[];
  today: Appointment[];
  newPatients: {
    id: string;
    name: string | null;
    phone: string;
    createdAt: string;
  }[];
  todayPayments: DashboardPayment[];
  pendingPayments: DashboardPayment[];
  pendingEvolutions: DashboardEvolutionDraft[];
  recentAttended: Appointment[];
  weekStart: string;
};
