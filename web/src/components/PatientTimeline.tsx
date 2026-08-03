import { Link } from "react-router-dom";
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  Banknote,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { PatientTimelineEvent, PatientTimelineKind } from "../api/types";
import { formatPrice, formatTime, zonedParts } from "../lib/dates";

const MONTHS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const KIND_META: Record<
  PatientTimelineKind,
  { icon: LucideIcon; tone: string }
> = {
  first_session: { icon: Sparkles, tone: "first" },
  session: { icon: CalendarCheck, tone: "session" },
  payment: { icon: Banknote, tone: "payment" },
  report: { icon: ClipboardList, tone: "report" },
  document: { icon: FileText, tone: "document" },
  registered: { icon: UserPlus, tone: "registered" },
};

function dayMonthLabel(iso: string) {
  const p = zonedParts(new Date(iso));
  return {
    day: String(p.day).padStart(2, "0"),
    month: MONTHS_SHORT[p.month - 1],
    year: p.year,
  };
}

function groupByYear(events: PatientTimelineEvent[]) {
  const map = new Map<number, PatientTimelineEvent[]>();
  for (const e of events) {
    const year = zonedParts(new Date(e.at)).year;
    const list = map.get(year) ?? [];
    list.push(e);
    map.set(year, list);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

export function PatientTimeline({ events }: { events: PatientTimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="card pad timeline-empty">
        <p className="muted" style={{ margin: 0 }}>
          Ainda não há eventos na linha do tempo deste paciente.
        </p>
      </div>
    );
  }

  const years = groupByYear(events);

  return (
    <div className="patient-timeline card pad">
      {years.map(([year, items]) => (
        <section key={year} className="timeline-year">
          <h3 className="timeline-year-label">{year}</h3>
          <ol className="timeline-list">
            {items.map((event) => {
              const { day, month } = dayMonthLabel(event.at);
              const meta = KIND_META[event.kind];
              const Icon = meta.icon;
              const body = (
                <>
                  <div className={`timeline-dot tone-${meta.tone}`}>
                    <Icon size={14} strokeWidth={2.25} />
                  </div>
                  <div className="timeline-date">
                    <span className="timeline-day">{day}</span>
                    <span className="timeline-month">{month}</span>
                  </div>
                  <div className="timeline-body">
                    <strong className="timeline-title">{event.title}</strong>
                    {event.subtitle ? (
                      <span className="timeline-sub">{event.subtitle}</span>
                    ) : null}
                    <span className="timeline-meta">
                      {formatTime(event.at)}
                      {event.meta?.amountCents != null
                        ? ` · ${formatPrice(event.meta.amountCents)}`
                        : ""}
                    </span>
                  </div>
                </>
              );

              return (
                <li key={event.id} className={`timeline-item kind-${event.kind}`}>
                  {event.href ? (
                    <Link to={event.href} className="timeline-row">
                      {body}
                    </Link>
                  ) : (
                    <div className="timeline-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
