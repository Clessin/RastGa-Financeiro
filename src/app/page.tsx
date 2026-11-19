'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DebtIconType,
  ExpenseIconType,
  IncomeRecord,
  TagGoal,
  TransactionIconType,
  TransactionRecord,
} from '@/types/finance';
import {
  calculateDueStatus,
  calculateInstallmentInfo,
  formatBRL,
  formatTransactionDateBR,
  getCurrentMonthYear,
  getInitialGoals,
  getInitialIncomes,
  getInitialTransactions,
  getOffsetDateString,
  getTransactionSortTimestamp,
  isFuelTransaction,
} from '@/data/initialData';
import {
  addExtraIncomeDB,
  addTransactionDB,
  deleteIncomeDB,
  deleteTransactionDB,
  fetchAllFinanceData,
  markDebtPaidDB,
  markDebtUnpaidDB,
  updateBaseSalaryDB,
} from '@/lib/supabase';

type ActivePage = 'home' | 'debts' | 'expenses' | 'reports' | 'goals' | 'history';
type ActiveModal =
  | null
  | 'confirm_salary'
  | 'edit_salary'
  | 'new_debt'
  | 'new_expense_or_income';

const PAGE_TITLES: Record<Exclude<ActivePage, 'home'>, string> = {
  debts: 'Minhas Dívidas',
  expenses: 'Gastos & Entradas',
  reports: 'Relatórios Financeiros',
  goals: 'Metas por Tag',
  history: 'Histórico Completo',
};

