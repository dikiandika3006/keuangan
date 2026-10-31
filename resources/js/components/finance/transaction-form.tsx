import { AccountOptions } from '@/components/finance/account-select';
import { AttachmentPicker } from '@/components/finance/attachment-picker';
import { MoneyInput } from '@/components/finance/money-input';
import { TagInput } from '@/components/finance/tag-input';
import { Field, FormDialog } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rupiah, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { type Category, type Transaction, type TxType } from '@/types/finance';
import { Link, useForm, usePage } from '@inertiajs/react';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';

interface FinanceShared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[]; categories: Category[]; tags: string[] } | null;
}

const TYPES: { value: TxType; label: string; className: string }[] = [
    { value: 'expense', label: t('Pengeluaran'), className: 'data-[active=true]:bg-red-600 data-[active=true]:text-white' },
    { value: 'income', label: t('Pemasukan'), className: 'data-[active=true]:bg-emerald-600 data-[active=true]:text-white' },
    { value: 'transfer', label: t('Transfer'), className: 'data-[active=true]:bg-blue-600 data-[active=true]:text-white' },
];

type FormData = {
    type: TxType;
    account_id: string;
    to_account_id: string;
    category_id: string;
    amount: number | '';
    date: string;
    note: string;
    attachment: File | null;
    remove_attachment: boolean;
    tags: string[];
    /** Pecah transaksi: satu struk → beberapa kategori (hanya transaksi baru) */
    splits: { category_id: string; amount: number | ''; note: string }[];
};

