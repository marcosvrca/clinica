import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Mon-Fri 08:00-12:00 and 14:00-18:00 */
const DEFAULT_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
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
    update: { active: true, durationMinutes: 50 },
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
    update: { active: true },
  });

  const ana = await prisma.professional.upsert({
    where: { id: "pro_ana" },
    create: {
      id: "pro_ana",
      clinicId: clinic.id,
      name: "Dra. Ana Carolina",
      specialty: "Psicologia Clínica",
      crp: "CRP 18/0001",
    },
    update: { active: true, name: "Dra. Ana Carolina" },
  });

  const bruno = await prisma.professional.upsert({
    where: { id: "pro_bruno" },
    create: {
      id: "pro_bruno",
      clinicId: clinic.id,
      name: "Dr. Bruno Lima",
      specialty: "Terapia Cognitivo-Comportamental",
      crp: "CRP 18/0002",
    },
    update: { active: true, name: "Dr. Bruno Lima" },
  });

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

  const marina = await prisma.patient.upsert({
    where: {
      clinicId_phone: { clinicId: clinic.id, phone: "556399990001" },
    },
    create: {
      clinicId: clinic.id,
      phone: "556399990001",
      name: "Marina Oliveira",
      email: "marina@email.com",
    },
    update: { name: "Marina Oliveira", email: "marina@email.com" },
  });

  const pedro = await prisma.patient.upsert({
    where: {
      clinicId_phone: { clinicId: clinic.id, phone: "556399990002" },
    },
    create: {
      clinicId: clinic.id,
      phone: "556399990002",
      name: "Pedro Santos",
      email: "pedro@email.com",
    },
    update: { name: "Pedro Santos", email: "pedro@email.com" },
  });

  const pastMarinaStart = daysAgo(7, 10);
  const pastMarinaEnd = new Date(pastMarinaStart.getTime() + 50 * 60_000);
  const pastPedroStart = daysAgo(3, 15);
  const pastPedroEnd = new Date(pastPedroStart.getTime() + 50 * 60_000);

  const apptMarina = await prisma.appointment.upsert({
    where: { id: "appt_marina_past" },
    create: {
      id: "appt_marina_past",
      clinicId: clinic.id,
      patientId: marina.id,
      professionalId: ana.id,
      serviceId: session.id,
      startsAt: pastMarinaStart,
      endsAt: pastMarinaEnd,
      status: "confirmed",
      source: "seed",
      notes: "Paciente chegou pontual; humor mais estável.",
    },
    update: {
      startsAt: pastMarinaStart,
      endsAt: pastMarinaEnd,
      status: "confirmed",
      notes: "Paciente chegou pontual; humor mais estável.",
    },
  });

  const apptPedro = await prisma.appointment.upsert({
    where: { id: "appt_pedro_past" },
    create: {
      id: "appt_pedro_past",
      clinicId: clinic.id,
      patientId: pedro.id,
      professionalId: bruno.id,
      serviceId: session.id,
      startsAt: pastPedroStart,
      endsAt: pastPedroEnd,
      status: "confirmed",
      source: "seed",
      notes: "Trabalhou exposição gradual; ansiedade residual.",
    },
    update: {
      startsAt: pastPedroStart,
      endsAt: pastPedroEnd,
      status: "confirmed",
      notes: "Trabalhou exposição gradual; ansiedade residual.",
    },
  });

  await prisma.clinicalRecord.upsert({
    where: { appointmentId: apptMarina.id },
    create: {
      id: "rec_marina_confirmed",
      clinicId: clinic.id,
      patientId: marina.id,
      professionalId: ana.id,
      appointmentId: apptMarina.id,
      status: "confirmed",
      sessionNotes: "Paciente chegou pontual; humor mais estável.",
      draftContent:
        "Sessão focada em regulação emocional. Relatou melhora no sono e maior clareza nas demandas do trabalho. Combinamos exercícios de respiração e registro de gatilhos até a próxima sessão.",
      recordingConsent: false,
      confirmedAt: new Date(pastMarinaEnd.getTime() + 2 * 60_000),
    },
    update: {
      status: "confirmed",
      draftContent:
        "Sessão focada em regulação emocional. Relatou melhora no sono e maior clareza nas demandas do trabalho. Combinamos exercícios de respiração e registro de gatilhos até a próxima sessão.",
      sessionNotes: "Paciente chegou pontual; humor mais estável.",
      confirmedAt: new Date(pastMarinaEnd.getTime() + 2 * 60_000),
    },
  });

  await prisma.clinicalRecord.upsert({
    where: { appointmentId: apptPedro.id },
    create: {
      id: "rec_pedro_draft",
      clinicId: clinic.id,
      patientId: pedro.id,
      professionalId: bruno.id,
      appointmentId: apptPedro.id,
      status: "draft",
      sessionNotes: "Trabalhou exposição gradual; ansiedade residual.",
      draftContent:
        "Rascunho: avançou na hierarquia de exposição. Ainda evita situações sociais com desconhecidos. Revisar plano e ajustar tarefas de casa.",
      recordingConsent: true,
    },
    update: {
      status: "draft",
      draftContent:
        "Rascunho: avançou na hierarquia de exposição. Ainda evita situações sociais com desconhecidos. Revisar plano e ajustar tarefas de casa.",
      sessionNotes: "Trabalhou exposição gradual; ansiedade residual.",
      recordingConsent: true,
      confirmedAt: null,
    },
  });

  console.log(
    `Seed OK: clinic=${clinic.slug}, services=2, professionals=2, patients=2, clinicalRecords=2`,
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
