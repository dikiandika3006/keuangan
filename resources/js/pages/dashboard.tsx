import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionRow } from '@/components/finance/transaction-row';
import { EmptyState, Page, PageHeader, ProgressBar, Section, StatCard, StatusBadge } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { ACCOUNT_TYPES, compact, daysFromToday, formatDate, monthLabel, monthsUntil, percent, rupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import {
    type Account,
    type AgendaItem,
    type Alert,
    type Averages,
    type Debt,
    type EmploymentStatus,
    type Goal,
    type MonthPoint,
    type Position,
    type ProjectionSummary,
    type Transaction,
} from '@/types/finance';
import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    CalendarClock,
    CheckCircle2,
    HelpCircle,
    Hourglass,
    Landmark,
    Plus,
    Receipt,
    ShieldCheck,
    Sparkles,
    TrendingDown,
    Wallet,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Kondisi Keuangan', href: '/dashboard' }];

interface HealthCheck {
    key: string;
    label: string;
    value: string;
    status: 'good' | 'warning' | 'bad' | 'unknown';
    hint: string;
}

interface Props {
    trace: {
        scenario: { id: number; name: string } | null;
        summary: ProjectionSummary | null;
        agenda: AgendaItem[];
        alerts: Alert[];
        employment: EmploymentStatus | null;
        debts: (Debt & { paid_count: number; unpaid_count: number; last_period: string | null })[];
        hasStarterData: boolean;
    };
    position: Position;
    averages: Averages;
    thisMonth: MonthPoint;
    series: MonthPoint[];
    health: { score: number | null; checks: HealthCheck[] };
    accounts: Account[];
    expenseByCategory: { name: string; color: string; total: number }[];
    budgets: { id: number; name: string; color: string; amount: number; spent: number }[];
    goals: Goal[];
    recentTransactions: Transaction[];
}

const statusIcon = {
    good: <CheckCircle2 className="size-5 text-emerald-500" />,
    warning: <AlertTriangle className="size-5 text-amber-500" />,
    bad: <XCircle className="size-5 text-red-500" />,
    unknown: <HelpCircle className="text-muted-foreground size-5" />,
};

function scoreLabel(score: number | null) {
    if (score === null) return { text: 'Belum cukup data', color: 'text-muted-foreground' };
    if (score >= 80) return { text: 'Sehat', color: 'text-emerald-600 dark:text-emerald-400' };
    if (score >= 50) return { text: 'Cukup, perlu perbaikan', color: 'text-amber-600 dark:text-amber-400' };
    return { text: 'Perlu perhatian', color: 'text-red-600 dark:text-red-400' };
}

const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

export default function Dashboard(props: Props) {
    const { trace, position, averages, thisMonth, series, health, accounts, expenseByCategory, budgets, goals, recentTransactions } = props;
    const summary = trace.summary;
    const [txOpen, setTxOpen] = useState(false);
    const net = thisMonth.income - thisMonth.expense;
    const label = scoreLabel(health.score);
    const totalExpense = expenseByCategory.reduce((s, c) => s + c.total, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kondisi Keuangan" />
            <Page>
                <PageHeader
                    title="Kondisi Keuangan"
                    description={`Ringkasan posisi keuanganmu per ${thisMonth.label}`}
                    actions={
                        <Button onClick={() => setTxOpen(true)} className="hidden md:inline-flex">
                            <Plus /> Catat Transaksi
                        </Button>
                    }
                />

                {accounts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5 p-4 text-sm">
                        <p className="font-medium">Selamat datang! 👋 Mulai dengan 3 langkah:</p>
                        <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1">
                            <li>
                                Tambahkan{' '}
                                <Link className="text-primary underline" href={route('accounts.index')}>
                                    rekening & saldo
                                </Link>{' '}
                                yang kamu punya sekarang.
                            </li>
                            <li>
                                Isi{' '}
                                <Link className="text-primary underline" href={route('plan.index')}>
                                    pemasukan & pengeluaran rutin
                                </Link>{' '}
                                untuk dasar proyeksi.
                            </li>
                            <li>
                                Buat{' '}
                                <Link className="text-primary underline" href={route('goals.index')}>
                                    target keuangan
                                </Link>{' '}
                                dan catat{' '}
                                <Link className="text-primary underline" href={route('debts.index')}>
                                    utang/cicilan
                                </Link>{' '}
                                jika ada.
                            </li>
                        </ol>
                    </div>
                )}

                {!trace.hasStarterData && (
                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-blue-500/50 bg-blue-500/5 p-4 text-sm sm:flex-row sm:items-center">
                        <div className="flex-1">
                            <p className="font-medium">Isi data awal dari rencana 21 Okt 2026?</p>
                            <p className="text-muted-foreground">
                                Cicilan mobil (14 bln) & rumah, investasi di teman 150 jt, Pelagic 34 jt, JHT 6 jt, dan 3 skenario proyeksi. Bisa
                                diubah setelahnya.
                            </p>
                        </div>
                        <Button onClick={() => router.post(route('setup.starter'), {}, { preserveScroll: true })}>
                            <Sparkles /> Isi data awal
                        </Button>
                    </div>
                )}

                {trace.alerts.length > 0 && (
                    <ul className="space-y-2">
                        {trace.alerts.map((a, i) => (
                            <li key={i}>
                                <Link
                                    href={a.url}
                                    className={cn(
                                        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition hover:opacity-80',
                                        a.level === 'bad'
                                            ? 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400'
                                            : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
                                    )}
                                >
                                    {a.level === 'bad' ? (
                                        <XCircle className="mt-0.5 size-4 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                    )}
                                    {a.message}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    <StatCard
                        label="Kekayaan Bersih"
                        value={rupiah(position.net_worth)}
                        sub={`Aset ${compact(position.total_assets)} − Utang ${compact(position.total_debt)}`}
                        icon={Landmark}
                        tone={position.net_worth < 0 ? 'negative' : 'default'}
                    />
                    <StatCard
                        label="Uang Siap Pakai"
                        value={rupiah(position.spendable)}
                        sub={
                            position.held > 0
                                ? `Tanpa titipan ${compact(position.held)} · Piutang ${compact(position.receivables)}`
                                : `Piutang ${compact(position.receivables)} · Aset ${compact(position.other_assets + position.investment)}`
                        }
                        icon={Wallet}
                    />
                    <StatCard
                        label="Dana Darurat"
                        value={rupiah(position.emergency_fund_flagged ? position.emergency_fund : 0)}
                        sub={
                            summary ? (
                                <span className="block">
                                    <ProgressBar
                                        className="mb-1"
                                        value={percent(position.emergency_fund_flagged ? position.emergency_fund : 0, summary.emergency_target)}
                                        color="#10b981"
                                    />
                                    {Math.round(percent(position.emergency_fund_flagged ? position.emergency_fund : 0, summary.emergency_target))}%
                                    dari {compact(summary.emergency_target)}
                                    {!position.emergency_fund_flagged && ' · tandai rekening dana darurat'}
                                </span>
                            ) : undefined
                        }
                        icon={ShieldCheck}
                    />
                    <StatCard
                        label="Runway Tanpa Gaji"
                        value={summary ? (summary.runway_months === null ? '∞' : `${summary.runway_months.toLocaleString('id-ID')} bln`) : '-'}
                        sub={
                            summary
                                ? summary.monthly_burn > 0
                                    ? `kas ${compact(summary.liquid_now)} ÷ defisit ${compact(summary.monthly_burn)}/bln`
                                    : 'tidak defisit walau tanpa gaji'
                                : 'Buka Proyeksi untuk membuat skenario'
                        }
                        icon={Hourglass}
                        tone={summary?.runway_months != null && summary.runway_months < 3 ? 'negative' : 'default'}
                    />
                    <StatCard
                        label="Pemasukan Bulan Ini"
                        value={rupiah(thisMonth.income)}
                        sub={`Rata-rata ${compact(averages.income)}/bln`}
                        icon={ArrowDownRight}
                        tone="positive"
                    />
                    <StatCard
                        label="Pengeluaran Bulan Ini"
                        value={rupiah(thisMonth.expense)}
                        sub={<span className={net < 0 ? 'text-red-500' : ''}>Sisa {rupiah(net)}</span>}
                        icon={ArrowUpRight}
                        tone="negative"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title="7 Hari ke Depan">
                        {trace.agenda.length === 0 ? (
                            <EmptyState
                                icon={CalendarClock}
                                title="Tidak ada tagihan atau penerimaan"
                                description="Cicilan & piutang berjadwal muncul di sini."
                            />
                        ) : (
                            <ul className="divide-y">
                                {trace.agenda.map((item) => {
                                    const days = daysFromToday(item.due_date);
                                    return (
                                        <li key={`${item.kind}-${item.id}`}>
                                            <Link href={item.url} className="flex items-center gap-3 py-2">
                                                <div
                                                    className={cn(
                                                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                                                        item.kind !== 'receivable' ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600',
                                                    )}
                                                >
                                                    {item.kind !== 'receivable' ? (
                                                        <ArrowUpRight className="size-4" />
                                                    ) : (
                                                        <ArrowDownRight className="size-4" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{item.title}</div>
                                                    <div className="text-muted-foreground text-xs">
                                                        {formatDate(item.due_date, { day: 'numeric', month: 'short' })} ·{' '}
                                                        {days < 0 ? `lewat ${-days} hari` : days === 0 ? 'hari ini' : `${days} hari lagi`}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-semibold tabular-nums">{compact(item.amount)}</div>
                                                    <StatusBadge status={item.status} />
                                                </div>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title="Progres Utang"
                        action={
                            <Link href={route('debts.index')} className="text-muted-foreground text-xs hover:underline">
                                Kelola
                            </Link>
                        }
                    >
                        {trace.debts.length === 0 ? (
                            <EmptyState icon={CheckCircle2} title="Tidak ada utang aktif" />
                        ) : (
                            <ul className="space-y-3">
                                {trace.debts.map((d) => {
                                    const total = d.paid_count + d.unpaid_count;
                                    const p = total ? percent(d.paid_count, total) : percent(d.total_amount - d.remaining_amount, d.total_amount);
                                    return (
                                        <li key={d.id}>
                                            <div className="mb-1 flex justify-between gap-2 text-sm">
                                                <span className="truncate font-medium">{d.name}</span>
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {Math.round(p)}%{total ? ` · ${d.unpaid_count} bln lagi` : ''}
                                                </span>
                                            </div>
                                            <ProgressBar value={p} color="#10b981" />
                                            <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                                                Sisa {compact(d.remaining_amount)}
                                                {d.last_period && ` · lunas ${monthLabel(d.last_period, 'long')}`}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title={`Proyeksi${trace.scenario ? ` · ${trace.scenario.name}` : ''}`}
                        action={
                            <Link href={route('projection.index')} className="text-muted-foreground text-xs hover:underline">
                                Buka
                            </Link>
                        }
                    >
                        {!summary ? (
                            <EmptyState
                                icon={TrendingDown}
                                title="Belum ada skenario"
                                action={<Link href={route('projection.index')}>Buat skenario</Link>}
                            />
                        ) : (
                            <dl className="divide-y text-sm">
                                {[
                                    [
                                        'Saldo kas terendah',
                                        <span className={cn(summary.min_balance < 0 && 'text-red-600')}>{rupiah(summary.min_balance)}</span>,
                                    ],
                                    ['Bulan saldo terendah', summary.min_month ?? '-'],
                                    ['Selisih/bln tanpa gaji', summary.net_without_salary === null ? '-' : rupiah(summary.net_without_salary)],
                                    ['Selisih/bln dengan gaji', summary.net_with_salary === null ? '-' : rupiah(summary.net_with_salary)],
                                    ['Mobil lunas', summary.car_paid_off ?? '-'],
                                    ['Saldo akhir proyeksi', rupiah(summary.end_balance)],
                                ].map(([label, value]) => (
                                    <div key={String(label)} className="flex justify-between gap-2 py-1.5">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="font-medium tabular-nums">{value}</dd>
                                    </div>
                                ))}
                                {trace.employment && (
                                    <div className="flex justify-between gap-2 py-1.5">
                                        <dt className="text-muted-foreground">Status kerja</dt>
                                        <dd className="font-medium">
                                            {trace.employment.status === 'employed' ? 'Bekerja' : 'Tidak bekerja'} sejak{' '}
                                            {formatDate(trace.employment.since)}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        )}
                    </Section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title="Kesehatan Keuangan" className="lg:col-span-1">
                        <div className="mb-4 flex items-center gap-4">
                            <div className="relative size-20 shrink-0">
                                <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
                                    <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3" />
                                    <circle
                                        cx="18"
                                        cy="18"
                                        r="15.9"
                                        fill="none"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeDasharray={`${health.score ?? 0} 100`}
                                        className={cn(
                                            (health.score ?? 0) >= 80
                                                ? 'stroke-emerald-500'
                                                : (health.score ?? 0) >= 50
                                                  ? 'stroke-amber-500'
                                                  : 'stroke-red-500',
                                        )}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{health.score ?? '–'}</div>
                            </div>
                            <div>
                                <div className={cn('font-semibold', label.color)}>{label.text}</div>
                                <p className="text-muted-foreground text-xs">
                                    Dihitung dari {averages.months_of_data || 0} bulan data terakhir dan saldo rekening.
                                </p>
                            </div>
                        </div>
                        <ul className="divide-y">
                            {health.checks.map((c) => (
                                <li key={c.key} className="flex gap-3 py-2.5">
                                    <div className="pt-0.5">{statusIcon[c.status]}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between gap-2 text-sm">
                                            <span className="font-medium">{c.label}</span>
                                            <span className="font-semibold tabular-nums">{c.value}</span>
                                        </div>
                                        <p className="text-muted-foreground text-xs">{c.hint}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section title="Arus Kas 12 Bulan" className="lg:col-span-2">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={series} margin={{ left: -10, right: 4, top: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                    <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="income" name="Pemasukan" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    <Bar dataKey="expense" name="Pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    <Line dataKey="net" name="Selisih" stroke="#3b82f6" strokeWidth={2} dot={false} type="monotone" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title="Pengeluaran Bulan Ini">
                        {expenseByCategory.length === 0 ? (
                            <EmptyState icon={Receipt} title="Belum ada pengeluaran" />
                        ) : (
                            <>
                                <div className="h-44">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={expenseByCategory}
                                                dataKey="total"
                                                nameKey="name"
                                                innerRadius={50}
                                                outerRadius={75}
                                                paddingAngle={2}
                                            >
                                                {expenseByCategory.map((c) => (
                                                    <Cell key={c.name} fill={c.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <ul className="mt-2 space-y-1.5 text-sm">
                                    {expenseByCategory.slice(0, 6).map((c) => (
                                        <li key={c.name} className="flex items-center gap-2">
                                            <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                            <span className="flex-1 truncate">{c.name}</span>
                                            <span className="text-muted-foreground text-xs">{Math.round(percent(c.total, totalExpense))}%</span>
                                            <span className="font-medium tabular-nums">{compact(c.total)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Section>

                    <Section
                        title="Anggaran Bulan Ini"
                        action={
                            <Link href={route('budgets.index')} className="text-muted-foreground text-xs hover:underline">
                                Atur
                            </Link>
                        }
                    >
                        {budgets.length === 0 ? (
                            <EmptyState icon={Receipt} title="Belum ada anggaran" description="Tetapkan batas pengeluaran per kategori." />
                        ) : (
                            <ul className="space-y-3">
                                {budgets.slice(0, 6).map((b) => {
                                    const p = percent(b.spent, b.amount);
                                    const over = b.spent > b.amount;
                                    return (
                                        <li key={b.id}>
                                            <div className="mb-1 flex justify-between text-sm">
                                                <span className="truncate">{b.name}</span>
                                                <span className={cn('tabular-nums', over && 'font-semibold text-red-600')}>
                                                    {compact(b.spent)} / {compact(b.amount)}
                                                </span>
                                            </div>
                                            <ProgressBar value={p} color={over ? '#ef4444' : p > 80 ? '#f59e0b' : '#10b981'} />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title="Target Keuangan"
                        action={
                            <Link href={route('goals.index')} className="text-muted-foreground text-xs hover:underline">
                                Lihat semua
                            </Link>
                        }
                    >
                        {goals.length === 0 ? (
                            <EmptyState icon={Receipt} title="Belum ada target" description="Misal: dana darurat, DP rumah, pensiun." />
                        ) : (
                            <ul className="space-y-3">
                                {goals.slice(0, 5).map((g) => {
                                    const left = monthsUntil(g.target_date);
                                    return (
                                        <li key={g.id}>
                                            <div className="mb-1 flex justify-between gap-2 text-sm">
                                                <span className="truncate font-medium">{g.name}</span>
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {Math.round(percent(g.current_amount, g.target_amount))}%{left !== null && ` · ${left} bln lagi`}
                                                </span>
                                            </div>
                                            <ProgressBar value={percent(g.current_amount, g.target_amount)} color={g.color} />
                                            <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                                                {compact(g.current_amount)} dari {compact(g.target_amount)}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title="Rekening"
                        action={
                            <Link href={route('accounts.index')} className="text-muted-foreground text-xs hover:underline">
                                Kelola
                            </Link>
                        }
                    >
                        {accounts.length === 0 ? (
                            <EmptyState icon={Wallet} title="Belum ada rekening" />
                        ) : (
                            <ul className="divide-y">
                                {accounts.map((a) => (
                                    <li key={a.id} className="flex items-center gap-3 py-2">
                                        <span className="size-3 rounded-full" style={{ backgroundColor: a.color }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{a.name}</div>
                                            <div className="text-muted-foreground text-xs">{ACCOUNT_TYPES[a.type]}</div>
                                        </div>
                                        <span className={cn('text-sm font-semibold tabular-nums', a.balance < 0 && 'text-red-600')}>
                                            {rupiah(a.balance)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title="Transaksi Terakhir"
                        className="lg:col-span-2"
                        action={
                            <Link href={route('transactions.index')} className="text-muted-foreground text-xs hover:underline">
                                Lihat semua
                            </Link>
                        }
                    >
                        {recentTransactions.length === 0 ? (
                            <EmptyState icon={Receipt} title="Belum ada transaksi" />
                        ) : (
                            <div className="divide-y">
                                {recentTransactions.map((tx) => (
                                    <TransactionRow key={tx.id} tx={tx} />
                                ))}
                            </div>
                        )}
                    </Section>
                </div>
            </Page>
            <TransactionForm open={txOpen} onOpenChange={setTxOpen} />
        </AppLayout>
    );
}