export function TransactionForm({
    open,
    onOpenChange,
    transaction,
    defaults,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    transaction?: Transaction | null;
    /** Nilai awal untuk transaksi baru, mis. dari halaman Titipan */
    defaults?: Partial<Pick<FormData, 'type' | 'category_id' | 'note' | 'amount' | 'account_id'>>;
}) {
    const { finance } = usePage<FinanceShared>().props;
    const accounts = finance?.accounts ?? [];
    const categories = finance?.categories ?? [];

    const form = useForm<FormData>({
        type: 'expense',
        account_id: '',
        to_account_id: '',
        category_id: '',
        amount: '',
        date: today(),
        note: '',
        attachment: null,
        remove_attachment: false,
        tags: [],
        splits: [],
    });

    useEffect(() => {
        if (!open) return;
        form.clearErrors();
        if (transaction) {
            form.setData({
                type: transaction.type,
                account_id: transaction.account_id ? String(transaction.account_id) : '',
                to_account_id: transaction.to_account_id ? String(transaction.to_account_id) : '',
                category_id: transaction.category_id ? String(transaction.category_id) : '',
                amount: transaction.amount,
                date: transaction.date,
                note: transaction.note ?? '',
                attachment: null,
                remove_attachment: false,
                tags: transaction.tags?.map((tg) => tg.name) ?? [],
                splits: [],
            });
        } else {
            form.setData({
                type: 'expense',
                account_id: accounts[0] ? String(accounts[0].id) : '',
                to_account_id: '',
                category_id: '',
                amount: '',
                date: today(),
                note: '',
                attachment: null,
                remove_attachment: false,
                tags: [],
                splits: [],
                ...defaults,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, transaction]);

    const submit = () => {
        // File hanya bisa dikirim lewat POST multipart; ubah data memakai method spoofing PUT
        const options = { preserveScroll: true, forceFormData: true, onSuccess: () => onOpenChange(false) };
        form.transform(({ splits, ...d }) => ({
            ...d,
            remove_attachment: d.remove_attachment ? 1 : 0,
            // Daftar tag kosong tidak ikut terkirim di multipart; penanda ini memberi tahu server untuk tetap menyinkronkan
            tags_present: 1,
            ...(splits.length ? { splits, amount: splits.reduce((s, x) => s + (Number(x.amount) || 0), 0) } : {}),
            ...(transaction ? { _method: 'put' } : {}),
        }));
        if (transaction) form.post(route('transactions.update', transaction.id), options);
        else form.post(route('transactions.store'), options);
    };

    const { data, setData, errors } = form;
    const filteredCategories = categories.filter((c) => c.type === data.type);
    // Titipan bisa masuk (diterima) maupun keluar (diteruskan)
    const titipanCategories = categories.filter((c) => c.type === 'titipan');
    // Titipan dicatat tanpa rekening dan hanya tampil di halaman Titipan
    const isTitipan = titipanCategories.some((c) => String(c.id) === data.category_id);
    const splitTotal = data.splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const setSplit = (i: number, patch: Partial<FormData['splits'][number]>) =>
        setData(
            'splits',
            data.splits.map((s, j) => (j === i ? { ...s, ...patch } : s)),
        );

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={transaction ? t('Ubah Transaksi') : t('Catat Transaksi')}
            onSubmit={submit}
            processing={form.processing}
        >
            {accounts.length === 0 && !isTitipan ? (
                <p className="text-muted-foreground text-sm">
                    {t('Belum ada rekening.')}{' '}
                    <Link href={route('accounts.index')} className="text-primary underline" onClick={() => onOpenChange(false)}>
                        {t('Tambah rekening dulu')}
                    </Link>
                    .
                </p>
            ) : (
                <>
                    <div className={cn('bg-muted grid gap-1 rounded-lg p-1', isTitipan ? 'grid-cols-2' : 'grid-cols-3')}>
                        {TYPES.filter((ty) => !isTitipan || ty.value !== 'transfer').map((ty) => (
                            <button
                                key={ty.value}
                                type="button"
                                data-active={data.type === ty.value}
                                className={cn('rounded-md px-2 py-1.5 text-sm font-medium transition', ty.className)}
                                onClick={() => setData((d) => ({ ...d, type: ty.value, category_id: isTitipan ? d.category_id : '' }))}
                            >
                                {ty.label}
                            </button>
                        ))}
                    </div>

                    {data.splits.length === 0 && (
                        <Field label={t('Nominal')} error={errors.amount} htmlFor="amount">
                            <MoneyInput id="amount" value={data.amount} onChange={(v) => setData('amount', v)} autoFocus />
                        </Field>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        {!isTitipan && (
                            <Field label={data.type === 'transfer' ? t('Dari rekening') : t('Rekening')} error={errors.account_id}>
                                <Select value={data.account_id} onValueChange={(v) => setData('account_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Pilih rekening')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <AccountOptions accounts={accounts} />
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}

                        {data.type === 'transfer' ? (
                            <Field label={t('Ke rekening')} error={errors.to_account_id}>
                                <Select value={data.to_account_id} onValueChange={(v) => setData('to_account_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Pilih rekening tujuan')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <AccountOptions accounts={accounts.filter((a) => String(a.id) !== data.account_id)} />
                                    </SelectContent>
                                </Select>
                            </Field>
                        ) : data.splits.length > 0 ? null : (
                            <Field label={t('Kategori')} error={errors.category_id}>
                                <Select value={data.category_id} onValueChange={(v) => setData('category_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Pilih kategori')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filteredCategories.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                <span className="flex items-center gap-2">
                                                    <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                                    {c.name}
                                                </span>
                                            </SelectItem>
                                        ))}
                                        {titipanCategories.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>{t('Titipan / dana lewat (tidak dihitung)')}</SelectLabel>
                                                {titipanCategories.map((c) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>
                                                        <span className="flex items-center gap-2">
                                                            <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                                            {c.name}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                    </SelectContent>
                                </Select>
                                {isTitipan && (
                                    <p className="text-muted-foreground text-xs">
                                        {data.type === 'income' ? t('Uang titipan diterima') : t('Titipan diteruskan/dipakai')} ·{' '}
                                        {t('tanpa rekening, hanya tercatat di halaman Titipan')}
                                    </p>
                                )}
                            </Field>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t('Tanggal')} error={errors.date} htmlFor="date">
                            <Input id="date" type="date" value={data.date} onChange={(e) => setData('date', e.target.value)} />
                        </Field>
                        <Field label={t('Catatan')} error={errors.note} htmlFor="note">
                            <Input id="note" value={data.note} onChange={(e) => setData('note', e.target.value)} placeholder={t('Opsional')} />
                        </Field>
                    </div>

                    {!transaction && data.type !== 'transfer' && !isTitipan && (
                        <div className="grid gap-2 rounded-lg border p-3">
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    checked={data.splits.length > 0}
                                    onChange={(e) =>
                                        setData(
                                            'splits',
                                            e.target.checked
                                                ? [
                                                      { category_id: data.category_id, amount: data.amount, note: '' },
                                                      { category_id: '', amount: '', note: '' },
                                                  ]
                                                : [],
                                        )
                                    }
                                />
                                {t('Pecah ke beberapa kategori')}
                            </label>
                            {data.splits.length > 0 && (
                                <>
                                    {data.splits.map((s, i) => (
                                        <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                                            <Select value={s.category_id} onValueChange={(v) => setSplit(i, { category_id: v })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('Kategori')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {filteredCategories.map((c) => (
                                                        <SelectItem key={c.id} value={String(c.id)}>
                                                            {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <MoneyInput value={s.amount} onChange={(v) => setSplit(i, { amount: v })} />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                disabled={data.splits.length <= 2}
                                                onClick={() =>
                                                    setData(
                                                        'splits',
                                                        data.splits.filter((_, j) => j !== i),
                                                    )
                                                }
                                                aria-label={t('Hapus baris')}
                                            >
                                                <X className="size-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between text-xs">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={data.splits.length >= 10}
                                            onClick={() => setData('splits', [...data.splits, { category_id: '', amount: '', note: '' }])}
                                        >
                                            <Plus /> {t('Baris')}
                                        </Button>
                                        <span className="text-muted-foreground tabular-nums">
                                            {t('Total :amount', { amount: rupiah(splitTotal) })}
                                        </span>
                                    </div>
                                    {(errors as Record<string, string>)['splits.0.category_id'] && (
                                        <p className="text-xs text-red-600">{t('Pilih kategori & isi nominal tiap baris.')}</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <Field label={t('Tag')} htmlFor="tags">
                        <TagInput value={data.tags} onChange={(v) => setData('tags', v)} suggestions={finance?.tags ?? []} />
                    </Field>

                    <AttachmentPicker
                        file={data.attachment}
                        onFileChange={(f) => setData('attachment', f)}
                        existing={transaction?.attachment_url ? { url: transaction.attachment_url, name: transaction.attachment_name ?? null } : null}
                        removed={data.remove_attachment}
                        onRemovedChange={(r) => setData('remove_attachment', r)}
                        error={errors.attachment}
                    />
                    {form.progress && <progress value={form.progress.percentage} max={100} className="h-1 w-full" />}
                </>
            )}
        </FormDialog>
    );
}
