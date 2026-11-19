import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IncomeRecord, TransactionRecord } from '@/types/finance';
import { getCurrentMonthYear } from '@/data/initialData';

const DEFAULT_SUPABASE_URL = 'https://yjprrjczrhulkkdqsrrb.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_cN20WkbMnqUuWdXdZY3vIw_0C7wwV8X';

// Compatibilidade total com Next.js (process.env.NEXT_PUBLIC_*) e Vite (import.meta.env.VITE_*)
function resolveSupabaseCredentials(): { url: string; key: string } {
  const nextUrl =
    typeof process !== 'undefined' && process.env
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : undefined;
  const nextKey =
    typeof process !== 'undefined' && process.env
      ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : undefined;

  let viteUrl: string | undefined;
  let viteKey: string | undefined;
  try {
    const metaEnv = (import.meta as any)?.env;
    if (metaEnv) {
      viteUrl = metaEnv.VITE_SUPABASE_URL || metaEnv.NEXT_PUBLIC_SUPABASE_URL;
      viteKey =
        metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
        metaEnv.VITE_SUPABASE_ANON_KEY ||
        metaEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  } catch {}

  return {
    url: nextUrl || viteUrl || DEFAULT_SUPABASE_URL,
    key: nextKey || viteKey || DEFAULT_SUPABASE_KEY,
  };
}

const { url: supabaseUrl, key: supabaseKey } = resolveSupabaseCredentials();

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseKey) && supabaseUrl.startsWith('http');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const LOCAL_INCOMES_KEY = 'financas_pwa_incomes_v4_zero_seed';
const LOCAL_TRANSACTIONS_KEY = 'financas_pwa_transactions_v4_zero_seed';

function clearLegacyLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('financas_pwa_incomes_v1');
    localStorage.removeItem('financas_pwa_transactions_v1');
    localStorage.removeItem('financas_pwa_incomes_v2_clean');
    localStorage.removeItem('financas_pwa_transactions_v2_clean');
    localStorage.removeItem('financas_pwa_incomes_v3_sb');
    localStorage.removeItem('financas_pwa_transactions_v3_sb');
    localStorage.removeItem('financas_pwa_incomes_v3_supabase');
    localStorage.removeItem('financas_pwa_transactions_v3_supabase');
  } catch {}
}

function saveLocalIncomes(items: IncomeRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_INCOMES_KEY, JSON.stringify(items));
  } catch {}
}

function saveLocalTransactions(items: TransactionRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_TRANSACTIONS_KEY, JSON.stringify(items));
  } catch {}
}

function loadLocalIncomes(): IncomeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_INCOMES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function loadLocalTransactions(): TransactionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_TRANSACTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// Leitura inicial do Supabase (ZERO seed automático: inicia 100% limpo se não houver registros)
export async function fetchAllFinanceData(
  monthYear: string = getCurrentMonthYear()
): Promise<{
  incomes: IncomeRecord[];
  transactions: TransactionRecord[];
  usingSupabase: boolean;
}> {
  clearLegacyLocalStorage();

  if (supabase) {
    try {
      const [incRes, txRes] = await Promise.all([
        supabase
          .from('incomes')
          .select('*')
          .eq('month_year', monthYear)
          .order('created_at', { ascending: true }),
        supabase
          .from('transactions')
          .select('*')
          .eq('month_year', monthYear)
          .order('created_at', { ascending: false }),
      ]);

      if (!incRes.error && !txRes.error) {
        const incomes = (incRes.data || []).map((row: any) => ({
          ...row,
          amount: Number(row.amount),
        })) as IncomeRecord[];

        const transactions = (txRes.data || []).map((row: any) => ({
          ...row,
          amount: Number(row.amount),
          total_installments: Math.max(1, Number(row.total_installments || 1)),
          current_installment: Math.max(1, Number(row.current_installment || 1)),
        })) as TransactionRecord[];

        saveLocalIncomes(incomes);
        saveLocalTransactions(transactions);
        return { incomes, transactions, usingSupabase: true };
      }
    } catch (err) {
      console.warn('Fallback para estado local (Supabase indisponível):', err);
    }
  }

  return {
    incomes: loadLocalIncomes(),
    transactions: loadLocalTransactions(),
    usingSupabase: false,
  };
}

