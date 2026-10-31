import { AccountOptions } from '@/components/finance/account-select';
import { currentMonth, FixedItemsEditor } from '@/components/finance/fixed-items-editor';
import { MoneyInput } from '@/components/finance/money-input';
import { PageTabs } from '@/components/finance/page-tabs';
import { EmptyState, Field, FormDialog, Page, PageHeader, ProgressBar, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { formatDate, monthLabel, percent, rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { type RecurringItem } from '@/types/finance';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { AlarmClock, CalendarRange, ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Biaya Bulanan'), href: '/monthly' }];

interface Bill {
    /** recurring = biaya tetap di daftar bawah, debt = cicilan berjadwal dari menu Utang, pocket = isi Dompet Tujuan */
    source: 'recurring' | 'debt' | 'pocket';
    from_account_id?: number | null;
    to_account?: string | null;
    to_account_id?: number | null;
    id: number;
    debt_id?: number;
    name: string;
    amount: number;
    due_day: number | null;
    category: { id: number; name: string; color: string } | null;
    paid: number;
    payments: { id: number; date: string; amount: number; account: string | null }[];
}

interface Props {
    month: string;
    bills: Bill[];
    scenario: { id: number; name: string } | null;
    scenarioLines: { key: string; name: string; amount: number }[];
    items: RecurringItem[];
    endingSoon: { id: number; name: string; type: 'income' | 'expense'; amount: number; end_date: string }[];
    categories: { id: number; name: string; color: string }[];
}

type Status = 'paid' | 'partial' | 'late' | 'pending' | 'over';

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dueDate(month: string, day: number | null) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${month}-${String(Math.min(day ?? 1, last)).padStart(2, '0')}`;
}

function statusOf(b: Bill, month: string): Status {
    if (b.paid > b.amount) return 'over';
    if (b.paid >= b.amount) return 'paid';
    const now = currentMonth();
    const overdue = month < now || (month === now && b.due_day !== null && new Date().getDate() > b.due_day);
    if (overdue) return 'late';
    return b.paid > 0 ? 'partial' : 'pending';
}

const STATUS: Record<Status, { label: string; className: string; bar: string }> = {
    paid: { label: t('Lunas'), className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', bar: '#10b981' },
    over: { label: t('Lebih budget'), className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', bar: '#f59e0b' },
    partial: { label: t('Sebagian'), className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', bar: '#3b82f6' },
    late: { label: t('Terlambat'), className: 'bg-red-500/15 text-red-700 dark:text-red-400', bar: '#ef4444' },
    pending: { label: t('Belum'), className: 'bg-muted text-muted-foreground', bar: '#94a3b8' },
};

export default function MonthlyBills({ month, bills, scenario, scenarioLines, items, endingSoon, categories }: Props) {
    const { finance } = usePage<SharedData & { finance: { accounts: { id: number; name: string; type: string }[] } | null }>().props;
    const accounts = finance?.accounts ?? [];
    const [payFor, setPayFor] = useState<Bill | null>(null);
    const pay = useForm<{ amount: number | ''; account_id: string; category_id: string; date: string }>({
        amount: '',
        account_id: '',
        category_id: '',
        date: today(),
    });

    const openPay = (b: Bill) => {
        pay.clearErrors();
        pay.setData({
            amount: Math.max(0, b.amount - b.paid) || b.amount,
            account_id: b.from_account_id ? String(b.from_account_id) : accounts[0] ? String(accounts[0].id) : '',
            category_id: b.source !== 'pocket' && b.category ? String(b.category.id) : '',
            date: month === currentMonth() ? today() : dueDate(month, b.due_day),
        });
        setPayFor(b);
    };

    const go = (m: string) => router.get(route('monthly.index'), { month: m }, { preserveScroll: true, preserveState: true });

    const billTotal = bills.reduce((s, b) => s + b.amount, 0);
    const scenarioTotal = scenarioLines.reduce((s, l) => s + l.amount, 0);
    const paidTotal = bills.reduce((s, b) => s + Math.min(b.paid, b.amount), 0);
    const remaining = bills.reduce((s, b) => s + Math.max(0, b.amount - b.paid), 0);
    const lateCount = bills.filter((b) => statusOf(b, month) === 'late').length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Biaya Bulanan')} />
            <Page>
                <PageTabs group="calendar" />
                <PageHeader
                    title={t('Biaya Bulanan')}
                    description={t('Semua biaya tetap muncul tiap bulan: budget, yang sudah dibayar, dan sisanya.')}
                />

                {endingSoon.length > 0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 font-medium">
                            <AlarmClock className="size-4 text-amber-600" /> {t('Akan berakhir — lanjut atau selesai?')}
                        </div>
                        <ul className="mt-2 divide-y">
                            {endingSoon.map((e) => (
                                <li key={e.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm">
                                        <span className="font-medium">{e.name}</span>{' '}
                                        <span className="text-muted-foreground">
                                            ({t(':amount/bln', { amount: rupiah(e.amount) })}){' '}
                                            {e.end_date.slice(0, 7) < currentMonth() ? t('sudah berakhir') : t('berakhir')}{' '}
                                            {monthLabel(e.end_date, 'long')}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[3, 6, 12].map((n) => (
                                            <Button
                                                key={n}
                                                size="sm"
                                                variant="outline"
                                                onClick={() => router.post(route('monthly.renew', e.id), { months: n }, { preserveScroll: true })}
                                            >
                                                {t('+:n bln', { n })}
                                            </Button>
                                        ))}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => router.post(route('monthly.renew', e.id), { months: null }, { preserveScroll: true })}
                                        >
                                            {t('Seterusnya')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => router.post(route('monthly.confirm-end', e.id), {}, { preserveScroll: true })}
                                        >
                                            {t('Ya, selesai')}
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label={t('Bulan sebelumnya')}>
                        <ChevronLeft />
                    </Button>
                    <button className="text-sm font-semibold" onClick={() => go(currentMonth())} title={t('Kembali ke bulan ini')}>
                        {monthLabel(month, 'long')}
                        {month === currentMonth() && <span className="text-muted-foreground ml-1 font-normal">{t('(bulan ini)')}</span>}
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label={t('Bulan berikutnya')}>
                        <ChevronRight />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label={t('Total Biaya Tetap')}
                        value={rupiah(billTotal + scenarioTotal)}
                        sub={scenarioTotal ? t(':amount dari skenario', { amount: rupiah(scenarioTotal) }) : undefined}
                    />
                    <StatCard
                        label={t('Sudah Dibayar')}
                        value={rupiah(paidTotal)}
                        sub={t(':pct% dari daftar', { pct: Math.round(percent(paidTotal, billTotal)) })}
                        tone="positive"
                    />
                    <StatCard label={t('Belum Dibayar')} value={rupiah(remaining)} tone={remaining > 0 ? 'negative' : 'default'} />
                    <StatCard
                        label={t('Terlambat')}
                        value={lateCount}
                        sub={lateCount ? t('lewat tanggal bayar') : t('aman')}
                        tone={lateCount ? 'negative' : 'default'}
                    />
                </div>

                <Section title={t('Tagihan :month', { month: monthLabel(month, 'long') })}>
                    {bills.length === 0 ? (
                        <EmptyState
                            icon={ReceiptText}
                            title={t('Belum ada biaya tetap di bulan ini')}
                            description={t('Tambahkan di daftar paling bawah halaman ini.')}
                        />
                    ) : (
                        <ul className="divide-y">
                            {bills.map((b) => {
                                const st = statusOf(b, month);
                                return (
                                    <li key={`${b.source}-${b.id}`} className="py-3">
                                        <div className="flex items-start gap-3">
                                            <span
                                                className="mt-1.5 size-2.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: b.category?.color ?? '#94a3b8' }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="font-medium">{b.name}</span>
                                                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS[st].className)}>
                                                        {STATUS[st].label}
                                                    </span>
                                                </div>
                                                <div className="text-muted-foreground text-xs">
                                                    {b.source === 'debt' ? (
                                                        <Link href={route('debts.index')} className="hover:underline">
                                                            {t('Cicilan utang')}
                                                        </Link>
                                                    ) : b.source === 'pocket' ? (
                                                        <Link href={route('accounts.index')} className="hover:underline">
                                                            {t('Isi dompet → :name', { name: b.to_account ?? '' })}
                                                        </Link>
                                                    ) : (
                                                        (b.category?.name ?? t('Tanpa kategori'))
                                                    )}
                                                    {b.due_day ? t(' · tgl :day', { day: b.due_day }) : ''}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-sm font-semibold tabular-nums">{rupiah(b.amount)}</div>
                                                <div className="text-muted-foreground text-xs tabular-nums">
                                                    {b.source === 'pocket'
                                                        ? t('diisi :amount', { amount: rupiah(b.paid) })
                                                        : t('dibayar :amount', { amount: rupiah(b.paid) })}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-3 pl-5.5">
                                            <ProgressBar value={percent(b.paid, b.amount)} color={STATUS[st].bar} />
                                            {st !== 'paid' && st !== 'over' && (
                                                <Button
                                                    size="sm"
                                                    variant={st === 'late' ? 'default' : 'outline'}
                                                    className="h-7 shrink-0"
                                                    onClick={() => openPay(b)}
                                                >
                                                    {b.source === 'pocket' ? t('Isi') : t('Bayar')}
                                                </Button>
                                            )}
                                        </div>
                                        {b.payments.length > 0 && (
                                            <div className="text-muted-foreground mt-1 pl-5.5 text-xs">
                                                {b.payments
                                                    .map(
                                                        (p) =>
                                                            `${formatDate(p.date, { day: 'numeric', month: 'short' })} ${rupiah(p.amount)}${p.account ? ` (${p.account})` : ''}`,
                                                    )
                                                    .join(' · ')}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>

                {scenarioLines.length > 0 && (
                    <Section
                        title={
                            <span className="flex items-center gap-2">
                                <CalendarRange className="size-4" /> {t('Dari asumsi skenario :name', { name: scenario?.name ?? '' })}
                            </span>
                        }
                        action={
                            <Link href={route('projection.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Ubah di Proyeksi')}
                            </Link>
                        }
                    >
                        <ul className="divide-y">
                            {scenarioLines.map((l) => (
                                <li key={l.key} className="flex items-center justify-between py-2 text-sm">
                                    <span>{l.name}</span>
                                    <span className="font-semibold tabular-nums">{rupiah(l.amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-muted-foreground mt-2 text-xs">
                            {t(
                                'Pos dari asumsi skenario yang belum punya tagihan sendiri. Cicilan yang sudah dijadwalkan di menu Utang tampil di daftar tagihan di atas. Jangan dimasukkan lagi ke daftar di bawah agar tidak terhitung dua kali.',
                            )}
                        </p>
                    </Section>
                )}

                <FixedItemsEditor items={items} />
            </Page>

            <FormDialog
                open={payFor !== null}
                onOpenChange={(o) => !o && setPayFor(null)}
                title={payFor?.source === 'pocket' ? (payFor?.name ?? '') : t('Bayar :name', { name: payFor?.name ?? '' })}
                description={
                    payFor
                        ? payFor.source === 'pocket'
                            ? t('Rencana :amount · sudah diisi :paid. Tercatat sebagai transfer ke dompet :name.', {
                                  amount: rupiah(payFor.amount),
                                  paid: rupiah(payFor.paid),
                                  name: payFor.to_account ?? '',
                              })
                            : t('Budget :amount · sudah dibayar :paid. Tercatat sebagai transaksi pengeluaran.', {
                                  amount: rupiah(payFor.amount),
                                  paid: rupiah(payFor.paid),
                              })
                        : undefined
                }
                onSubmit={() => {
                    if (!payFor) return;
                    const options = { preserveScroll: true, onSuccess: () => setPayFor(null) };
                    if (payFor.source === 'debt' && payFor.debt_id) {
                        pay.transform((d) => ({ amount: d.amount, account_id: d.account_id, date: d.date, installment_id: payFor.id }));
                        pay.post(route('debts.pay', payFor.debt_id), options);
                    } else {
                        pay.transform((d) => d);
                        pay.post(route('monthly.pay', payFor.id), options);
                    }
                }}
                processing={pay.processing}
            >
                <Field label={t('Nominal')} error={pay.errors.amount}>
                    <MoneyInput value={pay.data.amount} onChange={(v) => pay.setData('amount', v)} autoFocus />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Dari rekening')} error={pay.errors.account_id}>
                        <Select value={pay.data.account_id} onValueChange={(v) => pay.setData('account_id', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('Pilih rekening')} />
                            </SelectTrigger>
                            <SelectContent>
                                <AccountOptions accounts={accounts.filter((a) => a.id !== payFor?.to_account_id)} />
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('Tanggal')} error={pay.errors.date} htmlFor="pay-date">
                        <Input id="pay-date" type="date" value={pay.data.date} onChange={(e) => pay.setData('date', e.target.value)} />
                    </Field>
                </div>
                {payFor?.source === 'debt' ? (
                    <p className="text-muted-foreground text-xs">
                        {t('Cicilan bulan ini di menu Utang ikut ditandai lunas dan sisa utang berkurang.')}
                    </p>
                ) : payFor?.source === 'pocket' ? (
                    <p className="text-muted-foreground text-xs">
                        {t('Saldo rekening sumber berkurang dan saldo dompet bertambah. Total kekayaan tidak berubah.')}
                    </p>
                ) : (
                    <Field label={t('Kategori')} error={pay.errors.category_id}>
                        <Select value={pay.data.category_id || 'none'} onValueChange={(v) => pay.setData('category_id', v === 'none' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('Tanpa kategori')}</SelectItem>
                                {categories.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            </FormDialog>
        </AppLayout>
    );
}
