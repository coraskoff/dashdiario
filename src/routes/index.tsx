import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, ListTodo, Wallet } from "lucide-react";
import { fetchTasks } from "@/modules/tasks/api";
import { fetchTransactions } from "@/modules/finance/api";
import { calculateSummary, formatCurrency } from "@/modules/finance/calculations";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — Foco" },
      { name: "description", content: "Resumo das suas tarefas e finanças." },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const txQuery = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });

  const tasks = tasksQuery.data ?? [];
  const pending = tasks.filter((t) => t.status === "pending").length;
  const completed = tasks.filter((t) => t.status === "completed").length;

  const summary = calculateSummary(txQuery.data ?? []);

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Olá 👋</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Sua semana, num só lugar.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Acompanhe tarefas pendentes e o saldo financeiro com clareza.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          to="/tasks"
          icon={<ListTodo className="h-4 w-4" />}
          label="Tarefas pendentes"
          value={String(pending)}
          hint={`${completed} concluídas`}
        />
        <StatCard
          to="/finance"
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo atual"
          value={formatCurrency(summary.balance)}
          hint={`${formatCurrency(summary.income)} receitas · ${formatCurrency(summary.expense)} despesas`}
          accent={summary.balance >= 0 ? "income" : "expense"}
        />
        <StatCard
          to="/tasks"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Concluídas no total"
          value={String(completed)}
          hint="Continue assim."
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <PanelLink
          to="/tasks"
          title="Tarefas"
          description="Crie, organize e conclua o que importa hoje."
        />
        <PanelLink
          to="/finance"
          title="Finanças"
          description="Registre receitas e despesas e acompanhe seu saldo."
        />
      </section>
    </div>
  );
}

function StatCard({
  to,
  icon,
  label,
  value,
  hint,
  accent,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "income" | "expense";
}) {
  const valueColor =
    accent === "income"
      ? "text-income"
      : accent === "expense"
        ? "text-expense"
        : "text-foreground";
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <ArrowUpRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className={`mt-4 text-3xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Link>
  );
}

function PanelLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl border border-border bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}