export async function updateBaseSalaryDB(
  newAmount: number,
  currentIncomes: IncomeRecord[],
  monthYear: string = getCurrentMonthYear()
): Promise<IncomeRecord[]> {
  const existingBase = currentIncomes.find((i) => i.is_base_salary);

  if (supabase) {
    try {
      const { data: existingRows } = await supabase
        .from('incomes')
        .select('id')
        .eq('is_base_salary', true)
        .eq('month_year', monthYear)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        const targetId = existingRows[0].id;
        const { error } = await supabase
          .from('incomes')
          .update({ amount: newAmount, title: 'Salário Base', tag: 'Salário' })
          .eq('id', targetId);
        if (!error) {
          const updated = existingBase
            ? currentIncomes.map((i) =>
                i.is_base_salary ? { ...i, id: targetId, amount: newAmount } : i
              )
            : [
                {
                  id: targetId,
                  title: 'Salário Base',
                  amount: newAmount,
                  tag: 'Salário',
                  is_base_salary: true,
                  month_year: monthYear,
                  created_at: new Date().toISOString(),
                },
                ...currentIncomes,
              ];
          saveLocalIncomes(updated);
          return updated;
        }
      } else {
        const { data, error } = await supabase
          .from('incomes')
          .insert({
            title: 'Salário Base',
            amount: newAmount,
            tag: 'Salário',
            is_base_salary: true,
            month_year: monthYear,
          })
          .select()
          .single();
        if (!error && data) {
          const updated = [
            { ...data, amount: Number(data.amount) },
            ...currentIncomes.filter((i) => !i.is_base_salary),
          ];
          saveLocalIncomes(updated);
          return updated;
        }
      }
    } catch {}
  }

  let updated: IncomeRecord[];
  if (existingBase) {
    updated = currentIncomes.map((i) =>
      i.is_base_salary ? { ...i, amount: newAmount } : i
    );
  } else {
    updated = [
      {
        id: 'inc-base-salary',
        title: 'Salário Base',
        amount: newAmount,
        tag: 'Salário',
        is_base_salary: true,
        month_year: monthYear,
        created_at: new Date().toISOString(),
      },
      ...currentIncomes,
    ];
  }
  saveLocalIncomes(updated);
  return updated;
}

export async function addExtraIncomeDB(
  payload: { title: string; amount: number; tag: string },
  currentIncomes: IncomeRecord[],
  monthYear: string = getCurrentMonthYear()
): Promise<IncomeRecord[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('incomes')
        .insert({
          title: payload.title,
          amount: payload.amount,
          tag: payload.tag,
          is_base_salary: false,
          month_year: monthYear,
        })
        .select()
        .single();
      if (!error && data) {
        const updated = [
          ...currentIncomes,
          { ...data, amount: Number(data.amount) },
        ];
        saveLocalIncomes(updated);
        return updated;
      }
    } catch {}
  }

  const newRecord: IncomeRecord = {
    id: `inc-${Date.now()}`,
    title: payload.title,
    amount: payload.amount,
    tag: payload.tag,
    is_base_salary: false,
    month_year: monthYear,
    created_at: new Date().toISOString(),
  };
  const updated = [...currentIncomes, newRecord];
  saveLocalIncomes(updated);
  return updated;
}

export async function deleteIncomeDB(
  id: string,
  currentIncomes: IncomeRecord[]
): Promise<IncomeRecord[]> {
  if (supabase) {
    try {
      await supabase.from('incomes').delete().eq('id', id);
    } catch {}
  }
  const updated = currentIncomes.filter((i) => i.id !== id);
  saveLocalIncomes(updated);
  return updated;
}

export async function addTransactionDB(
  payload: Omit<TransactionRecord, 'id' | 'created_at' | 'month_year'>,
  currentTransactions: TransactionRecord[],
  monthYear: string = getCurrentMonthYear()
): Promise<TransactionRecord[]> {
  const normalizedPayload = {
    ...payload,
    total_installments: Math.max(1, Number(payload.total_installments || 1)),
    current_installment: Math.max(1, Number(payload.current_installment || 1)),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          ...normalizedPayload,
          month_year: monthYear,
        })
        .select()
        .single();
      if (!error && data) {
        const updated = [
          {
            ...data,
            amount: Number(data.amount),
            total_installments: Math.max(1, Number(data.total_installments || 1)),
            current_installment: Math.max(1, Number(data.current_installment || 1)),
          },
          ...currentTransactions,
        ];
        saveLocalTransactions(updated);
        return updated;
      }
    } catch {}
  }

  const newTx: TransactionRecord = {
    ...normalizedPayload,
    id: `tx-${Date.now()}`,
    month_year: monthYear,
    created_at: new Date().toISOString(),
  };
  const updated = [newTx, ...currentTransactions];
  saveLocalTransactions(updated);
  return updated;
}

export async function markDebtPaidDB(
  id: string,
  currentTransactions: TransactionRecord[]
): Promise<TransactionRecord[]> {
  if (supabase) {
    try {
      await supabase.from('transactions').update({ paid: true }).eq('id', id);
    } catch {}
  }

  const updated = currentTransactions.map((t) =>
    t.id === id ? { ...t, paid: true } : t
  );
  saveLocalTransactions(updated);
  return updated;
}

export async function markDebtUnpaidDB(
  id: string,
  currentTransactions: TransactionRecord[]
): Promise<TransactionRecord[]> {
  if (supabase) {
    try {
      await supabase.from('transactions').update({ paid: false }).eq('id', id);
    } catch {}
  }

  const updated = currentTransactions.map((t) =>
    t.id === id ? { ...t, paid: false } : t
  );
  saveLocalTransactions(updated);
  return updated;
}

export async function deleteTransactionDB(
  id: string,
  currentTransactions: TransactionRecord[]
): Promise<TransactionRecord[]> {
  if (supabase) {
    try {
      await supabase.from('transactions').delete().eq('id', id);
    } catch {}
  }

  const updated = currentTransactions.filter((t) => t.id !== id);
  saveLocalTransactions(updated);
  return updated;
}