export default function FinanceHomePage() {
  const [incomes, setIncomes] = useState<IncomeRecord[]>(() => getInitialIncomes());
  const [transactions, setTransactions] = useState<TransactionRecord[]>(() =>
    getInitialTransactions()
  );
  const [goals, setGoals] = useState<TagGoal[]>(() => getInitialGoals());
  const [showValues, setShowValues] = useState<boolean>(true);
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [usingSupabase, setUsingSupabase] = useState<boolean>(false);

  // Alterar Salário (2 etapas)
  const [salaryInput, setSalaryInput] = useState<string>('0');

  // Nova Dívida
  const [debtDesc, setDebtDesc] = useState<string>('');
  const [debtAmount, setDebtAmount] = useState<string>('');
  const [debtDueDate, setDebtDueDate] = useState<string>(() => getOffsetDateString(3));
  const [debtIcon, setDebtIcon] = useState<DebtIconType>('wifi');
  const [debtTag, setDebtTag] = useState<string>('Casa');
  const [isInstallmentDebt, setIsInstallmentDebt] = useState<boolean>(false);
  const [debtCurrentInstallment, setDebtCurrentInstallment] = useState<string>('1');
  const [debtTotalInstallments, setDebtTotalInstallments] = useState<string>('10');

  // Novo Gasto / Nova Entrada Extra
  const [entryMode, setEntryMode] = useState<'expense' | 'income'>('expense');
  const [expenseDesc, setExpenseDesc] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseIcon, setExpenseIcon] = useState<ExpenseIconType>('cart');
  const [expenseTag, setExpenseTag] = useState<string>('Supermercado');

  const [incomeDesc, setIncomeDesc] = useState<string>('');
  const [incomeAmount, setIncomeAmount] = useState<string>('');
  const [incomeTag, setIncomeTag] = useState<string>('Extra');

  // Nova Meta por Tag
  const [goalTagInput, setGoalTagInput] = useState<string>('');
  const [goalLimitInput, setGoalLimitInput] = useState<string>('');

  // Filtros
  const [debtStatusFilter, setDebtStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [debtTagFilter, setDebtTagFilter] = useState<string>('Todas');
  const [expenseTagFilter, setExpenseTagFilter] = useState<string>('Todas');
  const [historyTagFilter, setHistoryTagFilter] = useState<string>('Todas');
  const [fuelAccordionOpen, setFuelAccordionOpen] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    fetchAllFinanceData().then((res) => {
      if (!mounted) return;
      setIncomes(res.incomes);
      setTransactions(res.transactions);
      setUsingSupabase(res.usingSupabase);
    });
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Cálculos principais (sem salário cadastrado = R$ 0,00)
  const baseSalary = useMemo(() => {
    const base = incomes.find((i) => i.is_base_salary);
    return base ? Number(base.amount) : 0;
  }, [incomes]);

  const extraIncomesList = useMemo(
    () => incomes.filter((i) => !i.is_base_salary),
    [incomes]
  );

  const totalExtraIncomes = useMemo(
    () => extraIncomesList.reduce((acc, item) => acc + Number(item.amount), 0),
    [extraIncomesList]
  );

  const totalSalary = useMemo(
    () => baseSalary + totalExtraIncomes,
    [baseSalary, totalExtraIncomes]
  );

  const debtsList = useMemo(
    () => transactions.filter((t) => t.type === 'debt'),
    [transactions]
  );

  const expensesList = useMemo(
    () => transactions.filter((t) => t.type === 'expense'),
    [transactions]
  );

  const totalPaidDebts = useMemo(
    () =>
      debtsList
        .filter((d) => d.paid)
        .reduce((acc, item) => acc + Number(item.amount), 0),
    [debtsList]
  );

  const totalPendingDebts = useMemo(
    () =>
      debtsList
        .filter((d) => !d.paid)
        .reduce((acc, item) => acc + Number(item.amount), 0),
    [debtsList]
  );

  const totalAllDebts = useMemo(
    () => totalPaidDebts + totalPendingDebts,
    [totalPaidDebts, totalPendingDebts]
  );

  const totalExpenses = useMemo(
    () => expensesList.reduce((acc, item) => acc + Number(item.amount), 0),
    [expensesList]
  );

  const availableBalance = useMemo(
    () => baseSalary + totalExtraIncomes - totalPaidDebts - totalExpenses,
    [baseSalary, totalExtraIncomes, totalPaidDebts, totalExpenses]
  );

  // Dados para a Página Dedicada de Relatórios
  const alreadyOutOfAccount = totalPaidDebts + totalExpenses;
  const guaranteedRealLeftover = totalSalary - (totalAllDebts + totalExpenses);
  const committedIncomePct =
    totalSalary > 0
      ? Math.min(100, Math.round(((totalAllDebts + totalExpenses) / totalSalary) * 100))
      : 0;

  const tagRankingList = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      const key = t.tag || 'Geral';
      map[key] = (map[key] || 0) + Number(t.amount);
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, amount]) => ({
        tag,
        amount,
        pctSalary: totalSalary > 0 ? Math.round((amount / totalSalary) * 100) : 0,
      }));
  }, [transactions, totalSalary]);

  const paidDebtsCount = useMemo(() => debtsList.filter((d) => d.paid).length, [debtsList]);
  const quitProgressPct =
    debtsList.length > 0 ? Math.round((paidDebtsCount / debtsList.length) * 100) : 0;

  const dueNext7DaysInfo = useMemo(() => {
    const list = debtsList.filter((d) => {
      if (d.paid || !d.due_date) return false;
      const status = calculateDueStatus(d.due_date, false);
      return status.daysLeft >= 0 && status.daysLeft <= 7;
    });
    const total = list.reduce((sum, d) => sum + Number(d.amount), 0);
    return { count: list.length, total };
  }, [debtsList]);

  const fixedCostPct =
    totalSalary > 0 ? Math.round((totalAllDebts / totalSalary) * 100) : 0;
  const dailyExpensePct =
    totalSalary > 0 ? Math.round((totalExpenses / totalSalary) * 100) : 0;

  const extrasByTagSummary = useMemo(() => {
    const map: Record<string, number> = {};
    extraIncomesList.forEach((inc) => {
      const k = inc.tag || 'Extra';
      map[k] = (map[k] || 0) + Number(inc.amount);
    });
    return Object.entries(map).map(([tag, amount]) => ({
      tag,
      amount,
      pct: totalSalary > 0 ? Math.round((amount / totalSalary) * 100) : 0,
    }));
  }, [extraIncomesList, totalSalary]);

  // Filtro automático de gastos com Gasolina / Combustível no month_year vigente
  const fuelTransactions = useMemo(() => {
    const currentMonthYear = getCurrentMonthYear();
    return transactions
      .filter((tx) => isFuelTransaction(tx, currentMonthYear))
      .slice()
      .sort((a, b) => {
        const diff =
          getTransactionSortTimestamp(b.due_date, b.created_at) -
          getTransactionSortTimestamp(a.due_date, a.created_at);
        if (diff !== 0) return diff;
        return (
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      });
  }, [transactions]);

  const totalFuelSpent = useMemo(
    () => fuelTransactions.reduce((acc, item) => acc + Number(item.amount), 0),
    [fuelTransactions]
  );

  // Fluxo de 2 etapas para alterar salário
  const handleStartSalaryChange = () => {
    setActiveModal('confirm_salary');
  };

  const handleConfirmSalaryStep = () => {
    setSalaryInput(String(baseSalary));
    setActiveModal('edit_salary');
  };

  const handleSaveNewSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(salaryInput.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) return;
    const updated = await updateBaseSalaryDB(parsed, incomes);
    setIncomes(updated);
    setActiveModal(null);
  };

  const handlePayDebt = async (id: string) => {
    const updated = await markDebtPaidDB(id, transactions);
    setTransactions(updated);
  };

  const handleUndoPayDebt = async (id: string) => {
    const updated = await markDebtUnpaidDB(id, transactions);
    setTransactions(updated);
  };

  const handleDeleteTransaction = async (id: string) => {
    const updated = await deleteTransactionDB(id, transactions);
    setTransactions(updated);
  };

  const handleDeleteIncome = async (id: string) => {
    const updated = await deleteIncomeDB(id, incomes);
    setIncomes(updated);
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(debtAmount.replace(',', '.'));
    if (!debtDesc.trim() || isNaN(amountNum) || amountNum <= 0) return;

    const totalInst = isInstallmentDebt
      ? Math.max(2, parseInt(debtTotalInstallments, 10) || 2)
      : 1;
    const currInst = isInstallmentDebt
      ? Math.max(1, Math.min(totalInst, parseInt(debtCurrentInstallment, 10) || 1))
      : 1;

    const updated = await addTransactionDB(
      {
        title: debtDesc.trim(),
        amount: amountNum,
        type: 'debt',
        tag: debtTag.trim() || 'Geral',
        icon: debtIcon,
        due_date: debtDueDate || getOffsetDateString(3),
        paid: false,
        total_installments: totalInst,
        current_installment: currInst,
      },
      transactions
    );
    setTransactions(updated);
    setDebtDesc('');
    setDebtAmount('');
    setIsInstallmentDebt(false);
    setDebtCurrentInstallment('1');
    setDebtTotalInstallments('10');
    setActiveModal(null);
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseAmount.replace(',', '.'));
    if (!expenseDesc.trim() || isNaN(amountNum) || amountNum <= 0) return;

    const updated = await addTransactionDB(
      {
        title: expenseDesc.trim(),
        amount: amountNum,
        type: 'expense',
        tag: expenseTag.trim() || 'Geral',
        icon: expenseIcon,
        due_date: null,
        paid: true,
        total_installments: 1,
        current_installment: 1,
      },
      transactions
    );
    setTransactions(updated);
    setExpenseDesc('');
    setExpenseAmount('');
    setActiveModal(null);
  };

  const handleCreateExtraIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(incomeAmount.replace(',', '.'));
    if (!incomeDesc.trim() || isNaN(amountNum) || amountNum <= 0) return;

    const updated = await addExtraIncomeDB(
      {
        title: incomeDesc.trim(),
        amount: amountNum,
        tag: incomeTag.trim() || 'Extra',
      },
      incomes
    );
    setIncomes(updated);
    setIncomeDesc('');
    setIncomeAmount('');
    setActiveModal(null);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const limitNum = parseFloat(goalLimitInput.replace(',', '.'));
    const tagClean = goalTagInput.trim();
    if (!tagClean || isNaN(limitNum) || limitNum <= 0) return;

    setGoals((prev) => {
      const exists = prev.some((g) => g.tag.toLowerCase() === tagClean.toLowerCase());
      if (exists) {
        return prev.map((g) =>
          g.tag.toLowerCase() === tagClean.toLowerCase() ? { ...g, limit: limitNum } : g
        );
      }
      return [...prev, { tag: tagClean, limit: limitNum }];
    });
    setGoalTagInput('');
    setGoalLimitInput('');
  };

  const allDebtTags = useMemo(() => {
    const set = new Set<string>(['Todas']);
    debtsList.forEach((d) => set.add(d.tag));
    return Array.from(set);
  }, [debtsList]);

  const allExpenseAndExtraTags = useMemo(() => {
    const set = new Set<string>(['Todas']);
    expensesList.forEach((e) => set.add(e.tag));
    extraIncomesList.forEach((i) => set.add(i.tag));
    return Array.from(set);
  }, [expensesList, extraIncomesList]);

  const allHistoryTags = useMemo(() => {
    const set = new Set<string>(['Todas']);
    incomes.forEach((i) => set.add(i.tag));
    transactions.forEach((t) => set.add(t.tag));
    return Array.from(set);
  }, [incomes, transactions]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen bg-[#F8F9FA] flex flex-col shadow-sm">
        {/* ================================================================== */}
        {/* REGRA DE CABEÇALHO:                                                */}
        {/* - Em "home": Exibe Cabeçalho Principal do Salário (Azul Cereja)    */}
        {/* - Nas demais páginas: Oculta o Salário e exibe "← Voltar" + Título */}
        {/* ================================================================== */}
        {activePage === 'home' ? (
          <header
            style={{
              background: 'linear-gradient(145deg, #1E1B4B 0%, #2A1B4E 100%)',
              color: '#FFFFFF',
            }}
            className="w-full px-5 pt-7 pb-6 text-left select-none"
          >
            <div className="flex items-center justify-between mb-1">
              <span
                style={{ fontSize: '14px', fontWeight: 400, color: '#A0A0A0' }}
                className="leading-tight"
              >
                Salário Total
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 text-[#A0A0A0]">
                {usingSupabase ? 'Supabase Conectado' : 'Modo Local Ativo'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleStartSalaryChange}
              title="Toque para alterar o seu salário atual"
              style={{ fontSize: '28px', fontWeight: 700, color: '#FFFFFF' }}
              className="block text-left tracking-tight hover:opacity-90 active:scale-[0.99] transition-transform cursor-pointer focus:outline-none"
            >
              {formatBRL(totalSalary, showValues)}
            </button>

            {totalExtraIncomes > 0 && (
              <p className="text-xs text-[#A0A0A0] mt-0.5">
                Salário Base: {formatBRL(baseSalary, showValues)} + Extras:{' '}
                {formatBRL(totalExtraIncomes, showValues)}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-white/15">
              <p className="text-sm font-medium text-white/90">
                Saldo Atual Disponível:{' '}
                <span className="font-semibold text-white">
                  {formatBRL(availableBalance, showValues)}
                </span>
              </p>

              <button
                type="button"
                onClick={() => setShowValues((prev) => !prev)}
                aria-label={showValues ? 'Ocultar valores monetários' : 'Exibir valores monetários'}
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
              >
                {showValues ? <EyeOpenIcon /> : <EyeClosedIcon />}
              </button>
            </div>
          </header>
        ) : (
          <header
            style={{
              background: 'linear-gradient(145deg, #1E1B4B 0%, #2A1B4E 100%)',
              color: '#FFFFFF',
            }}
            className="w-full px-5 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setActivePage('home')}
              className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>←</span>
              <span>Voltar</span>
            </button>
            <h1 className="text-base font-semibold text-white">
              {PAGE_TITLES[activePage]}
            </h1>
          </header>
        )}

        {/* ================================================================== */}
        {/* PÁGINA 1: INÍCIO (HOME)                                            */}
        {/* ================================================================== */}
        {activePage === 'home' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-7 bg-[#F8F9FA]">
            {/* SEÇÃO 2: AÇÕES RÁPIDAS (CARROSSEL HORIZONTAL COM RELATÓRIOS) */}
            <section>
              <h2
                style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}
                className="mb-3.5"
              >
                Ações Rápidas
              </h2>

              <div className="flex items-start justify-between gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {/* 1. Pagar conta */}
                <button
                  type="button"
                  onClick={() => setActiveModal('new_debt')}
                  className="flex flex-col items-center min-w-[68px] group focus:outline-none"
                >
                  <div
                    style={{ backgroundColor: '#F0F0F2', color: '#1E1B4B' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center group-hover:brightness-95 group-active:scale-95 transition-all"
                  >
                    <QuickPayBillIcon />
                  </div>
                  <span className="mt-2 text-xs font-medium text-[#1A1A1A] whitespace-nowrap">
                    Pagar conta
                  </span>
                </button>

                {/* 2. Novo gasto */}
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('expense');
                    setActiveModal('new_expense_or_income');
                  }}
                  className="flex flex-col items-center min-w-[68px] group focus:outline-none"
                >
                  <div
                    style={{ backgroundColor: '#F0F0F2', color: '#1E1B4B' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center group-hover:brightness-95 group-active:scale-95 transition-all"
                  >
                    <QuickPlusIcon />
                  </div>
                  <span className="mt-2 text-xs font-medium text-[#1A1A1A] whitespace-nowrap">
                    Novo gasto
                  </span>
                </button>

                {/* 3. Relatórios (NOVO ÍCONE DE ANALYTICS) */}
                <button
                  type="button"
                  onClick={() => setActivePage('reports')}
                  className="flex flex-col items-center min-w-[68px] group focus:outline-none"
                >
                  <div
                    style={{ backgroundColor: '#F0F0F2', color: '#1E1B4B' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center group-hover:brightness-95 group-active:scale-95 transition-all"
                  >
                    <QuickReportsIcon />
                  </div>
                  <span className="mt-2 text-xs font-medium text-[#1A1A1A] whitespace-nowrap">
                    Relatórios
                  </span>
                </button>

                {/* 4. Metas */}
                <button
                  type="button"
                  onClick={() => setActivePage('goals')}
                  className="flex flex-col items-center min-w-[68px] group focus:outline-none"
                >
                  <div
                    style={{ backgroundColor: '#F0F0F2', color: '#1E1B4B' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center group-hover:brightness-95 group-active:scale-95 transition-all"
                  >
                    <QuickTargetIcon />
                  </div>
                  <span className="mt-2 text-xs font-medium text-[#1A1A1A] whitespace-nowrap">
                    Metas
                  </span>
                </button>

                {/* 5. Histórico */}
                <button
                  type="button"
                  onClick={() => setActivePage('history')}
                  className="flex flex-col items-center min-w-[68px] group focus:outline-none"
                >
                  <div
                    style={{ backgroundColor: '#F0F0F2', color: '#1E1B4B' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center group-hover:brightness-95 group-active:scale-95 transition-all"
                  >
                    <QuickHistoryIcon />
                  </div>
                  <span className="mt-2 text-xs font-medium text-[#1A1A1A] whitespace-nowrap">
                    Histórico
                  </span>
                </button>
              </div>
            </section>

            {/* SEÇÃO 3: MINHAS DÍVIDAS */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>
                  Minhas Dívidas
                </h2>
                <button
                  type="button"
                  onClick={() => setActivePage('debts')}
                  className="text-xs font-medium text-neutral-500 hover:text-[#1E1B4B]"
                >
                  Ver todas
                </button>
              </div>

              {debtsList.length === 0 ? (
                <div className="bg-white rounded-2xl p-5 border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
                  Nenhuma dívida cadastrada neste mês
                </div>
              ) : (
                <div className="space-y-3">
                  {debtsList.map((debt) => (
                    <DebtCardRow
                      key={debt.id}
                      debt={debt}
                      showValues={showValues}
                      onPay={() => handlePayDebt(debt.id)}
                      onUndoPay={() => handleUndoPayDebt(debt.id)}
                      onDelete={() => handleDeleteTransaction(debt.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* SEÇÃO 4: ÚLTIMOS GASTOS */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>
                  Últimos Gastos
                </h2>
                <button
                  type="button"
                  onClick={() => setActivePage('expenses')}
                  className="text-xs font-medium text-neutral-500 hover:text-[#1E1B4B]"
                >
                  Ver todos
                </button>
              </div>

              {expensesList.length === 0 ? (
                <div className="bg-white rounded-2xl p-5 border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
                  Nenhum gasto registrado
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {expensesList.map((exp) => (
                    <ExpenseCompactCard
                      key={exp.id}
                      expense={exp}
                      showValues={showValues}
                      onDelete={() => handleDeleteTransaction(exp.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>
        )}

        {/* ================================================================== */}
        {/* PÁGINA INTERNA: DÍVIDAS                                            */}
        {/* ================================================================== */}
        {activePage === 'debts' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-5 bg-[#F8F9FA]">
            <div className="flex items-center justify-between">
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>
                Dívidas do Mês
              </h2>
              <button
                type="button"
                onClick={() => setActiveModal('new_debt')}
                style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold"
              >
                + Nova Dívida
              </button>
            </div>

            <div className="flex gap-2">
              {(['all', 'pending', 'paid'] as const).map((status) => {
                const labels = { all: 'Todas', pending: 'Pendentes', paid: 'Pagas' };
                const active = debtStatusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setDebtStatusFilter(status)}
                    style={active ? { backgroundColor: '#1E1B4B', color: '#FFFFFF' } : {}}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      active ? '' : 'bg-[#F0F0F2] text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {labels[status]}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {allDebtTags.map((tag) => {
                const active = debtTagFilter === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDebtTagFilter(tag)}
                    style={
                      active
                        ? { backgroundColor: '#1E1B4B', color: '#FFFFFF', borderColor: '#1E1B4B' }
                        : {}
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${
                      active ? '' : 'bg-white text-neutral-600 border-neutral-200'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {debtsList
                .filter((d) => {
                  if (debtStatusFilter === 'pending' && d.paid) return false;
                  if (debtStatusFilter === 'paid' && !d.paid) return false;
                  if (debtTagFilter !== 'Todas' && d.tag !== debtTagFilter) return false;
                  return true;
                })
                .map((debt) => (
                  <DebtCardRow
                    key={debt.id}
                    debt={debt}
                    showValues={showValues}
                    onPay={() => handlePayDebt(debt.id)}
                    onUndoPay={() => handleUndoPayDebt(debt.id)}
                    onDelete={() => handleDeleteTransaction(debt.id)}
                  />
                ))}
            </div>
          </main>
        )}

        {/* ================================================================== */}
        {/* PÁGINA INTERNA: GASTOS & ENTRADAS                                  */}
        {/* ================================================================== */}
        {activePage === 'expenses' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-5 bg-[#F8F9FA]">
            <div className="flex items-center justify-between gap-2">
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>
                Gastos & Entradas Extras
              </h2>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('expense');
                    setActiveModal('new_expense_or_income');
                  }}
                  style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                >
                  + Gasto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('income');
                    setActiveModal('new_expense_or_income');
                  }}
                  className="px-3 py-1.5 rounded-full bg-emerald-700 text-white text-xs font-semibold"
                >
                  + Entrada Extra
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {allExpenseAndExtraTags.map((tag) => {
                const active = expenseTagFilter === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setExpenseTagFilter(tag)}
                    style={
                      active
                        ? { backgroundColor: '#1E1B4B', color: '#FFFFFF', borderColor: '#1E1B4B' }
                        : {}
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${
                      active ? '' : 'bg-white text-neutral-600 border-neutral-200'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            {extraIncomesList.filter(
              (inc) => expenseTagFilter === 'Todas' || inc.tag === expenseTagFilter
            ).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Entradas Extras
                </h3>
                {extraIncomesList
                  .filter(
                    (inc) => expenseTagFilter === 'Todas' || inc.tag === expenseTagFilter
                  )
                  .map((inc) => (
                    <div
                      key={inc.id}
                      className="bg-white rounded-2xl p-3.5 border border-neutral-100 shadow-sm flex items-center justify-between"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-[#1A1A1A]">
                          {inc.title}
                        </p>
                        <span className="inline-block mt-0.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                          #{inc.tag}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-emerald-700">
                          + {formatBRL(inc.amount, showValues)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteIncome(inc.id)}
                          title="Excluir entrada"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Gastos Rápidos
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {expensesList
                  .filter(
                    (exp) => expenseTagFilter === 'Todas' || exp.tag === expenseTagFilter
                  )
                  .map((exp) => (
                    <ExpenseCompactCard
                      key={exp.id}
                      expense={exp}
                      showValues={showValues}
                      onDelete={() => handleDeleteTransaction(exp.id)}
                    />
                  ))}
              </div>
            </div>
          </main>
        )}

        {/* ================================================================== */}
        {/* PÁGINA INTERNA DEDICADA: RELATÓRIOS (RELATÓRIOS MINIMALISTAS)      */}
        {/* ================================================================== */}
        {activePage === 'reports' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-5 bg-[#F8F9FA]">
            {/* NOVO RELATÓRIO: GASTOS COM GASOLINA NO MÊS */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    style={{ backgroundColor: '#EEF2FF', color: '#1E1B4B' }}
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  >
                    <FuelPumpIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#1A1A1A] truncate">
                      Gasto Total com Gasolina
                    </h2>
                    <p className="text-xs text-neutral-500">
                      {fuelTransactions.length}{' '}
                      {fuelTransactions.length === 1
                        ? 'abastecimento no mês'
                        : 'abastecimentos no mês'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <strong className="text-lg font-bold text-[#1E1B4B]">
                    {formatBRL(totalFuelSpent, showValues)}
                  </strong>
                </div>
              </div>
            </section>

            {/* 1. Termômetro de Sobra Real do Mês */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  1. Termômetro de Sobra Real do Mês
                </h2>
                <p className="text-xs text-neutral-500">
                  Comparativo entre o que já saiu, o que falta pagar e a sobra real garantida.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-[#F8F9FA] border border-neutral-200/70">
                  <span className="block text-[11px] text-neutral-500 leading-tight mb-1">
                    Já saiu da conta
                  </span>
                  <strong className="text-xs font-bold text-[#1A1A1A]">
                    {formatBRL(alreadyOutOfAccount, showValues)}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8F9FA] border border-neutral-200/70">
                  <span className="block text-[11px] text-neutral-500 leading-tight mb-1">
                    Falta pagar no mês
                  </span>
                  <strong className="text-xs font-bold text-orange-700">
                    {formatBRL(totalPendingDebts, showValues)}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-[#EEF2FF] border border-indigo-200">
                  <span className="block text-[11px] text-[#1E1B4B] leading-tight mb-1">
                    Sobra Real Garantida
                  </span>
                  <strong className="text-xs font-bold text-[#1E1B4B]">
                    {formatBRL(guaranteedRealLeftover, showValues)}
                  </strong>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                  <span>Comprometimento da Renda</span>
                  <span>{committedIncomePct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    style={{
                      width: `${committedIncomePct}%`,
                      background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>
            </section>

            {/* 2. Ranking de Gastos por TAG */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  2. Ranking de Gastos por TAG
                </h2>
                <p className="text-xs text-neutral-500">
                  Tags que mais consumiram dinheiro no mês e porcentagem sobre o salário.
                </p>
              </div>

              {tagRankingList.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-2">
                  Nenhum gasto ou dívida registrado ainda.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {tagRankingList.map((item) => (
                    <div key={item.tag} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                        <span>#{item.tag}</span>
                        <span>
                          {formatBRL(item.amount, showValues)} ({item.pctSalary}% do salário)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(4, item.pctSalary))}%`,
                            background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                          }}
                          className="h-full rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Radar de Vencimentos e Progresso de Quitação */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  3. Radar de Vencimentos e Quitação
                </h2>
                <p className="text-xs text-neutral-500">
                  Progresso das dívidas quitadas e contas que vencem nos próximos 7 dias.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                  <span>Dívidas Quitadas</span>
                  <span>
                    {paidDebtsCount} de {debtsList.length} quitadas - {quitProgressPct}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    style={{
                      width: `${quitProgressPct}%`,
                      background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F8F9FA] border border-neutral-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A]">
                    Vencendo nos próximos 7 dias
                  </p>
                  <span className="text-[11px] text-neutral-500">
                    {dueNext7DaysInfo.count} conta(s) pendente(s)
                  </span>
                </div>
                <strong className="text-sm font-bold text-[#1E1B4B]">
                  {formatBRL(dueNext7DaysInfo.total, showValues)}
                </strong>
              </div>
            </section>

            {/* 4. Raio-X: Custo Fixo (Dívidas) vs. Gastos do Dia a Dia */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  4. Raio-X: Custo Fixo vs. Gastos do Dia a Dia
                </h2>
                <p className="text-xs text-neutral-500">
                  Comparativo percentual entre Dívidas e Gastos avulsos sobre a renda.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                  <span>Custo Fixo (Dívidas)</span>
                  <span>
                    {formatBRL(totalAllDebts, showValues)} ({fixedCostPct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    style={{
                      width: `${Math.min(100, fixedCostPct)}%`,
                      background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                  <span>Gastos do Dia a Dia</span>
                  <span>
                    {formatBRL(totalExpenses, showValues)} ({dailyExpensePct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, dailyExpensePct)}%` }}
                    className="h-full rounded-full bg-neutral-400"
                  />
                </div>
              </div>

              <div
                className={`p-2.5 rounded-xl text-xs font-medium ${
                  fixedCostPct > 50
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-[#EEF2FF] text-[#1E1B4B] border border-indigo-200'
                }`}
              >
                {fixedCostPct > 50
                  ? `Alerta: Seu custo fixo (${fixedCostPct}%) ultrapassou 50% da sua renda.`
                  : `Saudável: Seu custo fixo (${fixedCostPct}%) está dentro do limite de 50% da renda.`}
              </div>
            </section>

            {/* 5. Resumo de Entradas */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  5. Resumo de Entradas
                </h2>
                <p className="text-xs text-neutral-500">
                  Divisão entre Salário Base e soma de Entradas Extras por Tag.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                  <span>Salário Base (#Salário)</span>
                  <span>
                    {formatBRL(baseSalary, showValues)} (
                    {totalSalary > 0 ? Math.round((baseSalary / totalSalary) * 100) : 100}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    style={{
                      width: `${
                        totalSalary > 0
                          ? Math.min(100, Math.round((baseSalary / totalSalary) * 100))
                          : 100
                      }%`,
                      background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>

              {extrasByTagSummary.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Nenhuma entrada extra registrada no período.
                </p>
              ) : (
                extrasByTagSummary.map((item) => (
                  <div key={item.tag} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#1A1A1A]">
                      <span>Entrada Extra (#{item.tag})</span>
                      <span>
                        + {formatBRL(item.amount, showValues)} ({item.pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(4, item.pct))}%` }}
                        className="h-full rounded-full bg-neutral-400"
                      />
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* 6. Fim dos Parcelamentos (Dívidas Parceladas) */}
            <section className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">
                  6. Fim dos Parcelamentos
                </h2>
                <p className="text-xs text-neutral-500">
                  Compras parceladas ativas, valor ainda comprometido nos próximos meses e previsão de término.
                </p>
              </div>

              {(() => {
                const installmentDebts = debtsList
                  .map((d) => ({
                    debt: d,
                    info: calculateInstallmentInfo(
                      d.due_date,
                      d.paid,
                      d.current_installment,
                      d.total_installments
                    ),
                  }))
                  .filter((item) => item.info.isInstallment);

                const totalCommittedFuture = installmentDebts.reduce(
                  (acc, item) => acc + Number(item.debt.amount) * item.info.remaining,
                  0
                );

                if (installmentDebts.length === 0) {
                  return (
                    <p className="text-xs text-neutral-500 text-center py-2">
                      Nenhuma compra parcelada cadastrada no momento.
                    </p>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-[#EEF2FF] border border-indigo-200 flex items-center justify-between">
                      <div>
                        <span className="block text-[11px] font-medium text-[#1E1B4B]">
                          Total ainda comprometido (próximas parcelas)
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          {installmentDebts.filter((x) => x.info.remaining > 0).length} parcelamento(s) ativo(s)
                        </span>
                      </div>
                      <strong className="text-sm font-bold text-[#1E1B4B]">
                        {formatBRL(totalCommittedFuture, showValues)}
                      </strong>
                    </div>

                    <div className="space-y-2.5">
                      {installmentDebts.map(({ debt, info }) => {
                        const committedValue = Number(debt.amount) * info.remaining;
                        return (
                          <div
                            key={debt.id}
                            className="p-3 rounded-xl bg-[#F8F9FA] border border-neutral-200/80 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-[#1A1A1A]">
                                    {debt.title}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-neutral-200 text-neutral-600">
                                    Parcela {info.current} de {info.total}
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-500 mt-0.5">
                                  {info.isLastInstallmentPaid
                                    ? 'Última parcela paga / Dívida quitada 🎉'
                                    : `${info.remaining === 1 ? 'Falta 1 parcela' : `Faltam ${info.remaining} parcelas`} • Acaba em ${info.endMonthYear}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="block text-[10px] text-neutral-500">
                                  Restante total
                                </span>
                                <strong className="text-xs font-bold text-[#1E1B4B]">
                                  {formatBRL(committedValue, showValues)}
                                </strong>
                              </div>
                            </div>

                            <div className="w-full h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                              <div
                                style={{
                                  width: `${info.progressPct}%`,
                                  background:
                                    'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
                                }}
                                className="h-full rounded-full transition-all"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </section>
          </main>
        )}

        {/* ================================================================== */}
        {/* PÁGINA INTERNA DEDICADA: METAS                                     */}
        {/* ================================================================== */}
        {activePage === 'goals' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-5 bg-[#F8F9FA]">
            <form
              onSubmit={handleSaveGoal}
              className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-sm space-y-3"
            >
              <h2 className="text-sm font-semibold text-[#1A1A1A]">
                Definir ou Atualizar Meta de Tag
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Tag (ex: Lazer)"
                  value={goalTagInput}
                  onChange={(e) => setGoalTagInput(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Limite R$"
                  value={goalLimitInput}
                  onChange={(e) => setGoalLimitInput(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
              </div>
              <button
                type="submit"
                style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                className="w-full py-2.5 rounded-full text-xs font-semibold"
              >
                Salvar Meta da Tag
              </button>
            </form>

            {goals.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
                Nenhuma meta cadastrada ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal) => {
                  const spentInTag = transactions
                    .filter(
                      (t) =>
                        t.tag.toLowerCase() === goal.tag.toLowerCase() &&
                        (t.type === 'expense' || t.paid)
                    )
                    .reduce((sum, t) => sum + Number(t.amount), 0);
                  const pct = Math.min(100, Math.round((spentInTag / goal.limit) * 100));
                  const over = spentInTag > goal.limit;

                  return (
                    <div
                      key={goal.tag}
                      className="p-3.5 rounded-2xl bg-white border border-neutral-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#1A1A1A]">#{goal.tag}</span>
                        <span className={over ? 'text-red-600 font-semibold' : 'text-[#1E1B4B] font-semibold'}>
                          {formatBRL(spentInTag, showValues)} / {formatBRL(goal.limit, showValues)}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                        <div
                          style={{
                            width: `${pct}%`,
                            backgroundColor: over ? '#DC2626' : '#1E1B4B',
                          }}
                          className="h-full rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ================================================================== */}
        {/* PÁGINA INTERNA DEDICADA: HISTÓRICO                                 */}
        {/* ================================================================== */}
        {activePage === 'history' && (
          <main className="flex-1 px-5 pt-6 pb-8 space-y-4 bg-[#F8F9FA]">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {allHistoryTags.map((tag) => {
                const active = historyTagFilter === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setHistoryTagFilter(tag)}
                    style={active ? { backgroundColor: '#1E1B4B', color: '#FFFFFF' } : {}}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      active ? '' : 'bg-[#F0F0F2] text-neutral-700'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {incomes
                .filter((i) => historyTagFilter === 'Todas' || i.tag === historyTagFilter)
                .map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        {inc.title}
                      </p>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        Entrada • #{inc.tag}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">
                      + {formatBRL(inc.amount, showValues)}
                    </span>
                  </div>
                ))}

              {transactions
                .filter((t) => historyTagFilter === 'Todas' || t.tag === historyTagFilter)
                .map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-neutral-200"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        {tx.title}
                      </p>
                      <span className="text-[11px] text-neutral-500">
                        {tx.type === 'debt'
                          ? tx.paid
                            ? 'Dívida Paga'
                            : 'Dívida Pendente'
                          : 'Gasto Avulso'}{' '}
                        • #{tx.tag}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        tx.type === 'debt' && !tx.paid
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      - {formatBRL(tx.amount, showValues)}
                    </span>
                  </div>
                ))}
            </div>
          </main>
        )}

        {/* ================================================================== */}
        {/* SEÇÃO 5: BARRA DE NAVEGAÇÃO INFERIOR (AZUL CEREJA)                 */}
        {/* ================================================================== */}
        <nav
          style={{
            background: 'linear-gradient(145deg, #1E1B4B 0%, #2A1B4E 100%)',
          }}
          className="fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-white/10"
        >
          <div className="w-full max-w-md flex items-center justify-around py-2.5 px-4">
            <button
              type="button"
              onClick={() => setActivePage('home')}
              style={{ color: activePage === 'home' ? '#FFFFFF' : '#7A7A7A' }}
              className="flex flex-col items-center gap-1 py-1 px-4 transition-colors focus:outline-none"
            >
              <TabHomeIcon active={activePage === 'home'} />
              <span className="text-[11px] font-medium">Início</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('debts')}
              style={{ color: activePage === 'debts' ? '#FFFFFF' : '#7A7A7A' }}
              className="flex flex-col items-center gap-1 py-1 px-4 transition-colors focus:outline-none"
            >
              <TabDebtsIcon />
              <span className="text-[11px] font-medium">Dívidas</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('expenses')}
              style={{ color: activePage === 'expenses' ? '#FFFFFF' : '#7A7A7A' }}
              className="flex flex-col items-center gap-1 py-1 px-4 transition-colors focus:outline-none"
            >
              <TabExpensesIcon />
              <span className="text-[11px] font-medium">Gastos</span>
            </button>
          </div>
        </nav>
      </div>

      {/* ==================================================================== */}
      {/* MODAIS DE CADASTRO E SALÁRIO (BOTÕES PÍLULA EM AZUL CEREJA)          */}
      {/* ==================================================================== */}
      {activeModal === 'confirm_salary' && (
        <ModalOverlay onClose={() => setActiveModal(null)}>
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#EEF2FF] mx-auto flex items-center justify-center text-[#1E1B4B] font-bold text-lg">
              R$
            </div>
            <h3 className="text-lg font-semibold text-[#1A1A1A]">
              Deseja alterar o seu salário atual?
            </h3>
            <p className="text-sm text-neutral-500">
              Salário base atual: <strong>{formatBRL(baseSalary, true)}</strong>
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 px-4 rounded-full bg-[#F0F0F2] text-[#1A1A1A] text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSalaryStep}
                style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                className="flex-1 py-2.5 px-4 rounded-full text-sm font-semibold"
              >
                Sim, alterar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {activeModal === 'edit_salary' && (
        <ModalOverlay onClose={() => setActiveModal(null)}>
          <form onSubmit={handleSaveNewSalary} className="space-y-4">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">
              Novo Salário Base
            </h3>
            <p className="text-xs text-neutral-500">
              Digite o novo valor do seu salário base. O saldo atual disponível será recalculado imediatamente.
            </p>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Valor do Salário Base (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder="Ex: 5500.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-base font-semibold focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 rounded-full bg-[#F0F0F2] text-sm font-semibold text-[#1A1A1A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold"
              >
                Salvar Salário
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {activeModal === 'new_debt' && (
        <ModalOverlay onClose={() => setActiveModal(null)}>
          <form onSubmit={handleCreateDebt} className="space-y-4">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">
              Cadastrar Nova Dívida
            </h3>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Descrição da Conta / Dívida
              </label>
              <input
                type="text"
                required
                value={debtDesc}
                onChange={(e) => setDebtDesc(e.target.value)}
                placeholder="Ex: Conta de Luz, Internet..."
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  placeholder="120.00"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Vencimento
                </label>
                <input
                  type="date"
                  required
                  value={debtDueDate}
                  onChange={(e) => setDebtDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                Escolha o Ícone
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { id: 'wifi', label: 'Wi-Fi' },
                    { id: 'home', label: 'Casa' },
                    { id: 'card', label: 'Cartão' },
                    { id: 'other', label: 'Outros' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDebtIcon(item.id)}
                    style={
                      debtIcon === item.id
                        ? { backgroundColor: '#1E1B4B', color: '#FFFFFF', borderColor: '#1E1B4B' }
                        : {}
                    }
                    className={`py-2 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 ${
                      debtIcon === item.id
                        ? ''
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                TAG Personalizada
              </label>
              <input
                type="text"
                required
                value={debtTag}
                onChange={(e) => setDebtTag(e.target.value)}
                placeholder="Ex: Casa, Moradia, Cartão..."
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>

            {/* Opção de Dívida Parcelada / Com Tempo de Vida */}
            <div className="p-3 rounded-xl bg-[#F8F9FA] border border-neutral-200 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isInstallmentDebt}
                  onChange={(e) => setIsInstallmentDebt(e.target.checked)}
                  className="w-4 h-4 accent-[#1E1B4B] rounded cursor-pointer"
                />
                <span className="text-xs font-semibold text-[#1A1A1A]">
                  É uma dívida parcelada / com tempo de vida?
                </span>
              </label>

              {isInstallmentDebt ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Parcela Atual
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="360"
                      required={isInstallmentDebt}
                      value={debtCurrentInstallment}
                      onChange={(e) => setDebtCurrentInstallment(e.target.value)}
                      placeholder="Ex: 3"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 bg-white text-sm focus:outline-none focus:border-[#1E1B4B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Total de Parcelas
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="360"
                      required={isInstallmentDebt}
                      value={debtTotalInstallments}
                      onChange={(e) => setDebtTotalInstallments(e.target.value)}
                      placeholder="Ex: 10"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 bg-white text-sm focus:outline-none focus:border-[#1E1B4B]"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500">
                  Conta fixa contínua ou parcela única (sem limite de parcelas).
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 rounded-full bg-[#F0F0F2] text-sm font-semibold text-[#1A1A1A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold"
              >
                Salvar Dívida
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {activeModal === 'new_expense_or_income' && (
        <ModalOverlay onClose={() => setActiveModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 p-1 rounded-full bg-[#F0F0F2]">
              <button
                type="button"
                onClick={() => setEntryMode('expense')}
                style={
                  entryMode === 'expense'
                    ? { backgroundColor: '#1E1B4B', color: '#FFFFFF' }
                    : {}
                }
                className={`py-2 rounded-full text-xs font-semibold transition-all ${
                  entryMode === 'expense' ? 'shadow-sm' : 'text-neutral-600'
                }`}
              >
                Novo Gasto
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('income')}
                style={
                  entryMode === 'income'
                    ? { backgroundColor: '#1E1B4B', color: '#FFFFFF' }
                    : {}
                }
                className={`py-2 rounded-full text-xs font-semibold transition-all ${
                  entryMode === 'income' ? 'shadow-sm' : 'text-neutral-600'
                }`}
              >
                Nova Entrada Extra
              </button>
            </div>

            {entryMode === 'expense' ? (
              <form onSubmit={handleCreateExpense} className="space-y-4">
                <h3 className="text-base font-semibold text-[#1A1A1A]">
                  Lançar Gasto Avulso
                </h3>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Descrição
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    placeholder="Ex: Supermercado, Uber, Almoço..."
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="Ex: 45.90"
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1.5">
                    Escolha o Ícone / Categoria
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'cart', label: 'Carrinho', defaultTag: 'Supermercado' },
                        { id: 'moto', label: 'Moto', defaultTag: 'Moto' },
                        { id: 'food', label: 'Alimentação', defaultTag: 'Alimentação' },
                        { id: 'other', label: 'Outros', defaultTag: 'Outros' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setExpenseIcon(item.id);
                          if (
                            ['Supermercado', 'Carro', 'Moto', 'Alimentação', 'Outros'].includes(
                              expenseTag
                            )
                          ) {
                            setExpenseTag(item.defaultTag);
                          }
                        }}
                        style={
                          expenseIcon === item.id
                            ? { backgroundColor: '#1E1B4B', color: '#FFFFFF', borderColor: '#1E1B4B' }
                            : {}
                        }
                        className={`py-2 px-1.5 rounded-xl border text-xs font-medium ${
                          expenseIcon === item.id
                            ? ''
                            : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    TAG Personalizada
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseTag}
                    onChange={(e) => setExpenseTag(e.target.value)}
                    placeholder="Ex: Supermercado, Moto, Gasolina, Lazer..."
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Supermercado', 'Moto', 'Gasolina', 'Alimentação', 'Lazer'].map(
                      (sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setExpenseTag(sug)}
                          className="px-2.5 py-0.5 rounded-full bg-[#F0F0F2] hover:bg-neutral-200 text-[11px] font-medium text-neutral-700 transition-colors cursor-pointer"
                        >
                          #{sug}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="flex-1 py-2.5 rounded-full bg-[#F0F0F2] text-sm font-semibold text-[#1A1A1A]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                    className="flex-1 py-2.5 rounded-full text-sm font-semibold"
                  >
                    Salvar Gasto
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateExtraIncome} className="space-y-4">
                <h3 className="text-base font-semibold text-[#1A1A1A]">
                  Nova Entrada Extra
                </h3>
                <p className="text-xs text-neutral-500">
                  Soma ao total disponível sem apagar o seu salário base.
                </p>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Descrição
                  </label>
                  <input
                    type="text"
                    required
                    value={incomeDesc}
                    onChange={(e) => setIncomeDesc(e.target.value)}
                    placeholder="Ex: Projeto Freelance, Reembolso..."
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                    placeholder="Ex: 350.00"
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    TAG Personalizada
                  </label>
                  <input
                    type="text"
                    required
                    value={incomeTag}
                    onChange={(e) => setIncomeTag(e.target.value)}
                    placeholder="Ex: Extra, Freelance, Pix..."
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#1E1B4B]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="flex-1 py-2.5 rounded-full bg-[#F0F0F2] text-sm font-semibold text-[#1A1A1A]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
                    className="flex-1 py-2.5 rounded-full text-sm font-semibold"
                  >
                    Somar Entrada
                  </button>
                </div>
              </form>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function DebtCardRow({
  debt,
  showValues,
  onPay,
  onUndoPay,
  onDelete,
}: {
  debt: TransactionRecord;
  showValues: boolean;
  onPay: () => void;
  onUndoPay: () => void;
  onDelete: () => void;
}) {
  const statusInfo = calculateDueStatus(debt.due_date, debt.paid);
  const instInfo = calculateInstallmentInfo(
    debt.due_date,
    debt.paid,
    debt.current_installment,
    debt.total_installments
  );

  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-neutral-100 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <DebtCircleIcon icon={debt.icon} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p
                style={{ fontSize: '15px', fontWeight: 600 }}
                className="text-[#1A1A1A] truncate leading-snug"
              >
                {debt.title}
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F0F0F2] text-neutral-600 font-medium">
                #{debt.tag}
              </span>
            </div>
            <p
              style={{ fontSize: '14px', fontWeight: 400 }}
              className="text-neutral-500 leading-snug mt-0.5"
            >
              {formatBRL(debt.amount, showValues)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            style={{
              backgroundColor: statusInfo.bgColor,
              color: statusInfo.textColor,
              borderColor: statusInfo.borderColor,
            }}
            className="px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
          >
            {statusInfo.label}
          </span>

          {!debt.paid ? (
            <button
              type="button"
              onClick={onPay}
              style={{ backgroundColor: '#1E1B4B', color: '#FFFFFF' }}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
            >
              Pagar
            </button>
          ) : (
            <button
              type="button"
              onClick={onUndoPay}
              title="Reverter pagamento desta dívida"
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[#1E1B4B] border border-[#1E1B4B]/25 hover:bg-[#EEF2FF] active:scale-95 transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <UndoArrowIcon />
              <span>Desfazer</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            title="Excluir dívida"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Exibição Visual de Parcelas / Tempo de Vida (quando total_installments > 1) */}
      {instInfo.isInstallment && (
        <div className="pt-2 border-t border-neutral-100 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#1E1B4B] font-semibold">
                Parcela {instInfo.current} de {instInfo.total}
              </span>

              {instInfo.isLastInstallmentPaid ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                  Última parcela paga / Dívida quitada 🎉
                </span>
              ) : (
                <span className="text-neutral-600 font-medium">
                  •{' '}
                  {instInfo.remaining === 1
                    ? 'Falta 1 parcela'
                    : `Faltam ${instInfo.remaining} parcelas`}
                </span>
              )}
            </div>

            <span className="text-neutral-500 font-medium">
              Acaba em <strong className="text-[#1A1A1A]">{instInfo.endMonthYear}</strong>
            </span>
          </div>

          {/* Barra de progresso fina em Azul Cereja */}
          <div className="w-full h-1.5 rounded-full bg-neutral-200 overflow-hidden">
            <div
              style={{
                width: `${instInfo.progressPct}%`,
                background: 'linear-gradient(90deg, #1E1B4B 0%, #2A1B4E 100%)',
              }}
              className="h-full rounded-full transition-all duration-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseCompactCard({
  expense,
  showValues,
  onDelete,
}: {
  expense: TransactionRecord;
  showValues: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-neutral-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-full bg-[#F0F0F2] flex items-center justify-center text-neutral-500 shrink-0">
          <ExpenseGrayIcon icon={expense.icon} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#1A1A1A] truncate">
            {expense.title}
          </p>
          <p className="text-[11px] font-medium text-neutral-500 truncate">
            #{expense.tag}
          </p>
          <p className="text-sm font-semibold text-[#1A1A1A] truncate mt-0.5">
            {formatBRL(expense.amount, showValues)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        title="Excluir gasto"
        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function UndoArrowIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function DebtCircleIcon({ icon }: { icon: TransactionIconType }) {
  if (icon === 'wifi') {
    return (
      <div
        style={{ backgroundColor: '#F3E8FF', color: '#7C3AED' }}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
    );
  }

  if (icon === 'home') {
    return (
      <div
        style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      </div>
    );
  }

  if (icon === 'card') {
    return (
      <div
        style={{ backgroundColor: '#FFEDD5', color: '#EA580C' }}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: '#EEF2FF', color: '#1E1B4B' }}
      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

function ExpenseGrayIcon({ icon }: { icon: TransactionIconType }) {
  if (icon === 'cart') {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    );
  }

  if (icon === 'moto' || icon === 'car') {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6h2l1.5 11.5" />
        <path d="M5.5 17.5L8.5 11h5.5l2 3.5H9" />
        <path d="M8.5 11L7 8h3" />
      </svg>
    );
  }

  if (icon === 'food') {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      </svg>
    );
  }

  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function FuelPumpIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="22" x2="15" y2="22" />
      <line x1="4" y1="9" x2="14" y2="9" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function QuickPayBillIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6v12" />
      <path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5-3-1.12-3-2.5" />
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
      <polyline points="20 4 20 8.5 15.5 8.5" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
      <polyline points="4 20 4 15.5 8.5 15.5" />
    </svg>
  );
}

function QuickPlusIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function QuickReportsIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function QuickTargetIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function QuickHistoryIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function TabHomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function TabDebtsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function TabExpensesIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 12h2" />
      <line x1="2" y1="9" x2="22" y2="9" />
    </svg>
  );
}
