import { AccountOptions, AccountSelect, useDefaultAccountId } from '@/components/finance/account-select';
import { MoneyInput } from '@/components/finance/money-input';
import { MonthPicker } from '@/components/finance/month-picker';
import { DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, ProgressBar, StatCard, StatusBadge } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { compact, formatDate, monthLabel, percent, rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { type Receivable, type ReceivableSchedule } from '@/types/finance';
import { Head, useForm, usePage } from '@inertiajs/react';
import { ExternalLink, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Piutang'), href: '/receivables' }];

type FormData = {
    counterparty: string;
    principal: number | '';
    interest_pct: string;
    withdrawal: number | '';
    withdrawal_change_month: string;
    withdrawal_after: number | '';
    due_day: string;
    start_month: string;
    agreement_url: string;
    note: string;
    /** Hanya saat membuat: rekening sumber dana (kosong = tidak memotong rekening) */
    account_id: string;
    funded_date: string;
};

const empty: FormData = {
    counterparty: '',
    principal: '',
    interest_pct: '1',
    withdrawal: '',
    withdrawal_change_month: '',
    withdrawal_after: '',
    due_day: '1',
    start_month: today().slice(0, 7),
    agreement_url: '',
    note: '',
    account_id: '',
    funded_date: today(),
};

type ReceiveMode = 'principal' | 'auto';
type ReceiveData = { schedule_id: string; mode: ReceiveMode; account_id: string; amount: number | ''; date: string };

const outstanding = (s: ReceivableSchedule) => Math.max(0, s.interest_due + s.principal_due - s.interest_received - s.principal_received);

export default function Receivables({ receivables }: { receivables: Receivable[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Receivable | null>(null);
    const form = useForm<FormData>(empty);
    // s = null → tarik/terima langsung dari kartu; jadwal dipilih otomatis dari bulan tanggal terima
    const [receiveFor, setReceiveFor] = useState<{ r: Receivable; s: ReceivableSchedule | null } | null>(null);
    const defaultAccount = useDefaultAccountId();
    const receive = useForm<ReceiveData>({ schedule_id: '', mode: 'auto', account_id: '', amount: '', date: today() });
    const { finance } = usePage<SharedData & { finance: { accounts: { id: number; name: string; type: string }[] } | null }>().props;
    const [topupFor, setTopupFor] = useState<Receivable | null>(null);
    const topup = useForm<{ account_id: string; amount: number | ''; date: string }>({ account_id: '', amount: '', date: today() });
    const openTopup = (r: Receivable) => {
        topup.clearErrors();
        topup.setData({ account_id: defaultAccount, amount: '', date: today() });
        setTopupFor(r);
    };

    const openForm = (r: Receivable | null) => {
        setEditing(r);
        form.clearErrors();
        form.setData(
            r
                ? {
                      counterparty: r.counterparty,
                      principal: r.principal,
                      interest_pct: String(r.interest_pct).replace('.', ','),
                      withdrawal: r.withdrawal,
                      withdrawal_change_month: r.withdrawal_change_month?.slice(0, 7) ?? '',
                      withdrawal_after: r.withdrawal_after ?? '',
                      due_day: String(r.due_day),
                      start_month: r.start_month.slice(0, 7),
                      agreement_url: r.agreement_url ?? '',
                      note: r.note ?? '',
                      account_id: '',
                      funded_date: today(),
                  }
                : empty,
        );
        setOpen(true);
    };

    const openReceive = (r: Receivable, s: ReceivableSchedule | null) => {
        receive.clearErrors();
        receive.setData(
            s
                ? { schedule_id: String(s.id), mode: 'auto', account_id: defaultAccount, amount: outstanding(s), date: today() }
                : { schedule_id: '', mode: 'principal', account_id: defaultAccount, amount: '', date: today() },
        );
        setReceiveFor({ r, s });
    };

    const submit = () => {
        form.transform((d) => ({
            ...d,
            interest_pct: d.interest_pct.replace(',', '.') || 0,
            withdrawal: d.withdrawal || 0,
            withdrawal_change_month: d.withdrawal_change_month || null,
            withdrawal_after: d.withdrawal_after === '' ? null : d.withdrawal_after,
            account_id: d.account_id || null,
            funded_date: d.account_id ? d.funded_date : null,
        }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('receivables.update', editing.id), options);
        else form.post(route('receivables.store'), options);
    };

    const totalRemaining = receivables.reduce((s, r) => s + r.remaining, 0);
    const thisMonth = today().slice(0, 7);
    const dueThisMonth = receivables
        .flatMap((r) => r.schedules.filter((s) => s.period.startsWith(thisMonth)))
        .reduce((s, x) => s + outstanding(x), 0);
    const late = receivables.flatMap((r) => r.schedules).filter((s) => s.status === 'late').length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Piutang')} />
            <Page>
                <PageHeader
                    title={t('Piutang')}
                    description={t('Dana milikmu di pihak lain yang kembali bertahap + bunga, misalnya investasi di teman.')}
                    actions={
                        <Button onClick={() => openForm(null)}>
                            <Plus /> {t('Tambah Piutang')}
                        </Button>
                    }
                />

                <div className="grid grid-cols-3 gap-3">
                    <StatCard label={t('Sisa Pokok')} value={compact(totalRemaining)} sub={rupiah(totalRemaining)} />
                    <StatCard label={t('Belum Diterima Bulan Ini')} value={compact(dueThisMonth)} sub={rupiah(dueThisMonth)} />
                    <StatCard
                        label={t('Terlambat')}
                        value={late}
                        sub={late ? t('jadwal lewat H+3') : t('semua aman')}
                        tone={late ? 'negative' : 'default'}
                    />
                </div>

                {receivables.length === 0 ? (
                    <EmptyState
                        icon={HandCoins}
                        title={t('Belum ada piutang')}
                        description={t('Catat dana di teman beserta bunga dan tarikan pokok per bulan agar jadwal penerimaan dibuat otomatis.')}
                        action={<Button onClick={() => openForm(null)}>{t('Tambah Piutang')}</Button>}
                    />
                ) : (
                    receivables.map((r) => {
                        const recent = [...r.schedules].reverse().slice(0, 6);
                        return (
                            <div key={r.id} className="bg-card rounded-xl border p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold">{r.counterparty}</div>
                                        <div className="text-muted-foreground text-xs">
                                            {t('Bunga :rate%/bln · tarik pokok :amount/bln', {
                                                rate: String(r.interest_pct).replace('.', ','),
                                                amount: compact(r.withdrawal),
                                            })}
                                            {r.withdrawal_change_month &&
                                                t(' → :amount mulai :month', {
                                                    amount: compact(r.withdrawal_after ?? 0),
                                                    month: monthLabel(r.withdrawal_change_month),
                                                })}{' '}
                                            {t('· tgl :day', { day: r.due_day })}
                                        </div>
                                        {r.note && <div className="text-muted-foreground text-xs">{r.note}</div>}
                                    </div>
                                    <div className="flex shrink-0">
                                        {r.agreement_url && (
                                            <Button variant="ghost" size="icon" className="size-8" asChild>
                                                <a href={r.agreement_url} target="_blank" rel="noreferrer" title={t('Dokumen perjanjian')}>
                                                    <ExternalLink className="size-4" />
                                                </a>
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(r)}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <DeleteButton url={route('receivables.destroy', r.id)} label={t('piutang :name', { name: r.counterparty })}>
                                            <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </DeleteButton>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-end justify-between gap-2">
                                    <div>
                                        <div className="text-muted-foreground text-xs">{t('Sisa pokok')}</div>
                                        <div className="text-lg font-bold tabular-nums">{rupiah(r.remaining)}</div>
                                    </div>
                                    <div className="text-muted-foreground text-right text-xs">
                                        {t('dari :amount', { amount: rupiah(r.principal + r.topped_up) })}
                                    </div>
                                </div>
                                <ProgressBar
                                    className="mt-2"
                                    value={percent(r.principal + r.topped_up - r.remaining, r.principal + r.topped_up)}
                                    color="#6366f1"
                                />
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                                    <Button size="sm" onClick={() => openReceive(r, null)} disabled={r.remaining <= 0}>
                                        <HandCoins /> {t('Tarik / Terima')}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openTopup(r)}>
                                        <Plus /> {t('Tambah pokok')}
                                    </Button>
                                </div>

                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[480px] text-sm">
                                        <thead className="text-muted-foreground text-left text-xs">
                                            <tr>
                                                <th className="py-1 font-medium">{t('Bulan')}</th>
                                                <th className="py-1 text-right font-medium">{t('Bunga')}</th>
                                                <th className="py-1 text-right font-medium">{t('Pokok')}</th>
                                                <th className="py-1 text-right font-medium">{t('Diterima')}</th>
                                                <th className="py-1 pl-2 font-medium">{t('Status')}</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {recent.map((s) => (
                                                <tr key={s.id}>
                                                    <td className="py-1.5">
                                                        {monthLabel(s.period)}
                                                        <span className="text-muted-foreground block text-xs">
                                                            {t('tgl :date', { date: formatDate(s.due_date, { day: 'numeric', month: 'short' }) })}
                                                        </span>
                                                    </td>
                                                    <td className="text-right tabular-nums">{compact(s.interest_due)}</td>
                                                    <td className="text-right tabular-nums">{compact(s.principal_due)}</td>
                                                    <td className="text-right tabular-nums">{compact(s.interest_received + s.principal_received)}</td>
                                                    <td className="pl-2">
                                                        <StatusBadge status={s.status} />
                                                    </td>
                                                    <td className="text-right">
                                                        {s.status !== 'received' && (
                                                            <Button size="sm" variant="outline" className="h-7" onClick={() => openReceive(r, s)}>
                                                                {t('Terima')}
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {r.history.length > 0 && (
                                    <div className="mt-3 border-t pt-2">
                                        <div className="text-muted-foreground mb-1 text-xs font-medium">{t('Riwayat dana')}</div>
                                        <ul className="divide-y text-sm">
                                            {r.history.map((h) => (
                                                <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                                                    <span className="min-w-0 truncate">
                                                        {formatDate(h.date, { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                                                        {h.kind === 'interest'
                                                            ? t('Bunga')
                                                            : h.kind === 'out'
                                                              ? t('Dana diberikan')
                                                              : h.kind === 'topup'
                                                                ? t('Tambah pokok')
                                                                : t('Tarik pokok')}
                                                        {h.account && (
                                                            <span className="text-muted-foreground">
                                                                {h.kind === 'out' || h.kind === 'topup' ? ' ← ' : ' → '}
                                                                {h.account}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {h.kind === 'out' || h.kind === 'topup' ? (
                                                        <span className="shrink-0 font-medium text-indigo-600 tabular-nums dark:text-indigo-400">
                                                            −{rupiah(h.amount)}
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 font-medium text-emerald-600 tabular-nums">
                                                            +{rupiah(h.amount)}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </Page>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={editing ? t('Ubah Piutang') : t('Tambah Piutang')}
                description={t('Jadwal bulanan dibuat dari bulan mulai sampai bulan depan. Bunga dihitung dari sisa pokok awal bulan.')}
                onSubmit={submit}
                processing={form.processing}
            >
                <Field label={t('Nama pihak')} error={form.errors.counterparty} htmlFor="rcv-name">
                    <Input
                        id="rcv-name"
                        value={form.data.counterparty}
                        onChange={(e) => form.setData('counterparty', e.target.value)}
                        placeholder={t('Investasi di teman')}
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Pokok pada bulan mulai')} error={form.errors.principal}>
                        <MoneyInput value={form.data.principal} onChange={(v) => form.setData('principal', v)} />
                    </Field>
                    <Field label={t('Bulan mulai')} error={form.errors.start_month} htmlFor="rcv-start">
                        <MonthPicker
                            id="rcv-start"
                            value={form.data.start_month}
                            onChange={(v) => form.setData('start_month', v)}
                            clearable={false}
                        />
                    </Field>
                    <Field label={t('Bunga (% per bulan)')} error={form.errors.interest_pct} htmlFor="rcv-rate">
                        <Input
                            id="rcv-rate"
                            inputMode="decimal"
                            value={form.data.interest_pct}
                            onChange={(e) => form.setData('interest_pct', e.target.value)}
                        />
                    </Field>
                    <Field label={t('Tarik pokok per bulan')} error={form.errors.withdrawal}>
                        <MoneyInput value={form.data.withdrawal} onChange={(v) => form.setData('withdrawal', v)} />
                    </Field>
                    <Field label={t('Tanggal janji bayar')} error={form.errors.due_day} htmlFor="rcv-due">
                        <Input
                            id="rcv-due"
                            type="number"
                            min={1}
                            max={31}
                            value={form.data.due_day}
                            onChange={(e) => form.setData('due_day', e.target.value)}
                        />
                    </Field>
                    <Field label={t('Link dokumen perjanjian')} error={form.errors.agreement_url} htmlFor="rcv-url">
                        <Input
                            id="rcv-url"
                            value={form.data.agreement_url}
                            onChange={(e) => form.setData('agreement_url', e.target.value)}
                            placeholder={t('Opsional')}
                        />
                    </Field>
                    <Field label={t('Tarikan berubah mulai')} error={form.errors.withdrawal_change_month} htmlFor="rcv-change">
                        <MonthPicker
                            id="rcv-change"
                            value={form.data.withdrawal_change_month}
                            onChange={(v) => form.setData('withdrawal_change_month', v)}
                        />
                    </Field>
                    <Field label={t('Tarik pokok setelahnya')} error={form.errors.withdrawal_after}>
                        <MoneyInput
                            value={form.data.withdrawal_after}
                            onChange={(v) => form.setData('withdrawal_after', v)}
                            placeholder={t('0 = ambil bunga saja')}
                        />
                    </Field>
                </div>
                <Field label={t('Catatan')} error={form.errors.note} htmlFor="rcv-note">
                    <Input id="rcv-note" value={form.data.note} onChange={(e) => form.setData('note', e.target.value)} placeholder={t('Opsional')} />
                </Field>
                {!editing && (
                    <div className="grid gap-3 rounded-lg border p-3">
                        <Field label={t('Dana diambil dari rekening (opsional)')} error={(form.errors as Record<string, string>).account_id}>
                            <Select value={form.data.account_id || 'none'} onValueChange={(v) => form.setData('account_id', v === 'none' ? '' : v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('Tidak, sudah tercatat / dana lama')}</SelectItem>
                                    <AccountOptions accounts={finance?.accounts ?? []} />
                                </SelectContent>
                            </Select>
                        </Field>
                        {form.data.account_id && (
                            <Field label={t('Tanggal diberikan')} error={(form.errors as Record<string, string>).funded_date} htmlFor="rcv-funded">
                                <Input
                                    id="rcv-funded"
                                    type="date"
                                    value={form.data.funded_date}
                                    onChange={(e) => form.setData('funded_date', e.target.value)}
                                />
                            </Field>
                        )}
                        <p className="text-muted-foreground text-xs">
                            {t('Saldo rekening berkurang sebesar pokok, tapi tidak dihitung sebagai pengeluaran karena uangnya masih milikmu.')}
                        </p>
                    </div>
                )}
            </FormDialog>

            <FormDialog
                open={topupFor !== null}
                onOpenChange={(o) => !o && setTopupFor(null)}
                title={t('Tambah pokok :name', { name: topupFor?.counterparty ?? '' })}
                description={t('Uang dari rekening ditambahkan ke dana di pihak lain. Bunga bulan berikutnya dihitung dari pokok yang baru.')}
                processing={topup.processing}
                onSubmit={() =>
                    topupFor && topup.post(route('receivables.topup', topupFor.id), { preserveScroll: true, onSuccess: () => setTopupFor(null) })
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Nominal')} error={topup.errors.amount}>
                        <MoneyInput value={topup.data.amount} onChange={(v) => topup.setData('amount', v)} autoFocus />
                    </Field>
                    <Field label={t('Tanggal')} error={topup.errors.date} htmlFor="topup-date">
                        <Input id="topup-date" type="date" value={topup.data.date} onChange={(e) => topup.setData('date', e.target.value)} />
                    </Field>
                </div>
                <Field label={t('Dari rekening')} error={topup.errors.account_id}>
                    <AccountSelect value={topup.data.account_id} onChange={(v) => topup.setData('account_id', v)} />
                </Field>
            </FormDialog>

            <FormDialog
                open={receiveFor !== null}
                onOpenChange={(o) => !o && setReceiveFor(null)}
                title={t('Terima dari :name', { name: receiveFor?.r.counterparty ?? '' })}
                description={
                    receiveFor?.s
                        ? t('Jadwal :month. Dialokasikan ke bunga dulu, sisanya ke pokok.', { month: monthLabel(receiveFor.s.period, 'long') })
                        : t('Sisa pokok :amount. Dicatat langsung sebagai uang masuk ke rekening yang dipilih.', {
                              amount: rupiah(receiveFor?.r.remaining ?? 0),
                          })
                }
                processing={receive.processing}
                onSubmit={() => {
                    if (!receiveFor) return;
                    receive.transform((d) => ({ ...d, schedule_id: d.schedule_id || null }));
                    receive.post(route('receivables.receive', receiveFor.r.id), { preserveScroll: true, onSuccess: () => setReceiveFor(null) });
                }}
            >
                {receiveFor && !receiveFor.s && (
                    <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                        {(['principal', 'auto'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                className={cn('rounded-md py-1.5 text-sm font-medium', receive.data.mode === m && 'bg-background shadow-sm')}
                                onClick={() => receive.setData('mode', m)}
                            >
                                {m === 'principal' ? t('Tarik pokok') : t('Bunga + pokok')}
                            </button>
                        ))}
                    </div>
                )}
                {receiveFor?.s && (
                    <div className="bg-muted/50 grid grid-cols-2 gap-2 rounded-lg p-3 text-sm">
                        <span className="text-muted-foreground">{t('Bunga belum diterima')}</span>
                        <span className="text-right tabular-nums">
                            {rupiah(Math.max(0, receiveFor.s.interest_due - receiveFor.s.interest_received))}
                        </span>
                        <span className="text-muted-foreground">{t('Pokok belum diterima')}</span>
                        <span className="text-right tabular-nums">
                            {rupiah(Math.max(0, receiveFor.s.principal_due - receiveFor.s.principal_received))}
                        </span>
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Nominal diterima')} error={receive.errors.amount}>
                        <MoneyInput value={receive.data.amount} onChange={(v) => receive.setData('amount', v)} autoFocus />
                    </Field>
                    <Field label={t('Tanggal')} error={receive.errors.date} htmlFor="rcv-date">
                        <Input id="rcv-date" type="date" value={receive.data.date} onChange={(e) => receive.setData('date', e.target.value)} />
                    </Field>
                </div>
                <Field label={t('Masuk ke rekening')} error={receive.errors.account_id}>
                    <AccountSelect value={receive.data.account_id} onChange={(v) => receive.setData('account_id', v)} />
                </Field>
                {receiveFor && !receiveFor.s && (
                    <p className="text-muted-foreground text-xs">
                        {receive.data.mode === 'principal'
                            ? t('Seluruh nominal mengurangi sisa pokok. Bunga bulan berikutnya otomatis dihitung dari sisa pokok baru.')
                            : t('Bunga bulan tanggal terima dibayar dulu, sisanya mengurangi pokok.')}
                    </p>
                )}
            </FormDialog>
        </AppLayout>
    );
}
