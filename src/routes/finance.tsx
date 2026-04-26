import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  updateTransaction,
} from "@/modules/finance/api";
import type {
  Category,
  FinancialType,
  Transaction,
  TransactionInput,
} from "@/modules/finance/types";
import {
  calculateSummary,
  formatCurrency,
  formatDate,
} from "@/modules/finance/calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finanças — Foco" },
      { name: "description", content: "Controle de receitas e despesas." },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const qc = useQueryClient();
  const txQuery = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });
  const catQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const transactions = txQuery.data ?? [];
  const categories = catQuery.data ?? [];

  const [typeFilter, setTypeFilter] = useState<"all" | FinancialType>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        if (typeFilter !== "all" && t.type !== typeFilter) return false;
        if (categoryFilter !== "all" && t.category_id !== categoryFilter) return false;
        return true;
      }),
    [transactions, typeFilter, categoryFilter],
  );

  const summary = calculateSummary(transactions);

  const create = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transação registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionInput }) =>
      updateTransaction(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setEditing(null);
      toast.success("Transação atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transação removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Finanças</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe receitas, despesas e saldo.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo"
          value={formatCurrency(summary.balance)}
          accent={summary.balance >= 0 ? "income" : "expense"}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receitas"
          value={formatCurrency(summary.income)}
          accent="income"
        />
        <SummaryCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Despesas"
          value={formatCurrency(summary.expense)}
          accent="expense"
        />
      </section>

      <TransactionForm
        categories={categories}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSubmit={(input) => {
          if (editing) update.mutate({ id: editing.id, input });
          else create.mutate(input);
        }}
        pending={create.isPending || update.isPending}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Histórico</h2>
          <div className="ml-auto flex gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="income">Receitas</SelectItem>
                <SelectItem value="expense">Despesas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.type === "income" ? "receita" : "despesa"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {txQuery.isLoading && (
            <li className="p-6 text-sm text-muted-foreground">Carregando…</li>
          )}
          {!txQuery.isLoading && filtered.length === 0 && (
            <li className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma transação encontrada.
            </li>
          )}
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              category={categories.find((c) => c.id === tx.category_id) ?? null}
              onEdit={() => setEditing(tx)}
              onDelete={() => remove.mutate(tx.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "income" | "expense";
}) {
  const color =
    accent === "income"
      ? "text-income"
      : accent === "expense"
        ? "text-expense"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${color}`}>
        {value}
      </div>
    </div>
  );
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function TransactionForm({
  categories,
  editing,
  onSubmit,
  onCancel,
  pending,
}: {
  categories: Category[];
  editing: Transaction | null;
  onSubmit: (input: TransactionInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [type, setType] = useState<FinancialType>(editing?.type ?? "expense");
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : "");
  const [categoryId, setCategoryId] = useState<string>(editing?.category_id ?? "");
  const [occurredAt, setOccurredAt] = useState<string>(editing?.occurred_at ?? todayIso());
  const [description, setDescription] = useState<string>(editing?.description ?? "");

  // Reset when editing changes
  useMemoSync(editing, () => {
    setType(editing?.type ?? "expense");
    setAmount(editing ? String(editing.amount) : "");
    setCategoryId(editing?.category_id ?? "");
    setOccurredAt(editing?.occurred_at ?? todayIso());
    setDescription(editing?.description ?? "");
  });

  const filteredCats = categories.filter((c) => c.type === type);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    onSubmit({
      type,
      amount: value,
      category_id: categoryId || null,
      occurred_at: occurredAt,
      description: description.trim() || null,
    });
    if (!editing) {
      setAmount("");
      setDescription("");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {editing ? "Editar transação" : "Nova transação"}
        </h2>
        <div className="inline-flex rounded-lg border border-border bg-secondary/50 p-0.5 text-xs">
          {(["expense", "income"] as FinancialType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={`rounded-md px-3 py-1 transition-colors ${
                type === t
                  ? t === "income"
                    ? "bg-card text-income shadow-sm"
                    : "bg-card text-expense shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "income" ? "Receita" : "Despesa"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="Valor"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {filteredCats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        <div className="flex gap-2">
          {editing && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {editing ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </div>
      <Input
        className="mt-3"
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
    </form>
  );
}

function TransactionRow({
  tx,
  category,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  category: Category | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = tx.type === "income";
  return (
    <li className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isIncome ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
        }`}
      >
        {isIncome ? (
          <TrendingUp className="h-4 w-4" />
        ) : (
          <TrendingDown className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {tx.description || (category?.name ?? "Sem descrição")}
        </p>
        <p className="text-xs text-muted-foreground">
          {category?.name ?? "Sem categoria"} · {formatDate(tx.occurred_at)}
        </p>
      </div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          isIncome ? "text-income" : "text-expense"
        }`}
      >
        {isIncome ? "+" : "−"} {formatCurrency(Number(tx.amount))}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// Tiny helper: run side-effect when dep identity changes (avoids extra useEffect import noise)
import { useEffect, useRef } from "react";
function useMemoSync<T>(dep: T, fn: () => void) {
  const prev = useRef<T>(dep);
  useEffect(() => {
    if (prev.current !== dep) {
      prev.current = dep;
      fn();
    } else {
      // first run: sync once
      fn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}
