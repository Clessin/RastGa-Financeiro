import { IncomeRecord, TransactionRecord, TagGoal } from '@/types/finance';

export function getCurrentMonthYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getOffsetDateString(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ZERO DADOS AUTOMÁTICOS: Inicialização 100% limpa
export function getInitialIncomes(): IncomeRecord[] {
  return [];
}

export function getInitialTransactions(): TransactionRecord[] {
  return [];
}

export function getInitialGoals(): TagGoal[] {
  return [];
}

export function formatBRL(value: number, showValues = true): string {
  if (!showValues) {
    return 'R$ ••••';
  }
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface DueStatusInfo {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  daysLeft: number;
}

export function calculateDueStatus(dueDateStr: string | null, paid: boolean): DueStatusInfo {
  if (paid) {
    return {
      label: 'Pago ✓',
      bgColor: '#DCFCE7',
      textColor: '#15803D',
      borderColor: '#BBF7D0',
      daysLeft: 0,
    };
  }

  if (!dueDateStr) {
    return {
      label: 'Pendente',
      bgColor: '#FFEDD5',
      textColor: '#C2410C',
      borderColor: '#FED7AA',
      daysLeft: 0,
    };
  }

  const parts = dueDateStr.split('-').map(Number);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);

  const diffTime = dueMidnight.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: 'Atrasado',
      bgColor: '#FEE2E2',
      textColor: '#B91C1C',
      borderColor: '#FECACA',
      daysLeft: diffDays,
    };
  }

  if (diffDays === 0) {
    return {
      label: 'Vence hoje',
      bgColor: '#FEF9C3',
      textColor: '#A16207',
      borderColor: '#FDE68A',
      daysLeft: 0,
    };
  }

  if (diffDays === 1) {
    return {
      label: 'Vence amanhã',
      bgColor: '#FEF9C3',
      textColor: '#A16207',
      borderColor: '#FDE68A',
      daysLeft: 1,
    };
  }

  return {
    label: `Vence em ${diffDays} dias`,
    bgColor: '#FFEDD5',
    textColor: '#C2410C',
    borderColor: '#FED7AA',
    daysLeft: diffDays,
  };
}

const PT_MONTHS_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export interface InstallmentInfo {
  isInstallment: boolean;
  current: number;
  total: number;
  remaining: number;
  paidCount: number;
  progressPct: number;
  isLastInstallmentPaid: boolean;
  endMonthYear: string; // Ex: "Ago/2027"
}

export function calculateInstallmentInfo(
  dueDateStr: string | null,
  paid: boolean,
  currentInstallment?: number,
  totalInstallments?: number
): InstallmentInfo {
  const total = Math.max(1, Number(totalInstallments || 1));
  const current = Math.max(1, Math.min(total, Number(currentInstallment || 1)));
  const isInstallment = total > 1;

  // Regra: se paid = true -> total_installments - current_installment
  //        se paid = false -> total_installments - current_installment + 1
  const remaining = paid
    ? Math.max(0, total - current)
    : Math.max(0, total - current + 1);

  const paidCount = paid ? current : Math.max(0, current - 1);
  const progressPct = total > 0 ? Math.min(100, Math.round((paidCount / total) * 100)) : 0;
  const isLastInstallmentPaid = isInstallment && current >= total && paid;

  let baseYear: number;
  let baseMonthIndex: number;
  if (dueDateStr && dueDateStr.includes('-')) {
    const parts = dueDateStr.split('-').map(Number);
    baseYear = parts[0] || new Date().getFullYear();
    baseMonthIndex = (parts[1] || 1) - 1;
  } else {
    const now = new Date();
    baseYear = now.getFullYear();
    baseMonthIndex = now.getMonth();
  }

  const monthsToAdd = Math.max(0, total - current);
  const endDate = new Date(baseYear, baseMonthIndex + monthsToAdd, 1);
  const endMonthYear = `${PT_MONTHS_SHORT[endDate.getMonth()]}/${endDate.getFullYear()}`;

  return {
    isInstallment,
    current,
    total,
    remaining,
    paidCount,
    progressPct,
    isLastInstallmentPaid,
    endMonthYear,
  };
}

export function normalizeTextNoAccents(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isFuelTransaction(
  tx: TransactionRecord,
  targetMonthYear: string = getCurrentMonthYear()
): boolean {
  if (tx.month_year && tx.month_year !== targetMonthYear) {
    return false;
  }
  const tagNorm = normalizeTextNoAccents(tx.tag);
  const titleNorm = normalizeTextNoAccents(tx.title);

  return (
    tagNorm.includes('gasolina') ||
    tagNorm.includes('combustivel') ||
    titleNorm.includes('gasolina') ||
    titleNorm.includes('combustivel')
  );
}

export function formatTransactionDateBR(
  dueDateStr: string | null | undefined,
  createdAtStr: string | null | undefined
): string {
  if (dueDateStr && /^\d{4}-\d{2}-\d{2}/.test(dueDateStr)) {
    const [year, month, day] = dueDateStr.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  if (createdAtStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(createdAtStr)) {
      const [year, month, day] = createdAtStr.split('-');
      return `${day}/${month}/${year}`;
    }
    const parsed = new Date(createdAtStr);
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, '0');
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const y = parsed.getFullYear();
      return `${d}/${m}/${y}`;
    }
  }

  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function getTransactionSortTimestamp(
  dueDateStr: string | null | undefined,
  createdAtStr: string | null | undefined
): number {
  if (dueDateStr && /^\d{4}-\d{2}-\d{2}/.test(dueDateStr)) {
    const [year, month, day] = dueDateStr.slice(0, 10).split('-').map(Number);
    const dueTime = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0).getTime();
    if (!isNaN(dueTime)) return dueTime;
  }

  if (createdAtStr) {
    const createdTime = new Date(createdAtStr).getTime();
    if (!isNaN(createdTime)) return createdTime;
  }

  return 0;
}
