export type Clinic = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  timezone: string;
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
  professional: { id: string; name: string };
  service: { id: string; name: string; durationMinutes: number };
  patient: { id: string; phone: string; name: string | null };
};

export type Patient = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
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

export type ClinicalRecord = {
  id: string;
  status: "draft" | "confirmed";
  sessionNotes: string | null;
  draftContent: string;
  recordingConsent: boolean;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; phone: string; name: string | null };
  professional: { id: string; name: string };
  appointment: {
    id: string;
    start: string;
    end: string;
    service: { id: string; name: string };
  } | null;
};

export type ClinicalRecordsResponse = {
  stats: { drafts: number; confirmed: number; patients: number };
  items: ClinicalRecord[];
};

export type DashboardData = {
  clinic: { id: string; name: string };
  professional: { id: string; name: string; specialty: string } | null;
  kpis: {
    activePatients: number;
    todayAppointments: number;
    monthlyRevenueCents: number;
    attendanceRate: number;
  };
  evolution: { label: string; count: number }[];
  week: Appointment[];
  upcoming: Appointment[];
  today: Appointment[];
  weekStart: string;
};
