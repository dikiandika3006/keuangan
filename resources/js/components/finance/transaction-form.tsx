import { AccountOptions } from '@/components/finance/account-select';
import { MoneyInput } from '@/components/finance/money-input';
import { Field, FormDialog } from '@/components/finance/ui';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { type Category, type Transaction, type TxType } from '@/types/finance';
import { Link, useForm, usePage } from '@inertiajs/react';
import { useEffect } from 'react';

interface FinanceShared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[]; categories: Category[] } | null;
}

const TYPES: { value: TxType; label: string; className: string }[] = [
    { value: 'expense', label: 'Pengeluaran', className: 'data-[active=true]:bg-red-600 data-[active=true]:text-white' },
    { value: 'income', label: 'Pemasukan', className: 'data-[active=true]:bg-emerald-600 data-[active=true]:text-white' },
    { value: 'transfer', label: 'Transfer', className: 'data-[active=true]:bg-blue-600 data-[active=true]:text-white' },
];

type FormData = {
    type: TxType;
    account_id: string;
    to_account_id: string;
    category_id: string;
    amount: number | '';
    date: string;
    note: string;
};

export function TransactionForm({
    open,
    onOpenChange,
    transaction,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    transaction?: Transaction | null;
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
    });

    useEffect(() => {
        if (!open) return;
        form.clearErrors();
        if (transaction) {
            form.setData({
                type: transaction.type,
                account_id: String(transaction.account_id),
                to_account_id: transaction.to_account_id ? String(transaction.to_account_id) : '',
                category_id: transaction.category_id ? String(transaction.category_id) : '',
                amount: transaction.amount,
                date: transaction.date,
                note: transaction.note ?? '',
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
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, transaction]);

    const submit = () => {
        const options = { preserveScroll: true, onSuccess: () => onOpenChange(false) };
        if (transaction) form.put(route('transactions.update', transaction.id), options);
        else form.post(route('transactions.store'), options);
    };

    const { data, setData, errors } = form;
    const filteredCategories = categories.filter((c) => c.type === data.type);

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={transaction ? 'Ubah Transaksi' : 'Catat Transaksi'}
            onSubmit={submit}
            processing={form.processing}
        >
            {accounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    Belum ada rekening.{' '}
                    <Link href={route('accounts.index')} className="text-primary underline" onClick={() => onOpenChange(false)}>
                        Tambah rekening dulu
                    </Link>
                    .
                </p>
            ) : (
                <>
                    <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
                        {TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                data-active={data.type === t.value}
                                className={cn('rounded-md px-2 py-1.5 text-sm font-medium transition', t.className)}
                                onClick={() => setData((d) => ({ ...d, type: t.value, category_id: '' }))}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <Field label="Nominal" error={errors.amount} htmlFor="amount">
                        <MoneyInput id="amount" value={data.amount} onChange={(v) => setData('amount', v)} autoFocus />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={data.type === 'transfer' ? 'Dari rekening' : 'Rekening'} error={errors.account_id}>
                            <Select value={data.account_id} onValueChange={(v) => setData('account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih rekening" />
                                </SelectTrigger>
                                <SelectContent>
                                    <AccountOptions accounts={accounts} />
                                </SelectContent>
                            </Select>
                        </Field>

                        {data.type === 'transfer' ? (
                            <Field label="Ke rekening" error={errors.to_account_id}>
                                <Select value={data.to_account_id} onValueChange={(v) => setData('to_account_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih rekening tujuan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <AccountOptions accounts={accounts.filter((a) => String(a.id) !== data.account_id)} />
                                    </SelectContent>
                                </Select>
                            </Field>
                        ) : (
                            <Field label="Kategori" error={errors.category_id}>
                                <Select value={data.category_id} onValueChange={(v) => setData('category_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih kategori" />
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
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Tanggal" error={errors.date} htmlFor="date">
                            <Input id="date" type="date" value={data.date} onChange={(e) => setData('date', e.target.value)} />
                        </Field>
                        <Field label="Catatan" error={errors.note} htmlFor="note">
                            <Input id="note" value={data.note} onChange={(e) => setData('note', e.target.value)} placeholder="Opsional" />
                        </Field>
                    </div>
                </>
            )}
        </FormDialog>
    );
}
