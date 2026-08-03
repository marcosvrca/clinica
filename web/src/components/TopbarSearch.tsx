import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "../api/client";
import type { Patient } from "../api/types";
import { avatarColor, initials } from "../lib/ui";

type Props = {
  placeholder?: string;
};

function matches(patient: Patient, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return false;
  const name = (patient.name ?? "").toLowerCase();
  const phone = patient.phone.replace(/\D/g, "");
  const digits = needle.replace(/\D/g, "");
  return (
    name.includes(needle) ||
    patient.phone.includes(needle) ||
    (digits.length >= 3 && phone.includes(digits)) ||
    (patient.email ?? "").toLowerCase().includes(needle)
  );
}

export function TopbarSearch({ placeholder = "Buscar pacientes…" }: Props) {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef<HTMLLabelElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function ensureLoaded() {
    if (loaded) return;
    try {
      const res = await api.patients();
      setPatients(res.items);
    } catch {
      setPatients([]);
    } finally {
      setLoaded(true);
    }
  }

  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    return patients.filter((p) => matches(p, q)).slice(0, 8);
  }, [patients, q]);

  function goPatient(id: string) {
    setOpen(false);
    setQ("");
    navigate(`/pacientes/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) {
        goPatient(results[active].id);
        return;
      }
      if (q.trim().length >= 2) {
        setOpen(false);
        navigate(`/pacientes?q=${encodeURIComponent(q.trim())}`);
        setQ("");
      }
    }
  }

  return (
    <label className="search topbar-search" ref={rootRef}>
      <Search size={16} strokeWidth={1.75} />
      <input
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          void ensureLoaded();
        }}
        onKeyDown={onKeyDown}
      />
      {open && q.trim().length >= 2 ? (
        <div className="search-dropdown" id={listId} role="listbox">
          {results.length === 0 ? (
            <p className="search-empty muted">
              {loaded ? "Nenhum paciente encontrado" : "Buscando…"}
            </p>
          ) : (
            results.map((p, i) => {
              const name = p.name ?? p.phone;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "search-option on" : "search-option"}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goPatient(p.id)}
                >
                  <span
                    className="avatar sm"
                    style={{ background: avatarColor(name) }}
                  >
                    {initials(p.name, p.phone)}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <span className="muted">{p.phone}</span>
                  </span>
                </button>
              );
            })
          )}
          <button
            type="button"
            className="search-footer"
            onClick={() => {
              setOpen(false);
              navigate(`/pacientes?q=${encodeURIComponent(q.trim())}`);
              setQ("");
            }}
          >
            Ver em Pacientes
          </button>
        </div>
      ) : null}
    </label>
  );
}
