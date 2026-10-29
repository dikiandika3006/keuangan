import { MoneyInput } from '@/components/finance/money-input';
import { PercentInput } from '@/components/finance/percent-input';
import { DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { monthsToPayoff, payoffDate } from '@/lib/debt';
import { compact, formatDate, monthlyNeeded, PRIORITIES, rupiah } from '@/lib/format';
import { type Assumptions, describeMonth, project } from '@/lib/projection';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Averages, type Debt, type Goal, type Position, type RecurringItem } from '@/types/finance';
import { Head, useForm } from '@inertiajs/react';
import { CalendarClock, Flag, Pencil, Plus, Repeat, RotateCcw, ShieldCheck, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Rencana & Proyeksi', href: '/plan' }];
const STORAGE_KEY = 'keuangan.plan.assumptions';

interface Props {
    position: Position;
    averages: Averages;
    recurringTotals: { income: number; expense: number };
    recurringItems: RecurringItem[];
    goals: Goal[];
    debts: Debt[];
}

const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

export default function Plan({ position, averages, recurringTotals, recurringItems, goals, debts }: Props) {
    const useRecurring = recurringTotals.income > 0 || recurringTotals.expense > 0;
    const baseIncome = useRecurring ? recurringTotals.income : averages.income;
    const baseExpense = useRecurring ? recurringTotals.expense : averages.expense;

    const defaults: Assumptions & { expenseIncludesDebt: boolean } = {
        income: baseIncome,
        expense: baseExpense,
        incomeGrowth: 5,
        inflation: 4,
        investReturn: 7,
        investShare: 50,
        years: 10,
        // Rata-rata transaksi biasanya sudah memuat pembayaran cicilan
        expenseIncludesDebt: !useRecurring,
    };

    const [a, setA] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
            return saved ? { ...defaults, ...saved, income: baseIncome, expense: baseExpense } : defaults;
        } catch {
            return defaults;
        }
    });

    useEffect(() => {
        setA((prev: typeof a) => ({ ...prev, income: baseIncome, expense: baseExpense }));
    }, [baseIncome, baseExpense]);

    useEffect(() => {
        try {
            const { income, expense, ...rest } = a;
            void income;
            void expense;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
        } catch {
            /* abaikan */
        }
    }, [a]);

    const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA((prev: typeof a) => ({ ...prev, [k]: v }));

    const expenseExDebt = a.expenseIncludesDebt ? Math.max(0, a.expense - position.monthly_debt_payment) : a.expense;
    const result = useMemo(
        () => project({ cash: position.liquid, investment: position.investment }, debts, { ...a, expense: expenseExDebt }),
        [a, debts, position.liquid, position.investment, expenseExDebt],
    );
    const end = result.points[result.points.length - 1];
    const firstSurplus = result.points[1]?.surplus ?? 0;
    const chartData = result.points.filter((p) => p.month % (a.years > 3 ? 12 : a.years > 1 ? 3 : 1) === 0);

    // Kebutuhan target
    const activeGoals = goals.filter((g) => g.current_amount < g.target_amount);
    const goalNeeds = activeGoals.map((g) => ({ goal: g, need: monthlyNeeded(g) }));
    const totalGoalNeed = goalNeeds.reduce((s, g) => s + (g.need ?? 0), 0);

    // Item rutin
    const [itemOpen, setItemOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
    const itemForm = useForm({ name: '', type: 'expense' as 'income' | 'expense', amount: '' as number | '', start_date: '', end_date: '' });

    const openItem = (item: RecurringItem | null, type: 'income' | 'expense' = 'expense') => {
        setEditingItem(item);
        itemForm.clearErrors();
        itemForm.setData(
            item
                ? { name: item.name, type: item.type, amount: item.amount, start_date: item.start_date ?? '', end_date: item.end_date ?? '' }
                : { name: '', type, amount: '', start_date: '', end_date: '' },
        );
        setItemOpen(true);
    };

    const submitItem = () => {
        itemForm.transform((d) => ({ ...d, start_date: d.start_date || null, end_date: d.end_date || null }));
        const options = { preserveScroll: true, onSuccess: () => setItemOpen(false) };
        if (editingItem) itemForm.put(route('recurring.update', editingItem.id), options);
        else itemForm.post(route('recurring.store'), options);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Rencana & Proyeksi" />
            <Page>
                <PageHeader
                    title="Rencana & Proyeksi"
                    description="Simulasi kondisi keuanganmu ke depan berdasarkan kebiasaan sekarang dan asumsi yang bisa kamu ubah."
                />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title="Asumsi"
                        action={
                            <Button size="sm" variant="ghost" onClick={() => setA(defaults)}>
                                <RotateCcw className="size-4" /> Reset
                            </Button>
                        }
                    >
                        <div className="grid gap-4">
                            <Field label="Pemasukan per bulan">
                                <MoneyInput value={a.income} onChange={(v) => set('income', v || 0)} />
                            </Field>
                            <Field label="Pengeluaran per bulan">
                                <MoneyInput value={a.expense} onChange={(v) => set('expense', v || 0)} />
                            </Field>
                            <p className="text-muted-foreground -mt-2 text-xs">
                                {useRecurring
                                    ? 'Diambil dari daftar pemasukan/pengeluaran rutin di bawah.'
                                    : averages.months_of_data
                                      ? `Diambil dari rata-rata ${averages.months_of_data} bulan transaksi terakhir.`
                                      : 'Isi manual, atau tambahkan item rutin / transaksi agar terisi otomatis.'}
                            </p>
                            {position.monthly_debt_payment > 0 && (
                                <label className="flex items-start gap-2 text-sm">
                                    <Checkbox checked={a.expenseIncludesDebt} onCheckedChange={(c) => set('expenseIncludesDebt', c === true)} />
                                    <span>Pengeluaran di atas sudah termasuk cicilan ({compact(position.monthly_debt_payment)}/bln)</span>
                                </label>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Kenaikan gaji/thn" htmlFor="growth">
                                    <PercentInput id="growth" value={a.incomeGrowth} onChange={(v) => set('incomeGrowth', v)} />
                                </Field>
                                <Field label="Inflasi/thn" htmlFor="inflation">
                                    <PercentInput id="inflation" value={a.inflation} onChange={(v) => set('inflation', v)} />
                                </Field>
                                <Field label="Return investasi/thn" htmlFor="return">
                                    <PercentInput id="return" value={a.investReturn} onChange={(v) => set('investReturn', v)} />
                                </Field>
                                <Field label="Surplus diinvestasi" htmlFor="share">
                                    <PercentInput
                                        id="share"
                                        value={a.investShare}
                                        onChange={(v) => set('investShare', Math.max(0, Math.min(100, v)))}
                                    />
                                </Field>
                            </div>
                            <Field label="Jangka waktu">
                                <div className="grid grid-cols-5 gap-1">
                                    {[1, 3, 5, 10, 20].map((y) => (
                                        <Button
                                            key={y}
                                            type="button"
                                            size="sm"
                                            variant={a.years === y ? 'default' : 'outline'}
                                            onClick={() => set('years', y)}
                                        >
                                            {y} th
                                        </Button>
                                    ))}
                                </div>
                            </Field>
                        </div>
                    </Section>

                    <div className="flex flex-col gap-4 lg:col-span-2">
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard
                                label={`Kekayaan bersih ${a.years} thn lagi`}
                                value={compact(end.netWorth)}
                                sub={`Nilai riil hari ini ≈ ${compact(end.realNetWorth)}`}
                                icon={TrendingUp}
                                tone={end.netWorth >= 0 ? 'positive' : 'negative'}
                            />
                            <StatCard
                                label="Surplus bulan depan"
                                value={compact(firstSurplus)}
                                sub={a.income ? `${Math.round((firstSurplus / a.income) * 100)}% dari pemasukan` : '—'}
                                tone={firstSurplus >= 0 ? 'default' : 'negative'}
                            />
                        </div>

                        <Section title="Proyeksi Kekayaan">
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ left: -10, right: 4, top: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                            minTickGap={24}
                                        />
                                        <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                        <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Area dataKey="investment" name="Investasi" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35} />
                                        <Area dataKey="cash" name="Tabungan" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.35} />
                                        <Area dataKey="debt" name="Utang" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} />
                                        <Line dataKey="realNetWorth" name="Nilai riil" stroke="#64748b" strokeDasharray="4 4" dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Section>
                    </div>
                </div>

                <Section title="Tonggak Penting">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { icon: ShieldCheck, label: 'Dana darurat 6 bulan', value: describeMonth(result.emergencyFundMonth) },
                            {
                                icon: Flag,
                                label: 'Bebas utang',
                                value: debts.length ? describeMonth(result.debtFreeMonth) : 'Tidak ada utang',
                            },
                            {
                                icon: Sparkles,
                                label: 'Kebebasan finansial',
                                value: describeMonth(result.fiMonth),
                                hint: `Investasi ≥ 25× pengeluaran tahunan (${compact(expenseExDebt * 12 * 25)} saat ini)`,
                            },
                            {
                                icon: CalendarClock,
                                label: `Total ditabung ${a.years} thn`,
                                value: rupiah(result.totalSaved),
                                hint: result.totalInterestPaid ? `Bunga utang dibayar ${compact(result.totalInterestPaid)}` : undefined,
                            },
                        ].map((m) => (
                            <div key={m.label} className="flex gap-3 rounded-lg border p-3">
                                <m.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-muted-foreground text-xs">{m.label}</div>
                                    <div className="font-semibold">{m.value}</div>
                                    {m.hint && <div className="text-muted-foreground text-xs">{m.hint}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {firstSurplus < 0 && (
                        <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
                            Pengeluaran lebih besar dari pemasukan. Dengan pola ini tabungan akan terus berkurang — kurangi pengeluaran atau tambah
                            pemasukan.
                        </p>
                    )}
                </Section>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Section title="Rencana Target">
                        {activeGoals.length === 0 ? (
                            <EmptyState icon={Flag} title="Tidak ada target aktif" />
                        ) : (
                            <>
                                <ul className="divide-y">
                                    {goalNeeds.map(({ goal: g, need }) => (
                                        <li key={g.id} className="flex items-center gap-3 py-2.5">
                                            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{g.name}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    Kurang {compact(g.target_amount - g.current_amount)} ·{' '}
                                                    {g.target_date ? formatDate(g.target_date) : 'tanpa tenggat'} · {PRIORITIES[g.priority]}
                                                </div>
                                            </div>
                                            <div className="text-right text-sm font-semibold tabular-nums">
                                                {need !== null ? `${compact(need)}/bln` : '-'}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                <div
                                    className={cn(
                                        'mt-3 rounded-lg p-3 text-sm',
                                        totalGoalNeed <= firstSurplus
                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                    )}
                                >
                                    Butuh {rupiah(totalGoalNeed)}/bln, surplus {rupiah(firstSurplus)}/bln.{' '}
                                    {totalGoalNeed <= firstSurplus
                                        ? 'Semua target bisa tercapai tepat waktu 👍'
                                        : 'Belum cukup — mundurkan tenggat target prioritas rendah, atau tingkatkan surplus.'}
                                </div>
                            </>
                        )}
                    </Section>

                    <Section title="Rencana Pelunasan Utang">
                        {debts.length === 0 ? (
                            <EmptyState icon={Flag} title="Tidak ada utang aktif" />
                        ) : (
                            <ul className="divide-y">
                                {debts.map((d) => {
                                    const m = monthsToPayoff(d);
                                    return (
                                        <li key={d.id} className="flex items-center gap-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{d.name}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    Sisa {compact(d.remaining_amount)} · cicilan {compact(d.monthly_payment)}/bln · {d.interest_rate}%
                                                </div>
                                            </div>
                                            <div className={cn('text-right text-sm font-semibold', m === null && 'text-red-600')}>
                                                {payoffDate(m)}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>
                </div>

                <Section
                    title={
                        <span className="flex items-center gap-2">
                            <Repeat className="size-4" /> Pemasukan & Pengeluaran Rutin
                        </span>
                    }
                    action={
                        <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openItem(null, 'income')}>
                                <Plus /> Masuk
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openItem(null, 'expense')}>
                                <Plus /> Keluar
                            </Button>
                        </div>
                    }
                >
                    {recurringItems.length === 0 ? (
                        <EmptyState
                            icon={Repeat}
                            title="Belum ada item rutin"
                            description="Contoh: Gaji, sewa kos, listrik, internet, uang orang tua. Dipakai sebagai dasar proyeksi."
                        />
                    ) : (
                        <>
                            <ul className="divide-y">
                                {recurringItems.map((item) => (
                                    <li key={item.id} className="flex items-center gap-3 py-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{item.name}</div>
                                            <div className="text-muted-foreground text-xs">
                                                {item.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                                                {item.start_date && ` · mulai ${formatDate(item.start_date)}`}
                                                {item.end_date && ` · s.d. ${formatDate(item.end_date)}`}
                                            </div>
                                        </div>
                                        <span
                                            className={cn(
                                                'text-sm font-semibold tabular-nums',
                                                item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                                            )}
                                        >
                                            {item.type === 'income' ? '+' : '−'}
                                            {rupiah(item.amount)}
                                        </span>
                                        <div className="flex shrink-0">
                                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openItem(item)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <DeleteButton url={route('recurring.destroy', item.id)} label={item.name}>
                                                <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </DeleteButton>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-sm">
                                <div>
                                    <div className="text-muted-foreground text-xs">Masuk</div>
                                    <div className="font-semibold text-emerald-600">{compact(recurringTotals.income)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Keluar</div>
                                    <div className="font-semibold text-red-600">{compact(recurringTotals.expense)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Sisa</div>
                                    <div className="font-semibold">{compact(recurringTotals.income - recurringTotals.expense)}</div>
                                </div>
                            </div>
                        </>
                    )}
                </Section>
            </Page>

            <FormDialog
                open={itemOpen}
                onOpenChange={setItemOpen}
                title={editingItem ? 'Ubah Item Rutin' : itemForm.data.type === 'income' ? 'Pemasukan Rutin' : 'Pengeluaran Rutin'}
                description="Nominal per bulan. Tanggal mulai/selesai opsional (mis. kontrak kerja, masa cicilan)."
                onSubmit={submitItem}
                processing={itemForm.processing}
            >
                <Field label="Nama" error={itemForm.errors.name} htmlFor="item-name">
                    <Input id="item-name" value={itemForm.data.name} onChange={(e) => itemForm.setData('name', e.target.value)} />
                </Field>
                <Field label="Nominal per bulan" error={itemForm.errors.amount}>
                    <MoneyInput value={itemForm.data.amount} onChange={(v) => itemForm.setData('amount', v)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Mulai" error={itemForm.errors.start_date} htmlFor="item-start">
                        <Input
                            id="item-start"
                            type="date"
                            value={itemForm.data.start_date}
                            onChange={(e) => itemForm.setData('start_date', e.target.value)}
                        />
                    </Field>
                    <Field label="Selesai" error={itemForm.errors.end_date} htmlFor="item-end">
                        <Input
                            id="item-end"
                            type="date"
                            value={itemForm.data.end_date}
                            onChange={(e) => itemForm.setData('end_date', e.target.value)}
                        />
                    </Field>
                </div>
            </FormDialog>
        </AppLayout>
    );
}
