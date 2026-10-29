import { AccountSelect, useDefaultAccountId } from '@/components/finance/account-select';
import { MoneyInput } from '@/components/finance/money-input';
import { MonthPicker } from '@/components/finance/month-picker';
import { DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, ProgressBar, StatCard, StatusBadge } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { monthsToPayoff, payoffDate } from '@/lib/debt';
import { compact, DEBT_KINDS, formatDate, monthLabel, percent, rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';
import { type Debt, type DebtInstallment, type DebtKind } from '@/types/finance';
import { Head, useForm } from '@inertiajs/react';
import { CalendarClock, CheckCircle2, ChevronDown, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Utang & Cicilan'), href: '/debts' }];

type FormData = {
    name: string;
    lender: string;
    kind: DebtKind;
    total_amount: number | '';
    remaining_amount: number | '';
    monthly_payment: number | '';
    interest_rate: string;
    due_day: string;
    start_month: string;
    tenor_months: string;
};

const empty: FormData = {
    name: '',
    lender: '',
    kind: 'other',
    total_amount: '',
    remaining_amount: '',
    monthly_payment: '',
    interest_rate: '0',
    due_day: '',
    start_month: '',
    tenor_months: '',
};

type PayData = { amount: number | ''; account_id: string; date: string; installment_id: string };

/** Sisa bulan & tanggal lunas: dari jadwal cicilan bila ada, kalau tidak dari estimasi anuitas. */
function payoff(d: Debt): { months: number | null; label: string } {
    if (d.installments?.length) {
        const unpaid = d.installments.filter((i) => !i.paid_at);
        const last = unpaid.at(-1);
        return { months: unpaid.length, label: last ? monthLabel(last.period, 'long') : t('Lunas') };
    }
    const months = monthsToPayoff(d);
    return { months, label: payoffDate(months) };
}

export default function Debts({ debts }: { debts: Debt[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Debt | null>(null);
    const form = useForm<FormData>(empty);
    const [payFor, setPayFor] = useState<Debt | null>(null);
    const defaultAccount = useDefaultAccountId();
    const pay = useForm<PayData>({ amount: '', account_id: '', date: today(), installment_id: '' });

    const openForm = (d: Debt | null) => {
        setEditing(d);
        form.clearErrors();
        form.setData(
            d
                ? {
                      name: d.name,
                      lender: d.lender ?? '',
                      kind: d.kind,
                      total_amount: d.total_amount,
                      remaining_amount: d.remaining_amount,
                      monthly_payment: d.monthly_payment,
                      interest_rate: String(d.interest_rate),
                      due_day: d.due_day ? String(d.due_day) : '',
                      start_month: d.start_month ? d.start_month.slice(0, 7) : '',
                      tenor_months: d.tenor_months ? String(d.tenor_months) : '',
                  }
                : empty,
        );
        setOpen(true);
    };

    const openPay = (d: Debt, installment?: DebtInstallment) => {
        const next = installment ?? d.installments?.find((i) => !i.paid_at);
        pay.clearErrors();
        pay.setData({
            amount: next?.amount ?? (d.monthly_payment || ''),
            account_id: defaultAccount,
            date: today(),
            installment_id: next ? String(next.id) : '',
        });
        setPayFor(d);
    };

    const submit = () => {
        form.transform((d) => {
            const scheduled = d.start_month && d.tenor_months && d.monthly_payment;
            const scheduledTotal = scheduled ? Number(d.monthly_payment) * Number(d.tenor_months) : 0;
            const total = d.total_amount || scheduledTotal;
            return {
                ...d,
                total_amount: total,
                remaining_amount: d.remaining_amount === '' ? total : Math.min(Number(d.remaining_amount), Number(total)),
                monthly_payment: d.monthly_payment || 0,
                interest_rate: d.interest_rate.replace(',', '.') || 0,
                due_day: d.due_day || null,
                start_month: d.start_month || null,
                tenor_months: d.tenor_months || null,
            };
        });
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('debts.update', editing.id), options);
        else form.post(route('debts.store'), options);
    };

    const totalRemaining = debts.reduce((s, d) => s + d.remaining_amount, 0);
    const totalMonthly = debts.filter((d) => d.remaining_amount > 0).reduce((s, d) => s + d.monthly_payment, 0);
    const longest = Math.max(0, ...debts.map((d) => payoff(d).months ?? 0));
    const scheduled = Boolean(form.data.start_month || form.data.tenor_months);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Utang & Cicilan')} />
            <Page>
                <PageHeader
                    title={t('Utang & Cicilan')}
                    description={t(
                        'Isi bulan mulai & sisa tenor agar jadwal cicilan, pengingat jatuh tempo, dan hitung mundur lunas dibuat otomatis.',
                    )}
                    actions={
                        <Button onClick={() => openForm(null)}>
                            <Plus /> {t('Tambah Utang')}
                        </Button>
                    }
                />

                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        label={t('Sisa Utang')}
                        value={compact(totalRemaining)}
                        sub={rupiah(totalRemaining)}
                        tone={totalRemaining > 0 ? 'negative' : 'default'}
                    />
                    <StatCard label={t('Cicilan / Bulan')} value={compact(totalMonthly)} sub={rupiah(totalMonthly)} />
                    <StatCard
                        label={t('Bebas Utang')}
                        value={longest ? t(':n bln', { n: longest }) : '-'}
                        sub={longest ? payoffDate(longest) : t('Tidak ada utang aktif')}
                    />
                </div>

                {debts.length === 0 ? (
                    <EmptyState
                        icon={CreditCard}
                        title={t('Tidak ada utang tercatat')}
                        description={t('Catat di sini jika kamu punya cicilan atau pinjaman.')}
                    />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {debts.map((d) => (
                            <DebtCard key={d.id} debt={d} onEdit={() => openForm(d)} onPay={(i) => openPay(d, i)} />
                        ))}
                    </div>
                )}
            </Page>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={editing ? t('Ubah Utang') : t('Tambah Utang')}
                onSubmit={submit}
                processing={form.processing}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Nama')} error={form.errors.name} htmlFor="debt-name">
                        <Input
                            id="debt-name"
                            value={form.data.name}
                            onChange={(e) => form.setData('name', e.target.value)}
                            placeholder={t('Cicilan mobil, KPR...')}
                        />
                    </Field>
                    <Field label={t('Jenis')} error={form.errors.kind}>
                        <Select value={form.data.kind} onValueChange={(v) => form.setData('kind', v as DebtKind)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(DEBT_KINDS).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('Pemberi pinjaman')} error={form.errors.lender} htmlFor="debt-lender">
                        <Input
                            id="debt-lender"
                            value={form.data.lender}
                            onChange={(e) => form.setData('lender', e.target.value)}
                            placeholder={t('Leasing, bank...')}
                        />
                    </Field>
                    <Field label={t('Cicilan per bulan')} error={form.errors.monthly_payment}>
                        <MoneyInput value={form.data.monthly_payment} onChange={(v) => form.setData('monthly_payment', v)} />
                    </Field>
                    <Field label={t('Bulan cicilan berikutnya')} error={form.errors.start_month} htmlFor="debt-start">
                        <MonthPicker id="debt-start" value={form.data.start_month} onChange={(v) => form.setData('start_month', v)} />
                    </Field>
                    <Field label={t('Sisa tenor (bulan)')} error={form.errors.tenor_months} htmlFor="debt-tenor">
                        <Input
                            id="debt-tenor"
                            type="number"
                            min={1}
                            value={form.data.tenor_months}
                            onChange={(e) => form.setData('tenor_months', e.target.value)}
                            placeholder={t('mis. 14')}
                        />
                    </Field>
                    <Field label={t('Tanggal jatuh tempo')} error={form.errors.due_day} htmlFor="debt-due">
                        <Input
                            id="debt-due"
                            type="number"
                            min={1}
                            max={31}
                            value={form.data.due_day}
                            onChange={(e) => form.setData('due_day', e.target.value)}
                            placeholder="1–31"
                        />
                    </Field>
                    <Field label={t('Bunga (% per tahun)')} error={form.errors.interest_rate} htmlFor="debt-rate">
                        <Input
                            id="debt-rate"
                            inputMode="decimal"
                            value={form.data.interest_rate}
                            onChange={(e) => form.setData('interest_rate', e.target.value)}
                        />
                    </Field>
                    {!scheduled && (
                        <>
                            <Field label={t('Total pinjaman')} error={form.errors.total_amount}>
                                <MoneyInput value={form.data.total_amount} onChange={(v) => form.setData('total_amount', v)} />
                            </Field>
                            <Field label={t('Sisa utang saat ini')} error={form.errors.remaining_amount}>
                                <MoneyInput
                                    value={form.data.remaining_amount}
                                    onChange={(v) => form.setData('remaining_amount', v)}
                                    placeholder={t('Sama dengan total')}
                                />
                            </Field>
                        </>
                    )}
                </div>
                {scheduled && (
                    <p className="text-muted-foreground text-xs">
                        {t('Sisa utang dihitung dari jumlah cicilan yang belum dibayar')}
                        {form.data.monthly_payment && form.data.tenor_months
                            ? `: ${form.data.tenor_months} × ${rupiah(Number(form.data.monthly_payment))} = ${rupiah(Number(form.data.monthly_payment) * Number(form.data.tenor_months))}`
                            : ''}
                        .
                    </p>
                )}
            </FormDialog>

            <FormDialog
                open={payFor !== null}
                onOpenChange={(o) => !o && setPayFor(null)}
                title={t('Bayar :name', { name: payFor?.name ?? '' })}
                description={t('Dicatat sebagai transaksi pengeluaran dari rekening yang dipilih, dan cicilan ditandai lunas.')}
                processing={pay.processing}
                onSubmit={() =>
                    payFor &&
                    pay.post(route('debts.pay', payFor.id), {
                        preserveScroll: true,
                        onSuccess: () => setPayFor(null),
                    })
                }
            >
                {payFor?.installments?.length ? (
                    <Field label={t('Cicilan')} error={pay.errors.installment_id}>
                        <Select
                            value={pay.data.installment_id}
                            onValueChange={(v) => {
                                const i = payFor.installments?.find((x) => String(x.id) === v);
                                pay.setData((d) => ({ ...d, installment_id: v, amount: i?.amount ?? d.amount }));
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {payFor.installments
                                    .filter((i) => !i.paid_at)
                                    .map((i) => (
                                        <SelectItem key={i.id} value={String(i.id)}>
                                            {t(':month · jatuh tempo :date', {
                                                month: monthLabel(i.period),
                                                date: formatDate(i.due_date, { day: 'numeric', month: 'short' }),
                                            })}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </Field>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Nominal')} error={pay.errors.amount}>
                        <MoneyInput value={pay.data.amount} onChange={(v) => pay.setData('amount', v)} autoFocus />
                    </Field>
                    <Field label={t('Tanggal bayar')} error={pay.errors.date} htmlFor="pay-date">
                        <Input id="pay-date" type="date" value={pay.data.date} onChange={(e) => pay.setData('date', e.target.value)} />
                    </Field>
                </div>
                <Field label={t('Dari rekening')} error={pay.errors.account_id}>
                    <AccountSelect value={pay.data.account_id} onChange={(v) => pay.setData('account_id', v)} />
                </Field>
            </FormDialog>
        </AppLayout>
    );
}

function DebtCard({ debt: d, onEdit, onPay }: { debt: Debt; onEdit: () => void; onPay: (i?: DebtInstallment) => void }) {
    const [showAll, setShowAll] = useState(false);
    const { months, label } = payoff(d);
    const installments = d.installments ?? [];
    const paidCount = installments.filter((i) => i.paid_at).length;
    const progress = installments.length ? percent(paidCount, installments.length) : percent(d.total_amount - d.remaining_amount, d.total_amount);
    const open = installments.filter((i) => !i.paid_at);
    const visible = showAll ? installments : open.slice(0, 3);

    return (
        <div className="bg-card rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{d.name}</span>
                        {d.remaining_amount === 0 && <CheckCircle2 className="size-4 text-emerald-500" />}
                    </div>
                    <div className="text-muted-foreground text-xs">
                        {DEBT_KINDS[d.kind] ?? t('Lainnya')}
                        {d.lender ? ` · ${d.lender}` : ''}
                        {d.due_day ? t(' · jatuh tempo tgl :day', { day: d.due_day }) : ''}
                    </div>
                </div>
                <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="size-8" onClick={onEdit}>
                        <Pencil className="size-4" />
                    </Button>
                    <DeleteButton url={route('debts.destroy', d.id)} label={t('utang :name', { name: d.name })}>
                        <Button variant="ghost" size="icon" className="size-8 text-red-600">
                            <Trash2 className="size-4" />
                        </Button>
                    </DeleteButton>
                </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                    <div className="text-muted-foreground text-xs">{t('Sisa')}</div>
                    <div className="text-lg font-bold text-red-600 tabular-nums">{rupiah(d.remaining_amount)}</div>
                </div>
                <div className="text-right">
                    <div className="text-muted-foreground text-xs">{t('Cicilan')}</div>
                    <div className="font-semibold tabular-nums">{rupiah(d.monthly_payment)}</div>
                </div>
            </div>
            <ProgressBar className="mt-2" value={progress} color="#10b981" />
            <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-muted-foreground text-xs">
                    {installments.length
                        ? t(':paid/:total cicilan', { paid: paidCount, total: installments.length })
                        : t(':pct% terbayar', { pct: Math.round(progress) })}{' '}
                    ·{' '}
                    {months === null ? t('cicilan < bunga!') : months === 0 ? t('lunas') : t(':n bln lagi, lunas :date', { n: months, date: label })}
                </div>
                {d.remaining_amount > 0 && (
                    <Button size="sm" variant="outline" onClick={() => onPay()}>
                        {t('Bayar')}
                    </Button>
                )}
            </div>

            {installments.length > 0 && (
                <div className="mt-3 border-t pt-2">
                    <ul className="divide-y text-sm">
                        {visible.map((i) => (
                            <li key={i.id} className="flex items-center gap-2 py-1.5">
                                <CalendarClock className="text-muted-foreground size-3.5 shrink-0" />
                                <span className="flex-1">
                                    {monthLabel(i.period)}
                                    <span className="text-muted-foreground text-xs">
                                        {' '}
                                        ·{' '}
                                        {i.paid_at
                                            ? t('dibayar :date', { date: formatDate(i.paid_at, { day: 'numeric', month: 'short' }) })
                                            : t('tempo :date', { date: formatDate(i.due_date, { day: 'numeric', month: 'short' }) })}
                                    </span>
                                </span>
                                <span className="tabular-nums">{compact(i.amount)}</span>
                                <StatusBadge status={i.status} />
                                {!i.paid_at && (
                                    <button className="text-primary text-xs hover:underline" onClick={() => onPay(i)}>
                                        {t('Bayar')}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    <button
                        className="text-muted-foreground mt-1 flex items-center gap-1 text-xs hover:underline"
                        onClick={() => setShowAll(!showAll)}
                    >
                        <ChevronDown className={`size-3 transition ${showAll ? 'rotate-180' : ''}`} />
                        {showAll ? t('Sembunyikan') : t('Lihat semua jadwal (:n)', { n: installments.length })}
                    </button>
                </div>
            )}
        </div>
    );
}
