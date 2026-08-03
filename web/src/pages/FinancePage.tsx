import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Package,
  Plus,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";
import type {
  Expense,
  ExpenseCategory,
  FinanceOverview,
  OnlineProvider,
  OnlineProviderInfo,
  Patient,
  Payment,
  PaymentMethod,
  SessionPackage,
} from "../api/types";
import { formatPrice, formatShortDay, formatTime, localDateTimeToIso, toDateInputValue } from "../lib/dates";

type Tab = "fluxo" | "receitas" | "despesas" | "pacotes";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  card: "Cartão",
  cash: "Dinheiro",
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: "Aluguel",
  utilities: "Utilidades",
  supplies: "Insumos",
  payroll: "Pessoal",
  marketing: "Marketing",
  taxes: "Impostos",
  other: "Outros",
};

function reaisToCents(value: string) {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function MethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return <span className="pill pending">—</span>;
  return <span className={`pill method-${method}`}>{METHOD_LABEL[method]}</span>;
}

function CashFlowBars({
  items,
}: {
  items: FinanceOverview["cashFlow"];
}) {
  const max = Math.max(
    1,
    ...items.map((i) => Math.max(i.revenueCents, i.expenseCents)),
  );
  return (
    <div className="cashflow-bars">
      {items.map((b) => (
        <div key={b.key} className="cashflow-col" title={b.key}>
          <div className="cashflow-stack">
            <div
              className="bar revenue"
              style={{ height: `${(b.revenueCents / max) * 100}%` }}
            />
            <div
              className="bar expense"
              style={{ height: `${(b.expenseCents / max) * 100}%` }}
            />
          </div>
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function FinancePage() {
  const now = new Date();
  const todayKey = toDateInputValue(now);
  const [tab, setTab] = useState<Tab>("fluxo");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)));

  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("pix");
  const [onlineProvider, setOnlineProvider] =
    useState<OnlineProvider>("mercado_pago");
  const [providers, setProviders] = useState<OnlineProviderInfo[]>([]);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>("other");
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>("pix");
  const [expenseDate, setExpenseDate] = useState(toDateInputValue(now));

  const [showPackageForm, setShowPackageForm] = useState(false);
  const [pkgPatientId, setPkgPatientId] = useState("");
  const [pkgName, setPkgName] = useState("Pacote 4 sessões");
  const [pkgSessions, setPkgSessions] = useState("4");
  const [pkgAmount, setPkgAmount] = useState("");
  const [pkgMethod, setPkgMethod] = useState<PaymentMethod>("pix");

  const [showRevenueForm, setShowRevenueForm] = useState(false);
  const [revPatientId, setRevPatientId] = useState("");
  const [revAmount, setRevAmount] = useState("");
  const [revMethod, setRevMethod] = useState<PaymentMethod>("pix");
  const [revKind, setRevKind] = useState<"session" | "package">("session");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ov, pay, exp, pkgs, pats, prov] = await Promise.all([
        api.financeOverview({ period, year, month }),
        api.payments(),
        api.expenses(),
        api.packages(),
        api.patients(),
        api.paymentProviders(),
      ]);
      setOverview(ov);
      setPayments(pay.items);
      setExpenses(exp.items);
      setPackages(pkgs.items);
      setPatients(pats.items);
      setProviders(prov.items);
      setOnlineProvider(prov.defaultProvider);
      setPkgPatientId((c) => c || pats.items[0]?.id || "");
      setRevPatientId((c) => c || pats.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar financeiro");
    }
  }, [period, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => payments.filter((p) => p.status === "pending"),
    [payments],
  );

  async function markPaid(payment: Payment) {
    setBusyId(payment.id);
    setError(null);
    try {
      await api.markPaymentPaid(payment.id, { method: payMethod });
      setOk(
        `Pago (${METHOD_LABEL[payMethod]}). Sessão confirmada automaticamente.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao marcar pagamento");
    } finally {
      setBusyId(null);
    }
  }

  async function openOnlineCheckout(payment: Payment) {
    setBusyId(`online-${payment.id}`);
    setError(null);
    setCheckoutUrl(null);
    try {
      const created = await api.createPaymentCheckout(payment.id, {
        provider: onlineProvider,
        method: payMethod === "cash" ? "pix" : payMethod === "card" ? "card" : "pix",
      });
      setOk(
        created.sandbox
          ? "Checkout sandbox gerado. Ao pagar, a sessão é confirmada."
          : `Checkout ${onlineProvider} gerado.`,
      );
      if (created.checkoutUrl) {
        setCheckoutUrl(created.checkoutUrl);
        window.open(created.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no checkout online");
    } finally {
      setBusyId(null);
    }
  }

  async function createExpense() {
    const cents = reaisToCents(expenseAmount);
    if (!expenseTitle.trim() || cents == null) {
      setError("Informe título e valor da despesa");
      return;
    }
    setBusyId("expense");
    try {
      await api.createExpense({
        title: expenseTitle,
        amountCents: cents,
        category: expenseCategory,
        method: expenseMethod,
        occurredAt: localDateTimeToIso(expenseDate, "12:00"),
      });
      setShowExpenseForm(false);
      setExpenseTitle("");
      setExpenseAmount("");
      setOk("Despesa lançada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao lançar despesa");
    } finally {
      setBusyId(null);
    }
  }

  async function createPkg() {
    const cents = reaisToCents(pkgAmount);
    const sessions = Number(pkgSessions);
    if (!pkgPatientId || !pkgName.trim() || cents == null || sessions < 1) {
      setError("Preencha paciente, nome, sessões e valor do pacote");
      return;
    }
    setBusyId("package");
    try {
      await api.createPackage({
        patientId: pkgPatientId,
        name: pkgName,
        totalSessions: sessions,
        amountCents: cents,
        method: pkgMethod,
        markPaid: true,
      });
      setShowPackageForm(false);
      setPkgAmount("");
      setOk("Pacote criado e receita registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pacote");
    } finally {
      setBusyId(null);
    }
  }

  async function createRevenue() {
    const cents = reaisToCents(revAmount);
    if (!revPatientId || cents == null) {
      setError("Informe paciente e valor");
      return;
    }
    setBusyId("revenue");
    try {
      await api.createPayment({
        patientId: revPatientId,
        amountCents: cents,
        kind: revKind,
        method: revMethod,
        status: "paid",
      });
      setShowRevenueForm(false);
      setRevAmount("");
      setOk("Receita lançada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao lançar receita");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !overview) return <p className="banner err">{error}</p>;
  if (!overview) return <p className="muted">Carregando financeiro…</p>;

  const k = overview.kpis;

  return (
    <div className="finance-page">
      <div className="page-actions">
        <Link to="/agenda" className="btn ghost">
          Ver agenda
        </Link>
        <div className="period-switch">
          <button
            type="button"
            className={period === "month" ? "on" : ""}
            onClick={() => setPeriod("month")}
          >
            Mensal
          </button>
          <button
            type="button"
            className={period === "year" ? "on" : ""}
            onClick={() => setPeriod("year")}
          >
            Anual
          </button>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Ano"
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {period === "month" ? (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Mês"
          >
            {[
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
            ].map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? <p className="banner err">{error}</p> : null}
      {ok ? <p className="banner ok">{ok}</p> : null}

      <section className="kpi-grid patients-kpi">
        <article className="stat-card">
          <div className="stat-icon green">
            <ArrowUpRight size={18} />
          </div>
          <div>
            <span>Receitas</span>
            <strong>{formatPrice(k.revenueCents)}</strong>
            <em>
              {formatPrice(k.sessionCents)} avulsas · {formatPrice(k.packageCents)}{" "}
              pacotes
            </em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon warn">
            <ArrowDownRight size={18} />
          </div>
          <div>
            <span>Despesas</span>
            <strong>{formatPrice(k.expenseCents)}</strong>
            <em>no período</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon teal">
            <Wallet size={18} />
          </div>
          <div>
            <span>Fluxo de caixa</span>
            <strong>{formatPrice(k.balanceCents)}</strong>
            <em>receitas − despesas</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon lilac">!</div>
          <div>
            <span>Pendente</span>
            <strong>{formatPrice(k.pendingCents)}</strong>
            <em>a receber</em>
          </div>
        </article>
      </section>

      <div className="view-switch" style={{ margin: "0.85rem 0" }}>
        {(
          [
            ["fluxo", "Fluxo de caixa"],
            ["receitas", "Receitas"],
            ["despesas", "Despesas"],
            ["pacotes", "Pacotes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "fluxo" ? (
        <div className="finance-grid">
          <article className="card pad">
            <h2 className="card-title">
              Fluxo {period === "month" ? "mensal" : "anual"}
            </h2>
            <CashFlowBars items={overview.cashFlow} />
            <div className="cashflow-legend">
              <span>
                <i className="dot rev" /> Receitas
              </span>
              <span>
                <i className="dot exp" /> Despesas
              </span>
            </div>
          </article>
          <article className="card pad">
            <h2 className="card-title">Meios de pagamento</h2>
            <ul className="catalog-list">
              <li>
                <strong>PIX</strong>
                <span>{formatPrice(overview.byMethod.pix)}</span>
              </li>
              <li>
                <strong>Cartão</strong>
                <span>{formatPrice(overview.byMethod.card)}</span>
              </li>
              <li>
                <strong>Dinheiro</strong>
                <span>{formatPrice(overview.byMethod.cash)}</span>
              </li>
            </ul>
            <h3 className="card-title sm" style={{ marginTop: "1rem" }}>
              Origem
            </h3>
            <ul className="catalog-list">
              <li>
                <strong>Sessões avulsas</strong>
                <span>{formatPrice(overview.byKind.session)}</span>
              </li>
              <li>
                <strong>Pacotes</strong>
                <span>{formatPrice(overview.byKind.package)}</span>
              </li>
            </ul>
          </article>
        </div>
      ) : null}

      {tab === "receitas" ? (
        <div>
          <div className="page-actions" style={{ marginBottom: "0.75rem" }}>
            <label className="field-inline">
              Método
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              >
                <option value="pix">PIX</option>
                <option value="card">Cartão</option>
                <option value="cash">Dinheiro</option>
              </select>
            </label>
            <label className="field-inline">
              Provedor online
              <select
                value={onlineProvider}
                onChange={(e) =>
                  setOnlineProvider(e.target.value as OnlineProvider)
                }
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.configured ? "" : " (sandbox)"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn teal"
              onClick={() => setShowRevenueForm((v) => !v)}
            >
              <Plus size={15} /> Lançar receita
            </button>
          </div>

          {checkoutUrl ? (
            <p className="banner ok">
              Link de pagamento:{" "}
              <a href={checkoutUrl} target="_blank" rel="noreferrer">
                abrir checkout
              </a>
            </p>
          ) : null}

          {showRevenueForm ? (
            <div className="card pad" style={{ marginBottom: "0.85rem" }}>
              <h3 className="card-title sm">Nova receita</h3>
              <div className="form-grid two">
                <label>
                  Paciente
                  <select
                    value={revPatientId}
                    onChange={(e) => setRevPatientId(e.target.value)}
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.phone}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select
                    value={revKind}
                    onChange={(e) =>
                      setRevKind(e.target.value as "session" | "package")
                    }
                  >
                    <option value="session">Sessão avulsa</option>
                    <option value="package">Pacote</option>
                  </select>
                </label>
                <label>
                  Valor (R$)
                  <input
                    value={revAmount}
                    onChange={(e) => setRevAmount(e.target.value)}
                    placeholder="180,00"
                  />
                </label>
                <label>
                  Método
                  <select
                    value={revMethod}
                    onChange={(e) =>
                      setRevMethod(e.target.value as PaymentMethod)
                    }
                  >
                    <option value="pix">PIX</option>
                    <option value="card">Cartão</option>
                    <option value="cash">Dinheiro</option>
                  </select>
                </label>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowRevenueForm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn teal"
                  disabled={busyId === "revenue"}
                  onClick={() => void createRevenue()}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <div className="card pad" style={{ marginBottom: "0.85rem" }}>
              <h2 className="card-title">A receber</h2>
              <ul className="catalog-list">
                {pending.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.patient.name ?? p.patient.phone}</strong>
                      <span className="muted">
                        {" "}
                        ·{" "}
                        {p.kind === "package"
                          ? p.package?.name ?? "Pacote"
                          : p.appointment?.service.name ?? "Sessão avulsa"}
                        {p.appointment
                          ? ` · ${formatShortDay(p.appointment.start)} ${formatTime(p.appointment.start)}`
                          : ""}
                      </span>
                    </div>
                    <div className="finance-row-actions">
                      <strong>{formatPrice(p.amountCents)}</strong>
                      <span className="pill pending">pendente</span>
                      <button
                        type="button"
                        className="btn teal sm"
                        disabled={busyId === `online-${p.id}`}
                        onClick={() => void openOnlineCheckout(p)}
                      >
                        Pagar online
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busyId === p.id}
                        onClick={() => void markPaid(p)}
                      >
                        Marcar pago
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="card pad">
            <h2 className="card-title">Todas as receitas</h2>
            <ul className="catalog-list">
              {payments.length === 0 ? (
                <li>
                  <span className="muted">Nenhuma receita ainda</span>
                </li>
              ) : (
                payments.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.patient.name ?? p.patient.phone}</strong>
                      <span className="muted">
                        {" "}
                        · {p.kind === "package" ? "Pacote" : "Sessão avulsa"}
                        {p.appointment
                          ? ` · ${formatShortDay(p.appointment.start)}`
                          : p.paidAt
                            ? ` · ${formatShortDay(p.paidAt)}`
                            : ""}
                      </span>
                    </div>
                    <div className="finance-row-actions">
                      <strong>{formatPrice(p.amountCents)}</strong>
                      <MethodBadge method={p.method} />
                      <span className={`pill ${p.status}`}>{p.status}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "despesas" ? (
        <div>
          <div className="page-actions" style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className="btn teal"
              onClick={() => setShowExpenseForm((v) => !v)}
            >
              <Plus size={15} /> Nova despesa
            </button>
          </div>
          {showExpenseForm ? (
            <div className="card pad" style={{ marginBottom: "0.85rem" }}>
              <h3 className="card-title sm">Lançar despesa</h3>
              <div className="form-grid two">
                <label>
                  Título
                  <input
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    placeholder="Aluguel da sala"
                  />
                </label>
                <label>
                  Valor (R$)
                  <input
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="2500,00"
                  />
                </label>
                <label>
                  Categoria
                  <select
                    value={expenseCategory}
                    onChange={(e) =>
                      setExpenseCategory(e.target.value as ExpenseCategory)
                    }
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Método
                  <select
                    value={expenseMethod}
                    onChange={(e) =>
                      setExpenseMethod(e.target.value as PaymentMethod)
                    }
                  >
                    <option value="pix">PIX</option>
                    <option value="card">Cartão</option>
                    <option value="cash">Dinheiro</option>
                  </select>
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowExpenseForm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn teal"
                  disabled={busyId === "expense"}
                  onClick={() => void createExpense()}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : null}
          <div className="card pad">
            <h2 className="card-title">Despesas</h2>
            <ul className="catalog-list">
              {expenses.length === 0 ? (
                <li>
                  <span className="muted">Nenhuma despesa lançada</span>
                </li>
              ) : (
                expenses.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.title}</strong>
                      <span className="muted">
                        {" "}
                        · {CATEGORY_LABEL[e.category]} ·{" "}
                        {formatShortDay(e.occurredAt)}
                      </span>
                    </div>
                    <div className="finance-row-actions">
                      <strong>{formatPrice(e.amountCents)}</strong>
                      <MethodBadge method={e.method} />
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() =>
                          void api.deleteExpense(e.id).then(() => load())
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "pacotes" ? (
        <div>
          <div className="page-actions" style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className="btn teal"
              onClick={() => setShowPackageForm((v) => !v)}
            >
              <Package size={15} /> Novo pacote
            </button>
          </div>
          {showPackageForm ? (
            <div className="card pad" style={{ marginBottom: "0.85rem" }}>
              <h3 className="card-title sm">Criar pacote</h3>
              <div className="form-grid two">
                <label>
                  Paciente
                  <select
                    value={pkgPatientId}
                    onChange={(e) => setPkgPatientId(e.target.value)}
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.phone}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome
                  <input
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                  />
                </label>
                <label>
                  Sessões
                  <input
                    value={pkgSessions}
                    onChange={(e) => setPkgSessions(e.target.value)}
                  />
                </label>
                <label>
                  Valor total (R$)
                  <input
                    value={pkgAmount}
                    onChange={(e) => setPkgAmount(e.target.value)}
                    placeholder="640,00"
                  />
                </label>
                <label>
                  Método
                  <select
                    value={pkgMethod}
                    onChange={(e) =>
                      setPkgMethod(e.target.value as PaymentMethod)
                    }
                  >
                    <option value="pix">PIX</option>
                    <option value="card">Cartão</option>
                    <option value="cash">Dinheiro</option>
                  </select>
                </label>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowPackageForm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn teal"
                  disabled={busyId === "package"}
                  onClick={() => void createPkg()}
                >
                  Criar e marcar pago
                </button>
              </div>
            </div>
          ) : null}
          <div className="card pad">
            <h2 className="card-title">Pacotes</h2>
            <ul className="catalog-list">
              {packages.length === 0 ? (
                <li>
                  <span className="muted">Nenhum pacote cadastrado</span>
                </li>
              ) : (
                packages.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <span className="muted">
                        {" "}
                        · {p.patient.name ?? p.patient.phone} ·{" "}
                        {p.usedSessions}/{p.totalSessions} sessões ·{" "}
                        {p.status}
                      </span>
                    </div>
                    <div className="finance-row-actions">
                      <strong>{formatPrice(p.amountCents)}</strong>
                      <MethodBadge method={p.method} />
                      {p.status === "active" ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            void api.usePackageSession(p.id).then(() => load())
                          }
                        >
                          Usar sessão
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
