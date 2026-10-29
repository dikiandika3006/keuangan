import { MoneyInput } from '@/components/finance/money-input';
import { ColorPicker, DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { ACCOUNT_TYPES, COLORS, daysFromToday, formatDate, rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Account, type AccountType } from '@/types/finance';
import { Head, router, useForm } from '@inertiajs/react';
import { Archive, DatabaseBackup, Pencil, PiggyBank, Plus, Scale, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Rekening'), href: '/accounts' }];

type FormData = {
    name: string;
    type: AccountType;
    initial_balance: number | '';
    color: string;
    is_emergency_fund: boolean;
    is_archived: boolean;
    // Khusus Dompet Tujuan: isi rutin per bulan
    monthly_allocation: number | '';
    funding_account_id: string;
    allocation_day: string;
};

const EMPTY_ALLOCATION = { monthly_allocation: '' as const, funding_account_id: '', allocation_day: '' };

export default function Accounts({ accounts, weeklyExpense }: { accounts: Account[]; weeklyExpense: number }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Account | null>(null);
    const form = useForm<FormData>({
        name: '',
        type: 'bank',
        initial_balance: '',
        color: COLORS[0],
        is_emergency_fund: false,
        is_archived: false,
        ...EMPTY_ALLOCATION,
    });
    const [reconcileFor, setReconcileFor] = useState<Account | null>(null);
    const reconcile = useForm<{ actual_balance: number | ''; date: string }>({ actual_balance: '', date: today() });

    const openForm = (a: Account | null, type: AccountType = 'bank') => {
        setEditing(a);
        form.clearErrors();
        form.setData(
            a
                ? {
                      name: a.name,
                      type: a.type,
                      initial_balance: a.initial_balance,
                      color: a.color,
                      is_emergency_fund: a.is_emergency_fund,
                      is_archived: a.is_archived,
                      monthly_allocation: a.allocation?.amount ?? '',
                      funding_account_id: a.allocation?.account_id ? String(a.allocation.account_id) : '',
                      allocation_day: a.allocation?.due_day ? String(a.allocation.due_day) : '',
                  }
                : {
                      name: '',
                      type,
                      initial_balance: '',
                      color: COLORS[accounts.length % COLORS.length],
                      is_emergency_fund: false,
                      is_archived: false,
                      ...EMPTY_ALLOCATION,
                  },
        );
        setOpen(true);
    };

    const openReconcile = (a: Account) => {
        reconcile.clearErrors();
        reconcile.setData({ actual_balance: '', date: today() });
        setReconcileFor(a);
    };

    // BR-23: selisih besar kemungkinan ada transaksi penting yang belum dicatat
    const reconcileDiff = reconcileFor && reconcile.data.actual_balance !== '' ? reconcileFor.balance - reconcile.data.actual_balance : 0;
    const bigDiff = weeklyExpense > 0 && Math.abs(reconcileDiff) > weeklyExpense * 0.2;
    const active = accounts.filter((a) => !a.is_archived);
    // Aktif dulu, yang diarsipkan di belakang
    const ordered = [...active, ...accounts.filter((a) => a.is_archived)];
    const groups = [
        {
            key: 'accounts',
            title: t('Rekening'),
            icon: Wallet,
            description: t('Bank, tunai, e-wallet, dan investasi.'),
            empty: t('Belum ada rekening.'),
            items: ordered.filter((a) => a.type !== 'pocket'),
        },
        {
            key: 'pockets',
            title: t('Dompet Tujuan'),
            icon: PiggyBank,
            description: t('Uang yang sudah dialokasikan (kesehatan, tabungan anak, dll.). Tidak dihitung sebagai uang siap pakai.'),
            empty: t('Belum ada dompet. Contoh: Kesehatan, Tabungan Jaxon, Tabungan Oliver.'),
            items: ordered.filter((a) => a.type === 'pocket'),
        },
    ];

    const submit = () => {
        form.transform((d) => ({
            ...d,
            initial_balance: d.initial_balance || 0,
            monthly_allocation: d.type === 'pocket' ? d.monthly_allocation || null : null,
            funding_account_id: d.funding_account_id || null,
            allocation_day: d.allocation_day || null,
        }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('accounts.update', editing.id), options);
        else form.post(route('accounts.store'), options);
    };

    const total = accounts.reduce((s, a) => s + a.balance, 0);
    const byType = Object.keys(ACCOUNT_TYPES)
        .map((ty) => ({ type: ty, total: accounts.filter((a) => a.type === ty).reduce((s, a) => s + a.balance, 0) }))
        .filter((ty) => ty.total !== 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Rekening')} />
            <Page>
                <PageHeader
                    title={t('Rekening & Aset')}
                    description={t('Semua tempat uangmu disimpan: bank, tunai, e-wallet, dan investasi.')}
                    actions={
                        <>
                            <Button variant="outline" onClick={() => router.post(route('backup.run'), {}, { preserveScroll: true })}>
                                <DatabaseBackup /> {t('Backup')}
                            </Button>
                            <Button variant="outline" onClick={() => openForm(null, 'pocket')}>
                                <PiggyBank /> {t('Tambah Dompet')}
                            </Button>
                            <Button onClick={() => openForm(null)}>
                                <Plus /> {t('Tambah Rekening')}
                            </Button>
                        </>
                    }
                />

                <p className="text-muted-foreground -mt-2 text-sm">
                    {t('Catat transaksi penting saja. Seminggu sekali tekan')} <b>{t('Cocokkan')}</b>{' '}
                    {t('dan ketik saldo dari m-banking; selisihnya otomatis dicatat sebagai pengeluaran/pemasukan tidak dirinci.')}
                </p>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <StatCard label={t('Total Saldo')} value={rupiah(total)} icon={Wallet} />
                    {byType.map((ty) => (
                        <StatCard key={ty.type} label={ACCOUNT_TYPES[ty.type]} value={rupiah(ty.total)} />
                    ))}
                </div>

                {accounts.length === 0 ? (
                    <EmptyState
                        icon={Wallet}
                        title={t('Belum ada rekening')}
                        description={t('Tambahkan rekening beserta saldo saat ini sebagai titik awal pencatatan.')}
                        action={<Button onClick={() => openForm(null)}>{t('Tambah Rekening')}</Button>}
                    />
                ) : (
                    groups.map((g) => (
                        <section key={g.key} className="grid gap-3">
                            <div className="flex items-end justify-between gap-2 border-b pb-2">
                                <div>
                                    <h2 className="flex items-center gap-2 font-semibold">
                                        <g.icon className="size-4" /> {g.title}
                                        <span className="text-muted-foreground text-xs font-normal">{g.items.length}</span>
                                    </h2>
                                    <p className="text-muted-foreground text-xs">{g.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-muted-foreground text-xs">{t('Total')}</div>
                                    <div className="font-semibold tabular-nums">{rupiah(g.items.reduce((s, a) => s + a.balance, 0))}</div>
                                </div>
                            </div>
                            {g.items.length === 0 ? (
                                <div className="text-muted-foreground flex flex-col items-start gap-2 rounded-xl border border-dashed p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    {g.empty}
                                    <Button size="sm" variant="outline" onClick={() => openForm(null, g.key === 'pockets' ? 'pocket' : 'bank')}>
                                        <Plus /> {g.key === 'pockets' ? t('Tambah Dompet') : t('Tambah Rekening')}
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {g.items.map((a) => (
                                        <div
                                            key={a.id}
                                            className={cn('bg-card relative overflow-hidden rounded-xl border p-4', a.is_archived && 'opacity-60')}
                                        >
                                            <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: a.color }} />
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold">{a.name}</div>
                                                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                                                        {ACCOUNT_TYPES[a.type]}
                                                        {a.is_emergency_fund && (
                                                            <span className="flex items-center gap-0.5 text-emerald-600">
                                                                · <ShieldCheck className="size-3" /> {t('Dana darurat')}
                                                            </span>
                                                        )}
                                                        {a.is_archived && (
                                                            <span className="flex items-center gap-0.5">
                                                                · <Archive className="size-3" /> {t('Diarsipkan')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex">
                                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(a)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <DeleteButton url={route('accounts.destroy', a.id)} label={t('rekening :name', { name: a.name })}>
                                                        <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </DeleteButton>
                                                </div>
                                            </div>
                                            <div className={cn('mt-3 text-xl font-bold tabular-nums', a.balance < 0 && 'text-red-600')}>
                                                {rupiah(a.balance)}
                                            </div>
                                            {a.type === 'pocket' && (
                                                <div className="text-muted-foreground mt-0.5 text-xs">
                                                    {a.allocation
                                                        ? t('Diisi :amount/bln', { amount: rupiah(a.allocation.amount) }) +
                                                          (a.allocation.account_id
                                                              ? t(' dari :name', {
                                                                    name: accounts.find((x) => x.id === a.allocation!.account_id)?.name ?? '-',
                                                                })
                                                              : '') +
                                                          (a.allocation.due_day ? t(' · tgl :day', { day: a.allocation.due_day }) : '')
                                                        : t('Belum ada isi rutin')}
                                                </div>
                                            )}
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <ReconcileInfo account={a} />
                                                {!a.is_archived && a.type !== 'investment' && (
                                                    <Button size="sm" variant="outline" onClick={() => openReconcile(a)}>
                                                        <Scale /> {t('Cocokkan')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    ))
                )}
            </Page>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={
                    form.data.type === 'pocket'
                        ? editing
                            ? t('Ubah Dompet')
                            : t('Tambah Dompet Tujuan')
                        : editing
                          ? t('Ubah Rekening')
                          : t('Tambah Rekening')
                }
                description={t('Saldo awal = saldo saat mulai dicatat. Saldo berjalan dihitung otomatis dari transaksi.')}
                onSubmit={submit}
                processing={form.processing}
            >
                <Field label={t('Nama')} error={form.errors.name} htmlFor="name">
                    <Input
                        id="name"
                        value={form.data.name}
                        onChange={(e) => form.setData('name', e.target.value)}
                        placeholder={form.data.type === 'pocket' ? t('Kesehatan, Tabungan Jaxon...') : t('BCA, Dompet, Reksa Dana...')}
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Jenis')} error={form.errors.type}>
                        <Select value={form.data.type} onValueChange={(v) => form.setData('type', v as AccountType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(ACCOUNT_TYPES).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('Saldo awal')} error={form.errors.initial_balance}>
                        <MoneyInput value={form.data.initial_balance} onChange={(v) => form.setData('initial_balance', v)} allowNegative />
                    </Field>
                </div>
                <Field label={t('Warna')}>
                    <ColorPicker value={form.data.color} onChange={(c) => form.setData('color', c)} colors={COLORS} />
                </Field>
                {form.data.type === 'pocket' && (
                    <fieldset className="grid gap-3 rounded-lg border p-3">
                        <legend className="px-1 text-sm font-medium">{t('Isi rutin tiap bulan')}</legend>
                        <p className="text-muted-foreground -mt-1 text-xs">
                            {t('Muncul tiap bulan di')} <b>{t('Biaya Bulanan')}</b> {t('dengan tombol')} <b>{t('Isi')}</b>{' '}
                            {t(
                                '(dicatat sebagai transfer ke dompet ini). Belanja untuk keperluan dompet ini dibayar dari dompet ini. Kosongkan jika tidak diisi rutin.',
                            )}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label={t('Per bulan')} error={form.errors.monthly_allocation}>
                                <MoneyInput value={form.data.monthly_allocation} onChange={(v) => form.setData('monthly_allocation', v)} />
                            </Field>
                            <Field label={t('Diambil dari')} error={form.errors.funding_account_id}>
                                <Select
                                    value={form.data.funding_account_id || 'none'}
                                    onValueChange={(v) => form.setData('funding_account_id', v === 'none' ? '' : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('Pilih saat mengisi')}</SelectItem>
                                        {active
                                            .filter((x) => x.type !== 'pocket' && x.id !== editing?.id)
                                            .map((x) => (
                                                <SelectItem key={x.id} value={String(x.id)}>
                                                    {x.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={t('Tanggal isi')} error={form.errors.allocation_day} htmlFor="alloc-day">
                                <Input
                                    id="alloc-day"
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={form.data.allocation_day}
                                    onChange={(e) => form.setData('allocation_day', e.target.value)}
                                    placeholder="1–31"
                                />
                            </Field>
                        </div>
                    </fieldset>
                )}
                <label className={cn('flex items-start gap-2 text-sm', form.data.type === 'pocket' && 'hidden')}>
                    <Checkbox checked={form.data.is_emergency_fund} onCheckedChange={(c) => form.setData('is_emergency_fund', c === true)} />
                    <span>
                        {t('Tandai sebagai')} <b>{t('dana darurat')}</b>
                        <span className="text-muted-foreground block text-xs">
                            {t('Jika tidak ada yang ditandai, semua saldo non-investasi dihitung sebagai dana darurat.')}
                        </span>
                    </span>
                </label>
                {editing && (
                    <label className="flex items-start gap-2 text-sm">
                        <Checkbox checked={form.data.is_archived} onCheckedChange={(c) => form.setData('is_archived', c === true)} />
                        <span>
                            <b>{t('Arsipkan')}</b> {t('rekening')}
                            <span className="text-muted-foreground block text-xs">
                                {t('Tidak bisa dipakai transaksi baru; riwayat tetap tersimpan.')}
                            </span>
                        </span>
                    </label>
                )}
            </FormDialog>

            <FormDialog
                open={reconcileFor !== null}
                onOpenChange={(o) => !o && setReconcileFor(null)}
                title={t('Cocokkan saldo :name', { name: reconcileFor?.name ?? '' })}
                description={t('Ketik saldo sebenarnya dari m-banking / dompet. Selisihnya dicatat otomatis.')}
                submitLabel={t('Cocokkan')}
                processing={reconcile.processing}
                onSubmit={() =>
                    reconcileFor &&
                    reconcile.post(route('accounts.reconcile', reconcileFor.id), { preserveScroll: true, onSuccess: () => setReconcileFor(null) })
                }
            >
                <div className="bg-muted/50 flex justify-between rounded-lg p-3 text-sm">
                    <span className="text-muted-foreground">{t('Saldo di aplikasi')}</span>
                    <span className="font-semibold tabular-nums">{rupiah(reconcileFor?.balance ?? 0)}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Saldo sebenarnya')} error={reconcile.errors.actual_balance}>
                        <MoneyInput
                            value={reconcile.data.actual_balance}
                            onChange={(v) => reconcile.setData('actual_balance', v)}
                            allowNegative
                            autoFocus
                        />
                    </Field>
                    <Field label={t('Per tanggal')} error={reconcile.errors.date} htmlFor="rec-date">
                        <Input
                            id="rec-date"
                            type="date"
                            max={today()}
                            value={reconcile.data.date}
                            onChange={(e) => reconcile.setData('date', e.target.value)}
                        />
                    </Field>
                </div>
                {reconcile.data.actual_balance !== '' && (
                    <p className="text-sm">
                        {reconcileDiff === 0 ? (
                            <span className="text-emerald-600">{t('Saldo sudah cocok.')}</span>
                        ) : (
                            <>
                                {t('Selisih|rekonsiliasi')} <b className="tabular-nums">{rupiah(Math.abs(reconcileDiff))}</b>{' '}
                                {t('akan dicatat sebagai')} <b>{reconcileDiff > 0 ? t('Pengeluaran Tidak Dirinci') : t('Pemasukan Tidak Dirinci')}</b>
                                .
                            </>
                        )}
                    </p>
                )}
                {bigDiff && (
                    <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        {t(
                            'Selisihnya cukup besar (lebih dari 20% pengeluaran mingguan rata-rata). Mungkin ada transaksi penting yang belum dicatat, misalnya cicilan atau transfer?',
                        )}
                    </p>
                )}
            </FormDialog>
        </AppLayout>
    );
}

function ReconcileInfo({ account }: { account: Account }) {
    if (account.type === 'investment')
        return <span className="text-muted-foreground text-xs">{t('Saldo awal :amount', { amount: rupiah(account.initial_balance) })}</span>;
    if (!account.last_reconciled_at) return <span className="text-xs text-amber-600">{t('Belum pernah dicocokkan')}</span>;
    const days = -daysFromToday(account.last_reconciled_at);
    return (
        <span className={cn('text-xs', days > 7 ? 'text-amber-600' : 'text-muted-foreground')}>
            {t('Cocok :date', { date: formatDate(account.last_reconciled_at, { day: 'numeric', month: 'short' }) })}
            {days > 0 ? t(' · :n hari lalu', { n: days }) : t(' · hari ini')}
        </span>
    );
}
