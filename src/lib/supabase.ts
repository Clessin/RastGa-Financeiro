import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { IncomeRecord, TransactionRecord } from '@/types/finance';
import { getCurrentMonthYear } from '@/data/initialData';

const DEFAULT_SUPABASE_URL = 'https://yjprrjczrhulkkdqsrrb.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_cN20WkbMnqUuWdXdZY3vIw_0C7wwV8X';

// Credenciais via variáveis de ambiente Next.js (NEXT_PUBLIC_*) com fallback seguro da chave publishable
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

  return {
    url: nextUrl || DEFAULT_SUPABASE_URL,
    key: nextKey || DEFAULT_SUPABASE_KEY,
  };
}

const { url: supabaseUrl, key: supabaseKey } = resolveSupabaseCredentials();

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseKey) && supabaseUrl.startsWith('http');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export function normalizeLoginIdentifier(rawInput: string): string {
  const trimmed = String(rawInput || '').trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
  }
  const cleanUser = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  if (cleanUser.length < 2) return '';
  return `${cleanUser}@rastga.app`;
}

export function translateAuthError(rawMessage?: string): string {
  const msg = String(rawMessage || '').toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return 'Usuário/e-mail ou senha incorretos. Verifique seus dados e tente novamente.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Este usuário ou e-mail já está cadastrado. Alterne para "Entrar" para acessar sua conta.';
  }
  if (msg.includes('password should be at least') || msg.includes('weak password')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (
    msg.includes('unable to validate email') ||
    msg.includes('invalid email') ||
    msg.includes('email address')
  ) {
    return 'Informe um usuário (mín. 2 caracteres) ou um e-mail válido.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Conta ainda não confirmada. Tente entrar novamente em instantes.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
  }
  return rawMessage || 'Não foi possível concluir a autenticação. Tente novamente.';
}

export async function getActiveSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function signInWithEmailPassword(
  identifier: string,
  password: string
): Promise<{ session: Session | null; error?: string }> {
  if (!supabase) {
    return { session: null, error: 'Cliente Supabase não configurado.' };
  }
  const normalizedEmail = normalizeLoginIdentifier(identifier);
  if (!normalizedEmail) {
    return { session: null, error: 'Informe um usuário (mín. 2 caracteres) ou um e-mail válido.' };
  }
  if (!password) {
    return { session: null, error: 'Digite sua senha para continuar.' };
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error || !data.session) {
      return { session: null, error: translateAuthError(error?.message) };
    }
    return { session: data.session };
  } catch {
    return { session: null, error: 'Erro de conexão ao tentar entrar.' };
  }
}

export async function signUpWithEmailPassword(
  identifier: string,
  password: string
): Promise<{ session: Session | null; error?: string }> {
  if (!supabase) {
    return { session: null, error: 'Cliente Supabase não configurado.' };
  }
  const normalizedEmail = normalizeLoginIdentifier(identifier);
  if (!normalizedEmail) {
    return { session: null, error: 'Informe um usuário (mín. 2 caracteres) ou um e-mail válido.' };
  }
  if (!password || password.length < 6) {
    return { session: null, error: 'A senha deve ter pelo menos 6 caracteres.' };
  }
  try {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });
    if (error) {
      return { session: null, error: translateAuthError(error.message) };
    }
    if (data.session) {
      return { session: data.session };
    }
    // Caso a confirmação automática no banco tenha validado a conta, inicia a sessão imediatamente
    const signInRes = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (signInRes.error || !signInRes.data.session) {
      return {
        session: null,
        error: translateAuthError(
          signInRes.error?.message || 'Conta criada! Clique em Entrar para acessar.'
        ),
      };
    }
    return { session: signInRes.data.session };
  } catch {
    return { session: null, error: 'Erro de conexão ao tentar criar a conta.' };
  }
}

export async function signOutUser(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {}
}

