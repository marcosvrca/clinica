/**
 * Seed: clínica com ~1 mês de uso (agenda, prontuários, financeiro, lembretes).
 * Login: ana@bemestar.local / demo1234
 */
import {
  AppointmentStatus,
  ClinicalRecordStatus,
  ExpenseCategory,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ReminderKind,
  ReminderStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnv } from "../src/config/env.js";
import {
  encryptClinical,
  encryptClinicalRequired,
} from "../src/lib/clinical-crypto.js";

loadEnv();

const prisma = new PrismaClient();

const DEFAULT_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

/** Data local (America/Sao_Paulo aproximada via setHours da máquina). */
function atLocal(daysFromToday: number, hour: number, minute = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function enc(text: string | null | undefined) {
  return encryptClinical(text ?? null);
}

function encReq(text: string) {
  return encryptClinicalRequired(text);
}

type PatientSeed = {
  id: string;
  phone: string;
  name: string;
  email: string;
  profession: string;
  maritalStatus: string;
  insuranceName: string;
  themes: string[];
  objectives: string[];
  pro: "ana" | "bruno";
  weekdaySlots: { weekday: number; hour: number }[]; // 0=Sun
};

const PATIENTS: PatientSeed[] = [
  {
    id: "pat_marina",
    phone: "556399990001",
    name: "Marina Oliveira",
    email: "marina@email.com",
    profession: "Analista",
    maritalStatus: "solteiro",
    insuranceName: "Particular",
    themes: ["ansiedade laboral", "sono irregular", "autocrítica"],
    objectives: [
      "Consolidar higiene do sono",
      "Identificar gatilhos no trabalho",
      "Praticar respiração diafragmática 2x/dia",
    ],
    pro: "ana",
    weekdaySlots: [
      { weekday: 1, hour: 10 },
      { weekday: 3, hour: 10 },
    ],
  },
  {
    id: "pat_pedro",
    phone: "556399990002",
    name: "Pedro Santos",
    email: "pedro@email.com",
    profession: "Designer",
    maritalStatus: "casado",
    insuranceName: "Unimed",
    themes: ["ansiedade social", "evitação", "exposição gradual"],
    objectives: [
      "Avançar na hierarquia de exposição",
      "Registrar SUDS semanalmente",
    ],
    pro: "bruno",
    weekdaySlots: [{ weekday: 2, hour: 15 }],
  },
  {
    id: "pat_lucia",
    phone: "556399990003",
    name: "Lúcia Ferreira",
    email: "lucia@email.com",
    profession: "Professora",
    maritalStatus: "divorciado",
    insuranceName: "Particular",
    themes: ["luto", "culpa", "reorganização da rotina"],
    objectives: ["Elaborar perdas recentes", "Retomar rede de apoio"],
    pro: "ana",
    weekdaySlots: [{ weekday: 4, hour: 9 }],
  },
  {
    id: "pat_rafael",
    phone: "556399990004",
    name: "Rafael Costa",
    email: "rafael@email.com",
    profession: "Engenheiro",
    maritalStatus: "casado",
    insuranceName: "Bradesco Saúde",
    themes: ["burnout", "limites", "conflito com gestão"],
    objectives: ["Definir limites no trabalho", "Pausas conscientes"],
    pro: "bruno",
    weekdaySlots: [{ weekday: 1, hour: 16 }],
  },
  {
    id: "pat_camila",
    phone: "556399990005",
    name: "Camila Souza",
    email: "camila@email.com",
    profession: "Estudante",
    maritalStatus: "solteiro",
    insuranceName: "Particular",
    themes: ["procrastinação", "ansiedade de desempenho", "TCC"],
    objectives: ["Planejamento semanal", "Exposição a tarefas evitadas"],
    pro: "ana",
    weekdaySlots: [{ weekday: 5, hour: 11 }],
  },
  {
    id: "pat_diego",
    phone: "556399990006",
    name: "Diego Almeida",
    email: "diego@email.com",
    profession: "Comerciante",
    maritalStatus: "uniao_estavel",
    insuranceName: "Particular",
    themes: ["irritabilidade", "comunicação no casal", "estresse financeiro"],
    objectives: ["Comunicação não violenta", "Rotina de pausas"],
    pro: "bruno",
    weekdaySlots: [{ weekday: 3, hour: 17 }],
  },
  {
    id: "pat_helena",
    phone: "556399990007",
    name: "Helena Ribeiro",
    email: "helena@email.com",
    profession: "Servidora pública",
    maritalStatus: "casado",
    insuranceName: "Geap",
    themes: ["ruminação", "insônia", "preocupação com filhos"],
    objectives: ["Reduzir tempo de ruminação noturna", "Diário de preocupações"],
    pro: "ana",
    weekdaySlots: [{ weekday: 2, hour: 8 }],
  },
  {
    id: "pat_thiago",
    phone: "556399990008",
    name: "Thiago Mendes",
    email: "thiago@email.com",
    profession: "Advogado",
    maritalStatus: "solteiro",
    insuranceName: "Particular",
    themes: ["perfeccionismo", "pressão por resultados"],
    objectives: ["Flexibilizar padrões rígidos", "Autocompaixão"],
    pro: "bruno",
    weekdaySlots: [{ weekday: 4, hour: 14 }],
  },
];

const SESSION_NOTES = [
  "Humor estável; chegou pontual.",
  "Relatou piora pontual na semana; dormiu mal duas noites.",
  "Boa adesão às tarefas de casa.",
  "Trouxe exemplos concretos do trabalho.",
  "Mais introspectivo(a); precisou de mais acolhimento inicial.",
  "Avanço na exposição; ansiedade residual controlável.",
];

async function wipeClinicOps(clinicId: string) {
  await prisma.reminder.deleteMany({ where: { clinicId } });
  await prisma.payment.deleteMany({ where: { clinicId } });
  await prisma.clinicalRecordFile.deleteMany({ where: { clinicId } });
  await prisma.clinicalRecord.deleteMany({ where: { clinicId } });
  await prisma.appointment.deleteMany({ where: { clinicId } });
  await prisma.calendarBlock.deleteMany({ where: { clinicId } });
  await prisma.expense.deleteMany({ where: { clinicId } });
  await prisma.sessionPackage.deleteMany({ where: { clinicId } });
  await prisma.patientDocument.deleteMany({ where: { clinicId } });
  await prisma.patient.deleteMany({ where: { clinicId } });
}

async function main() {
  const clinic = await prisma.clinic.upsert({
    where: { slug: "mente-em-equilibrio" },
    create: {
      name: "Clínica Bem Estar",
      slug: "mente-em-equilibrio",
      phone: "556330000000",
      timezone: "America/Sao_Paulo",
    },
    update: { active: true, name: "Clínica Bem Estar" },
  });

  await wipeClinicOps(clinic.id);

  const session = await prisma.service.upsert({
    where: { id: "svc_sessao_50" },
    create: {
      id: "svc_sessao_50",
      clinicId: clinic.id,
      name: "Sessão individual (50 min)",
      description: "Atendimento psicológico individual",
      durationMinutes: 50,
      priceCents: 18000,
    },
    update: { active: true, durationMinutes: 50, priceCents: 18000 },
  });

  const first = await prisma.service.upsert({
    where: { id: "svc_primeira" },
    create: {
      id: "svc_primeira",
      clinicId: clinic.id,
      name: "Primeira consulta",
      description: "Avaliação inicial",
      durationMinutes: 50,
      priceCents: 20000,
    },
    update: { active: true, priceCents: 20000 },
  });

  const ana = await prisma.professional.upsert({
    where: { id: "pro_ana" },
    create: {
      id: "pro_ana",
      clinicId: clinic.id,
      name: "Dra. Ana Carolina",
      specialty: "Psicologia Clínica",
      crp: "CRP 18/0001",
      color: "#14b8a6",
    },
    update: { active: true, name: "Dra. Ana Carolina", color: "#14b8a6" },
  });

  const bruno = await prisma.professional.upsert({
    where: { id: "pro_bruno" },
    create: {
      id: "pro_bruno",
      clinicId: clinic.id,
      name: "Dr. Bruno Lima",
      specialty: "Terapia Cognitivo-Comportamental",
      crp: "CRP 18/0002",
      color: "#3b82f6",
    },
    update: { active: true, name: "Dr. Bruno Lima", color: "#3b82f6" },
  });

  const pros = { ana, bruno } as const;

  for (const pro of [ana, bruno]) {
    await prisma.weeklyHour.deleteMany({ where: { professionalId: pro.id } });
    await prisma.weeklyHour.createMany({
      data: DEFAULT_HOURS.map((h) => ({ ...h, professionalId: pro.id })),
    });
  }

  await prisma.serviceProfessional.deleteMany({
    where: { serviceId: { in: [session.id, first.id] } },
  });
  await prisma.serviceProfessional.createMany({
    data: [
      { serviceId: session.id, professionalId: ana.id },
      { serviceId: session.id, professionalId: bruno.id },
      { serviceId: first.id, professionalId: ana.id },
      { serviceId: first.id, professionalId: bruno.id },
    ],
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await prisma.staffUser.upsert({
    where: {
      clinicId_email: { clinicId: clinic.id, email: "ana@bemestar.local" },
    },
    create: {
      clinicId: clinic.id,
      professionalId: ana.id,
      email: "ana@bemestar.local",
      name: "Dra. Ana Carolina",
      passwordHash,
      role: "admin",
      passwordSetAt: new Date(),
    },
    update: {
      passwordHash,
      active: true,
      professionalId: ana.id,
      name: "Dra. Ana Carolina",
      role: "admin",
      passwordSetAt: new Date(),
    },
  });
  await prisma.staffUser.upsert({
    where: {
      clinicId_email: { clinicId: clinic.id, email: "bruno@bemestar.local" },
    },
    create: {
      clinicId: clinic.id,
      professionalId: bruno.id,
      email: "bruno@bemestar.local",
      name: "Dr. Bruno Lima",
      passwordHash,
      role: "professional",
      passwordSetAt: new Date(),
    },
    update: {
      passwordHash,
      active: true,
      professionalId: bruno.id,
      name: "Dr. Bruno Lima",
      passwordSetAt: new Date(),
    },
  });

  const patientRows = [];
  for (const p of PATIENTS) {
    const row = await prisma.patient.create({
      data: {
        id: p.id,
        clinicId: clinic.id,
        phone: p.phone,
        name: p.name,
        email: p.email,
        profession: p.profession,
        maritalStatus: p.maritalStatus,
        city: "Palmas",
        state: "TO",
        insuranceName: p.insuranceName,
        notes: `Acompanhamento contínuo — temas: ${p.themes.join(", ")}.`,
        emergencyName: `Contato de ${p.name.split(" ")[0]}`,
        emergencyPhone: p.phone.replace(/1$/, "9"),
        emergencyRelation: "familiar",
        createdAt: atLocal(-32, 9),
      },
    });
    patientRows.push({ seed: p, row });
  }

  let apptCount = 0;
  let recordConfirmed = 0;
  let recordDraft = 0;
  let paymentsPaid = 0;
  let paymentsPending = 0;

  // Janela: D-28 até D+7 (mês de uso + próximos dias)
  for (let dayOffset = -28; dayOffset <= 7; dayOffset++) {
    const day = atLocal(dayOffset, 12);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;

    for (const { seed: p, row } of patientRows) {
      const slot = p.weekdaySlots.find((s) => s.weekday === weekday);
      if (!slot) continue;

      // ~10% falta / cancelamento no passado; futuro quase sempre confirmado/pendente
      let status: AppointmentStatus = AppointmentStatus.confirmed;
      const roll = Math.abs((dayOffset * 17 + p.phone.length) % 10);
      if (dayOffset < 0) {
        if (roll === 0) status = AppointmentStatus.cancelled;
        else if (roll === 1) status = AppointmentStatus.no_show;
      } else if (dayOffset === 0) {
        status = AppointmentStatus.confirmed;
      } else if (roll >= 7) {
        status = AppointmentStatus.pending;
      }

      const startsAt = atLocal(dayOffset, slot.hour);
      const endsAt = addMinutes(startsAt, 50);
      const pro = pros[p.pro];
      const isFirst =
        dayOffset <= -25 &&
        p.weekdaySlots[0]?.weekday === weekday &&
        p.weekdaySlots[0]?.hour === slot.hour;
      const serviceId = isFirst ? first.id : session.id;
      const priceCents = isFirst ? 20000 : 18000;
      const apptId = `appt_${p.id}_${dayOffset}_${slot.hour}`;

      const appt = await prisma.appointment.create({
        data: {
          id: apptId,
          clinicId: clinic.id,
          patientId: row.id,
          professionalId: pro.id,
          serviceId,
          startsAt,
          endsAt,
          status,
          source: "seed",
          notes:
            status === AppointmentStatus.cancelled
              ? "Cancelado com antecedência."
              : status === AppointmentStatus.no_show
                ? "Paciente não compareceu."
                : SESSION_NOTES[Math.abs(dayOffset + slot.hour) % SESSION_NOTES.length],
          patientConfirmedAt:
            status === AppointmentStatus.confirmed && dayOffset <= 1
              ? addMinutes(startsAt, -20 * 60)
              : null,
          cancelledAt:
            status === AppointmentStatus.cancelled
              ? addMinutes(startsAt, -48 * 60)
              : null,
          createdAt: addMinutes(startsAt, -14 * 24 * 60),
        },
      });
      apptCount += 1;

      if (
        status === AppointmentStatus.cancelled ||
        status === AppointmentStatus.no_show
      ) {
        continue;
      }

      // Prontuário só para sessões já ocorridas
      if (dayOffset < 0) {
        const noteIdx = Math.abs(dayOffset) % SESSION_NOTES.length;
        const summary = `Sessão com ${p.name.split(" ")[0]}: trabalhou ${p.themes[0]}. ${SESSION_NOTES[noteIdx]} Combinamos continuidade nos objetivos terapêuticos.`;
        const isDraft = dayOffset >= -3 && roll >= 6;
        await prisma.clinicalRecord.create({
          data: {
            id: `rec_${apptId}`,
            clinicId: clinic.id,
            patientId: row.id,
            professionalId: pro.id,
            appointmentId: appt.id,
            status: isDraft
              ? ClinicalRecordStatus.draft
              : ClinicalRecordStatus.confirmed,
            sessionNotes: enc(SESSION_NOTES[noteIdx]),
            draftContent: encReq(summary),
            objectives: enc(p.objectives.map((o) => `• ${o}`).join("\n")),
            hypotheses: enc(
              `Hipótese em acompanhamento relacionada a ${p.themes.join(", ")}.`,
            ),
            recurringThemes: enc(p.themes.map((t) => `• ${t}`).join("\n")),
            nextInterventions: enc(
              [
                "• Revisar tarefas da semana anterior",
                `• Aprofundar o tema “${p.themes[0]}”`,
                "• Checar adesão e ajustes no plano",
              ].join("\n"),
            ),
            importantPoints: enc(
              [
                `• ${SESSION_NOTES[noteIdx]}`,
                `• Tema central: ${p.themes[0]}`,
              ].join("\n"),
            ),
            diagnosisCid: enc(p.pro === "ana" ? "F41.1" : "F40.1"),
            diagnosisDsm: enc(
              p.pro === "ana"
                ? "Transtorno de Ansiedade Generalizada"
                : "Fobia Social (Ansiedade Social)",
            ),
            recordingConsent: roll % 2 === 0,
            confirmedAt: isDraft
              ? null
              : addMinutes(endsAt, 90),
            createdAt: endsAt,
            updatedAt: addMinutes(endsAt, isDraft ? 30 : 90),
          },
        });
        if (isDraft) recordDraft += 1;
        else recordConfirmed += 1;
      }

      // Pagamentos: passado pago (maioria); alguns pendentes; futuro pendente
      const payPending =
        status === AppointmentStatus.pending ||
        (dayOffset >= -2 && roll >= 8) ||
        dayOffset > 0;
      const methodPool: PaymentMethod[] = [
        PaymentMethod.pix,
        PaymentMethod.card,
        PaymentMethod.cash,
      ];
      const method = methodPool[Math.abs(dayOffset + slot.hour) % 3];
      await prisma.payment.create({
        data: {
          id: `pay_${apptId}`,
          clinicId: clinic.id,
          patientId: row.id,
          appointmentId: appt.id,
          kind: PaymentKind.session,
          amountCents: priceCents,
          status: payPending ? PaymentStatus.pending : PaymentStatus.paid,
          method: payPending ? null : method,
          paidAt: payPending ? null : addMinutes(endsAt, 5),
          createdAt: startsAt,
        },
      });
      if (payPending) paymentsPending += 1;
      else paymentsPaid += 1;

      // Lembretes: alguns enviados no passado; pendentes próximos
      if (dayOffset >= -1 && dayOffset <= 2) {
        await prisma.reminder.create({
          data: {
            clinicId: clinic.id,
            patientId: row.id,
            appointmentId: appt.id,
            kind: ReminderKind.confirmation,
            status:
              dayOffset < 0 ? ReminderStatus.sent : ReminderStatus.pending,
            scheduledAt: addMinutes(startsAt, -24 * 60),
            sentAt: dayOffset < 0 ? addMinutes(startsAt, -23 * 60) : null,
            message: `Olá ${p.name.split(" ")[0]}, sua sessão será amanhã. Confirme ou remarque.`,
          },
        });
      }
    }
  }

  // Pacote ativo Marina
  const marinaPkg = await prisma.sessionPackage.create({
    data: {
      id: "pkg_marina_4",
      clinicId: clinic.id,
      patientId: "pat_marina",
      name: "Pacote 4 sessões",
      totalSessions: 4,
      usedSessions: 2,
      amountCents: 64000,
      status: "active",
      method: PaymentMethod.card,
      paidAt: atLocal(-26, 11),
      startsAt: atLocal(-26, 10),
    },
  });
  await prisma.payment.create({
    data: {
      id: "pay_marina_package",
      clinicId: clinic.id,
      patientId: "pat_marina",
      packageId: marinaPkg.id,
      kind: PaymentKind.package,
      amountCents: 64000,
      status: PaymentStatus.paid,
      method: PaymentMethod.card,
      paidAt: atLocal(-26, 11),
      notes: "Pacote: Pacote 4 sessões",
    },
  });
  paymentsPaid += 1;

  // Despesas do mês
  const expenses: {
    id: string;
    title: string;
    category: ExpenseCategory;
    amountCents: number;
    method: PaymentMethod;
    day: number;
  }[] = [
    {
      id: "exp_rent",
      title: "Aluguel da sala",
      category: ExpenseCategory.rent,
      amountCents: 250000,
      method: PaymentMethod.pix,
      day: -25,
    },
    {
      id: "exp_energy",
      title: "Energia elétrica",
      category: ExpenseCategory.utilities,
      amountCents: 42000,
      method: PaymentMethod.pix,
      day: -18,
    },
    {
      id: "exp_supplies",
      title: "Material de escritório",
      category: ExpenseCategory.supplies,
      amountCents: 18900,
      method: PaymentMethod.cash,
      day: -12,
    },
    {
      id: "exp_ads",
      title: "Anúncios Instagram",
      category: ExpenseCategory.marketing,
      amountCents: 35000,
      method: PaymentMethod.card,
      day: -8,
    },
    {
      id: "exp_soft",
      title: "Assinatura software clínico",
      category: ExpenseCategory.other,
      amountCents: 9700,
      method: PaymentMethod.card,
      day: -3,
    },
  ];
  for (const e of expenses) {
    await prisma.expense.create({
      data: {
        id: e.id,
        clinicId: clinic.id,
        title: e.title,
        category: e.category,
        amountCents: e.amountCents,
        method: e.method,
        occurredAt: atLocal(e.day, 10),
      },
    });
  }

  // Bloqueios
  await prisma.calendarBlock.createMany({
    data: [
      {
        id: "block_ana_supervisao",
        clinicId: clinic.id,
        professionalId: ana.id,
        startsAt: atLocal(2, 10),
        endsAt: atLocal(2, 12),
        reason: "Supervisão clínica",
      },
      {
        id: "block_bruno_curso",
        clinicId: clinic.id,
        professionalId: bruno.id,
        startsAt: atLocal(-10, 14),
        endsAt: atLocal(-10, 18),
        reason: "Curso de atualização",
      },
      {
        id: "block_ana_folga",
        clinicId: clinic.id,
        professionalId: ana.id,
        startsAt: atLocal(-5, 8),
        endsAt: atLocal(-5, 12),
        reason: "Folga administrativa",
      },
    ],
  });

  console.log(
    [
      "Seed mês de uso OK",
      `clinic=${clinic.slug}`,
      `patients=${patientRows.length}`,
      `appointments=${apptCount}`,
      `records confirmed=${recordConfirmed} draft=${recordDraft}`,
      `payments paid=${paymentsPaid} pending=${paymentsPending}`,
      `expenses=${expenses.length}`,
      "login=ana@bemestar.local / demo1234",
    ].join(" | "),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
