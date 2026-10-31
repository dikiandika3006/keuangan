import { MoneyInput } from '@/components/finance/money-input';
import { Field, FormDialog, Section } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, monthLabel, rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Link, router, useForm } from '@inertiajs/react';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { useState } from 'react';

/** Satu baris pemasukan bulan berjalan di Proyeksi: rencana vs yang sudah benar-benar masuk. */
export interface RealizationLine {
    key: string;
    label: string;
    kind: 'scenario' | 'recurring' | 'receivable';
    planned: number;
    realized: number;
    remaining: number;
}

export interface UnlinkedIncome {
    id: number;
    amount: number;
    date: string;
    note: string | null;
    category: { id: number; name: string } | null;
}

type Option = { id: number; name: string };

/**
 * Tombol Realisasi per pemasukan: catat yang masuk (boleh beda dari rencana) atau tautkan pemasukan yang sudah
 * dicatat lewat form Transaksi. Setelah itu Proyeksi memakai angka aktual, jadi rencana tidak terhitung dua kali.
 */
export function IncomeRealization({
    lines,
    accounts,
    categories,
    unlinked,
}: {
    lines: RealizationLine[];
    accounts: Option[];
    categories: Option[];
    unlinked: UnlinkedIncome[];
}) {
    const [line, setLine] = useState<RealizationLine | null>(null);
    const form = useForm({
        mode: 'new' as 'new' | 'link',
        transaction_id: '',
        amount: 0 as number | '',
        date: today(),
        account_id: '',
        category_id: '',
    });

    if (lines.length === 0) {
        return null;
    }

    const open = (l: RealizationLine) => {
        // Kategori bawaan: yang namanya mirip baris ini (mis. "Gaji"), supaya Rekap tetap rapi
        const guess = categories.find(
            (c) => l.label.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(l.label.toLowerCase()),
        );
        form.clearErrors();
        form.setData({
            mode: 'new',
            transaction_id: unlinked[0] ? String(unlinked[0].id) : '',
            amount: l.planned,
            date: today(),
            account_id: accounts[0] ? String(accounts[0].id) : '',
            category_id: l.kind === 'scenario' && guess ? String(guess.id) : '',
        });
        setLine(l);
    };

    const submit = () => {
        if (!line) return;
        form.transform((d) =>
            d.mode === 'link'
                ? { key: line.key, transaction_id: d.transaction_id }
                : { key: line.key, amount: d.amount, date: d.date, account_id: d.account_id, category_id: d.category_id || null },
        );
        form.post(route('projection.realize'), { preserveScroll: true, onSuccess: () => setLine(null) });
    };

    const unlink = (l: RealizationLine) => router.post(route('projection.unrealize'), { key: l.key }, { preserveScroll: true });
    const totalPlanned = lines.reduce((s, l) => s + l.planned, 0);
    const totalRealized = lines.reduce((s, l) => s + l.realized, 0);

    return (
        <Section title={t('Realisasi Pemasukan :month', { month: monthLabel(today(), 'long') })}>
            <p className="text-muted-foreground mb-3 text-sm">
                {t(
                    'Catat berapa yang benar-benar masuk. Setelah direalisasi, proyeksi bulan ini memakai angka aktual dan rencananya tidak dihitung lagi.',
                )}
            </p>
            <div className="-mx-4 divide-y">
                {lines.map((l) => {
                    const done = l.realized > 0;
                    const diff = l.realized - l.planned;
                    return (
                        <div key={l.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 font-medium">
                                    {done && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                                    <span className="truncate">{l.label}</span>
                                </div>
                                <div className="text-muted-foreground text-xs tabular-nums">
                                    {t('Rencana :amount', { amount: rupiah(l.planned) })}
                                    {done && (
                                        <>
                                            {' · '}
                                            <span className="text-foreground">{t('masuk :amount', { amount: rupiah(l.realized) })}</span>
                                            {diff !== 0 && (
                                                <span className={cn('ml-1', diff > 0 ? 'text-emerald-600' : 'text-red-600')}>
                                                    ({diff > 0 ? '+' : ''}
                                                    {rupiah(diff)})
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            {l.kind === 'receivable' ? (
                                <Button size="sm" variant="outline" asChild>
                                    <Link href={route('receivables.index')}>{t('Terima di Piutang')}</Link>
                                </Button>
                            ) : done ? (
                                <Button size="sm" variant="ghost" onClick={() => unlink(l)} title={t('Lepas tautan realisasi')}>
                                    <Undo2 className="size-4" />
                                </Button>
                            ) : (
                                <Button size="sm" onClick={() => open(l)}>
                                    {t('Realisasi')}
                                </Button>
                            )}
                        </div>
                    );
                })}
                <div className="flex justify-between px-4 pt-2.5 text-sm font-medium tabular-nums">
                    <span>{t('Total')}</span>
                    <span>
                        {rupiah(totalRealized)} <span className="text-muted-foreground font-normal">/ {rupiah(totalPlanned)}</span>
                    </span>
                </div>
            </div>

            <FormDialog
                open={line !== null}
                onOpenChange={(o) => !o && setLine(null)}
                title={t('Realisasi :name', { name: line?.label ?? '' })}
                description={t('Rencana :amount. Isi angka yang benar-benar masuk, boleh lebih atau kurang.', { amount: rupiah(line?.planned ?? 0) })}
                onSubmit={submit}
                processing={form.processing}
            >
                {unlinked.length > 0 && (
                    <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1 text-sm">
                        {(
                            [
                                ['new', t('Catat baru')],
                                ['link', t('Sudah dicatat')],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => form.setData('mode', value)}
                                className={cn(
                                    'rounded-md px-3 py-1.5',
                                    form.data.mode === value ? 'bg-background shadow-xs' : 'text-muted-foreground',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                {form.data.mode === 'link' ? (
                    <Field label={t('Pemasukan bulan ini yang belum ditautkan')} error={form.errors.transaction_id}>
                        <Select value={form.data.transaction_id} onValueChange={(v) => form.setData('transaction_id', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {unlinked.map((u) => (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                        {formatDate(u.date, { day: 'numeric', month: 'short' })} · {rupiah(u.amount)} ·{' '}
                                        {u.note || u.category?.name || t('Pemasukan')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                ) : (
                    <>
                        <Field label={t('Jumlah masuk')} error={form.errors.amount}>
                            <MoneyInput value={form.data.amount} onChange={(v) => form.setData('amount', v)} />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t('Tanggal')} error={form.errors.date} htmlFor="realize-date">
                                <Input id="realize-date" type="date" value={form.data.date} onChange={(e) => form.setData('date', e.target.value)} />
                            </Field>
                            <Field label={t('Masuk ke rekening')} error={form.errors.account_id}>
                                <Select value={form.data.account_id} onValueChange={(v) => form.setData('account_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Pilih rekening')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts.map((a) => (
                                            <SelectItem key={a.id} value={String(a.id)}>
                                                {a.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        {line?.kind === 'scenario' && (
                            <Field label={t('Kategori')} error={form.errors.category_id}>
                                <Select
                                    value={form.data.category_id || 'none'}
                                    onValueChange={(v) => form.setData('category_id', v === 'none' ? '' : v)}
                                >
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
                    </>
                )}
            </FormDialog>
        </Section>
    );
}