// Leitura do Supabase filtrada pelo month_year selecionado (respeita RLS auth.uid() = user_id)
export async function fetchAllFinanceData(
  monthYear: string = getCurrentMonthYear()
): Promise<{
  incomes: IncomeRecord[];
  transactions: TransactionRecord[];
  usingSupabase: boolean;
}> {
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
          total_debt_amount:
            row.total_debt_amount != null ? Number(row.total_debt_amount) : null,
          already_paid_amount: Number(row.already_paid_amount || 0),
        })) as TransactionRecord[];

        return { incomes, transactions, usingSupabase: true };
      }
    } catch (err) {
      console.warn('Erro ao buscar dados no Supabase:', err);
    }
  }

  return {
    incomes: [],
    transactions: [],
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
          return existingBase
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
          return [
            { ...data, amount: Number(data.amount) },
            ...currentIncomes.filter((i) => !i.is_base_salary),
          ];
        }
      }
    } catch {}
  }

  if (existingBase) {
    return currentIncomes.map((i) =>
      i.is_base_salary ? { ...i, amount: newAmount } : i
    );
  }
  return [
    {
      id: `inc-base-salary-${monthYear}`,
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
        return [...currentIncomes, { ...data, amount: Number(data.amount) }];
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
  return [...currentIncomes, newRecord];
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
  return currentIncomes.filter((i) => i.id !== id);
}

export async function addTransactionDB(
  payload: Omit<TransactionRecord, 'id' | 'created_at' | 'month_year'>,
  currentTransactions: TransactionRecord[],
  targetMonthYear: string = getCurrentMonthYear(),
  viewedMonthYear: string = targetMonthYear
): Promise<TransactionRecord[]> {
  const normalizedPayload = {
    ...payload,
    total_installments: Math.max(1, Number(payload.total_installments || 1)),
    current_installment: Math.max(1, Number(payload.current_installment || 1)),
    total_debt_amount:
      payload.total_debt_amount != null && Number(payload.total_debt_amount) > 0
        ? Number(payload.total_debt_amount)
        : null,
    already_paid_amount: Number(payload.already_paid_amount || 0),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          ...normalizedPayload,
          month_year: targetMonthYear,
        })
        .select()
        .single();
      if (!error && data) {
        const createdTx: TransactionRecord = {
          ...data,
          amount: Number(data.amount),
          total_installments: Math.max(1, Number(data.total_installments || 1)),
          current_installment: Math.max(1, Number(data.current_installment || 1)),
          total_debt_amount:
            data.total_debt_amount != null ? Number(data.total_debt_amount) : null,
          already_paid_amount: Number(data.already_paid_amount || 0),
        };
        if (targetMonthYear !== viewedMonthYear) {
          return currentTransactions;
        }
        return [createdTx, ...currentTransactions];
      }
    } catch {}
  }

  if (targetMonthYear !== viewedMonthYear) {
    return currentTransactions;
  }

  const newTx: TransactionRecord = {
    ...normalizedPayload,
    id: `tx-${Date.now()}`,
    month_year: targetMonthYear,
    created_at: new Date().toISOString(),
  };
  return [newTx, ...currentTransactions];
}

export async function markDebtPaidDB(
  id: string,
  currentTransactions: TransactionRecord[]
): Promise<TransactionRecord[]> {
  const targetTx = currentTransactions.find((t) => t.id === id);
  if (!targetTx) return currentTransactions;

  const hasBalanceMode = Number(targetTx.total_debt_amount || 0) > 0;
  const newAlreadyPaid = hasBalanceMode
    ? Math.min(
        Number(targetTx.total_debt_amount),
        Number((Number(targetTx.already_paid_amount || 0) + Number(targetTx.amount)).toFixed(2))
      )
    : Number(targetTx.already_paid_amount || 0);

  const updateFields: Record<string, unknown> = { paid: true };
  if (hasBalanceMode) {
    updateFields.already_paid_amount = newAlreadyPaid;
  }

  if (supabase) {
    try {
      await supabase.from('transactions').update(updateFields).eq('id', id);
    } catch {}
  }

  return currentTransactions.map((t) =>
    t.id === id
      ? {
          ...t,
          paid: true,
          ...(hasBalanceMode ? { already_paid_amount: newAlreadyPaid } : {}),
        }
      : t
  );
}

export async function markDebtUnpaidDB(
  id: string,
  currentTransactions: TransactionRecord[]
): Promise<TransactionRecord[]> {
  const targetTx = currentTransactions.find((t) => t.id === id);
  if (!targetTx) return currentTransactions;

  const hasBalanceMode = Number(targetTx.total_debt_amount || 0) > 0;
  const newAlreadyPaid = hasBalanceMode
    ? Math.max(
        0,
        Number((Number(targetTx.already_paid_amount || 0) - Number(targetTx.amount)).toFixed(2))
      )
    : Number(targetTx.already_paid_amount || 0);

  const updateFields: Record<string, unknown> = { paid: false };
  if (hasBalanceMode) {
    updateFields.already_paid_amount = newAlreadyPaid;
  }

  if (supabase) {
    try {
      await supabase.from('transactions').update(updateFields).eq('id', id);
    } catch {}
  }

  return currentTransactions.map((t) =>
    t.id === id
      ? {
          ...t,
          paid: false,
          ...(hasBalanceMode ? { already_paid_amount: newAlreadyPaid } : {}),
        }
      : t
  );
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

  return currentTransactions.filter((t) => t.id !== id);
}
