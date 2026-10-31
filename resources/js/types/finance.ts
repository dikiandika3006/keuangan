export type AccountType = 'bank' | 'cash' | 'ewallet' | 'investment' | 'pocket';
export type TxType = 'income' | 'expense' | 'transfer';

export interface Account {
    id: number;
    name: string;
    type: AccountType;
    initial_balance: number;
    balance: number;
    color: string;
    is_emergency_fund: boolean;
    is_archived: boolean;
    last_reconciled_at: string | null;
    last_reconciled_balance: number | null;
    allocation?: { amount: number; account_id: number | null; due_day: number | null } | null;
}

export interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense' | 'titipan';
    color: string;
    icon?: string | null;
    system_key?: string | null;
}

export interface Transaction {
    id: number;
    type: TxType;
    /** null untuk titipan (dicatat tanpa rekening) */
    account_id: number | null;
    to_account_id: number | null;
    category_id: number | null;
    amount: number;
    date: string;
    note: string | null;
    source?: 'manual' | 'reconcile' | 'import';
    split_group?: string | null;
    tags?: { id: number; name: string; color: string }[];
    attachment_url?: string | null;
    attachment_name?: string | null;
    account?: { id: number; name: string; color?: string };
    to_account?: { id: number; name: string } | null;
    category?: { id: number; name: string; color: string; icon?: string | null; system_key?: string | null } | null;
}

export interface Goal {
    id: number;
    name: string;
    target_amount: number;
    current_amount: number;
    account_id: number | null;
    asset_id: number | null;
    /** Dana terkumpul mengikuti saldo rekening/dompet atau nilai aset ini */
    linked: { type: 'account' | 'asset'; name: string } | null;
    target_date: string | null;
    priority: 1 | 2 | 3;
    color: string;
}

export type DebtKind = 'car' | 'house' | 'credit_card' | 'paylater' | 'personal' | 'other';
export type InstallmentStatus = 'paid' | 'late' | 'pending';

export interface DebtInstallment {
    id: number;
    period: string;
    due_date: string;
    amount: number;
    paid_at: string | null;
    status: InstallmentStatus;
}

export interface Debt {
    id: number;
    name: string;
    lender: string | null;
    kind: DebtKind;
    total_amount: number;
    remaining_amount: number;
    monthly_payment: number;
    interest_rate: number;
    /** Perkiraan porsi bunga sekali bayar; null bila bunga 0% */
    interest_estimate?: number | null;
    due_day: number | null;
    start_month: string | null;
    tenor_months: number | null;
    installments?: DebtInstallment[];
}

export type ScheduleStatus = 'received' | 'partial' | 'late' | 'pending';

export interface ReceivableSchedule {
    id: number;
    period: string;
    due_date: string;
    interest_due: number;
    principal_due: number;
    interest_received: number;
    principal_received: number;
    status: ScheduleStatus;
}

export interface Receivable {
    id: number;
    counterparty: string;
    principal: number;
    interest_pct: number;
    withdrawal: number;
    withdrawal_change_month: string | null;
    withdrawal_after: number | null;
    due_day: number;
    start_month: string;
    agreement_url: string | null;
    note: string | null;
    remaining: number;
    schedules: ReceivableSchedule[];
    /** Uang masuk terbaru: bunga atau tarikan pokok */
    history: { id: number; date: string; amount: number; kind: 'interest' | 'principal'; account: string | null }[];
}

export type AssetKind = 'investment' | 'jht' | 'business' | 'property' | 'other';

export interface Asset {
    id: number;
    name: string;
    kind: AssetKind;
    target_value: number | null;
    color: string;
    note: string | null;
    value: number;
    valuations: { id: number; date: string; value: number; note: string | null }[];
}

export type Assumptions = {
    salary: number;
    last_salary_month: string | null;
    rehire_month: string | null;
    new_salary: number;
    plastic_income: number;
    djitu_income: number;
    friend_principal: number;
    friend_interest_pct: number;
    friend_withdraw_during_car: number;
    friend_withdraw_after_car: number;
    jht_amount: number;
    jht_month: string | null;
    car_installment: number;
    car_last_month: string | null;
    house_installment: number;
    house_last_month: string | null;
    school_fee: number;
    school_start_month: string | null;
    groceries: number;
    pelagic_deposit: number;
    other_expense: number;
    emergency_target: number;
};

export interface Scenario {
    id: number;
    name: string;
    is_active: boolean;
    start_month: string;
    months: number;
    assumptions: Assumptions;
}

export interface ProjectionRow {
    month: string;
    label: string;
    is_past: boolean;
    is_current: boolean;
    principal_start: number;
    salary: number;
    plastic: number;
    interest: number;
    withdraw: number;
    jht: number;
    djitu: number;
    car: number;
    house: number;
    debt: number;
    school: number;
    groceries: number;
    pelagic: number;
    other: number;
    income: number;
    expense: number;
    net: number;
    actual_income: number | null;
    actual_expense: number | null;
    recurring_in: number;
    recurring_out: number;
    pocket: number;
    balance: number;
}

export interface ProjectionSummary {
    liquid_now: number;
    net_with_salary: number | null;
    net_without_salary: number | null;
    min_balance: number;
    min_month: string | null;
    end_balance: number;
    monthly_burn: number;
    runway_months: number | null;
    car_paid_off: string | null;
    principal_after_car: number;
    emergency_target: number;
}

export interface EmploymentStatus {
    id: number;
    status: 'employed' | 'unemployed';
    since: string;
    employer: string | null;
    salary: number | null;
}

export interface AgendaItem {
    kind: 'debt' | 'bill' | 'receivable';
    id: number;
    title: string;
    amount: number;
    due_date: string;
    status: InstallmentStatus | ScheduleStatus;
    url: string;
}

export interface Alert {
    level: 'bad' | 'warning';
    message: string;
    url: string;
}

export interface RecurringItem {
    id: number;
    name: string;
    type: 'income' | 'expense';
    amount: number;
    start_date: string | null;
    end_date: string | null;
    category_id?: number | null;
    due_day?: number | null;
    end_confirmed_at?: string | null;
    updated_at?: string;
}

export interface Position {
    total_assets: number;
    liquid: number;
    spendable: number;
    pockets: number;
    held: number;
    receivables: number;
    other_assets: number;
    invested: number;
    investment: number;
    emergency_fund: number;
    emergency_fund_flagged: boolean;
    total_debt: number;
    monthly_debt_payment: number;
    net_worth: number;
}

export interface Averages {
    income: number;
    expense: number;
    months_of_data: number;
}

export interface MonthPoint {
    month: string;
    label: string;
    income: number;
    expense: number;
    net: number;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    prev_page_url?: string | null;
    next_page_url?: string | null;
    links: { url: string | null; label: string; active: boolean }[];
}
