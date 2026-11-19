export type DebtIconType = 'wifi' | 'home' | 'card' | 'other';
export type ExpenseIconType = 'cart' | 'moto' | 'car' | 'food' | 'other';
export type TransactionIconType = DebtIconType | ExpenseIconType;

export interface IncomeRecord {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  tag: string;
  is_base_salary: boolean;
  month_year: string;
  created_at: string;
}

export interface TransactionRecord {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  type: 'debt' | 'expense';
  tag: string;
  icon: TransactionIconType;
  due_date: string | null; // YYYY-MM-DD
  paid: boolean;
  total_installments: number; // padrão 1
  current_installment: number; // padrão 1
  total_debt_amount?: number | null; // Valor total original da dívida (ex: 2000.00)
  already_paid_amount?: number | null; // Quanto já foi pago até o momento (ex: 500.00)
  month_year: string;
  created_at: string;
}

export interface TagGoal {
  tag: string;
  limit: number;
}
