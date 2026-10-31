import { AccountOptions } from '@/components/finance/account-select';
import { MoneyInput } from '@/components/finance/money-input';
import { Field, FormDialog } from '@/components/finance/ui';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { compact, today } from '@/lib/format';
import { jsonFetch } from '@/lib/http';
import { t } from '@/lib/i18n';
import { parseQuick } from '@/lib/quick';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { type Category } from '@/types/finance';
import { router, usePage } from '@inertiajs/react';
import { Sparkles, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface FinanceShared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[]; categories: Category[] } | null;
}

type Kind = 'expense' | 'income';
type Frequent = { type: Kind; account_id: number; category_id: number; note: string | null; amount: number; count: number };
type Suggestion = { category_id: number | null; account_id: number | null; type: Kind | null; source: 'rule' | 'history' | null };

export type FullFormDefaults = { type: Kind; category_id: string; note: string; amount: number | ''; account_id: string };

/**
 * Catat cepat: ketik "35rb makan siang" → nominal, catatan, kategori & rekening ditebak dari aturan/riwayat.
 * Transaksi yang sering dicatat tampil sebagai tombol satu-ketuk.
 */
export function QuickEntry({
    open,
    onOpenChange,
    onFullForm,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onFullForm: (d: FullFormDefaults) => void;
}) {
    const { finance } = usePage<FinanceShared>().props;
    const accounts = finance?.accounts ?? [];
    const categories = finance?.categories ?? [];

    const [text, setText] = useState('');
    const [type, setType] = useState<Kind>('expense');
    const [amount, setAmount] = useState<number | ''>('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [date, setDate] = useState(today());
    const [source, setSource] = useState<Suggestion['source']>(null);
    const [frequent, setFrequent] = useState<Frequent[]>([]);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const touched = useRef({ category: false, account: false, amount: false, type: false });

    useEffect(() => {
        if (!open) return;
        setText('');
        setType('expense');
        setAmount('');
        setCategoryId('');
        setAccountId(accounts[0] ? String(accounts[0].id) : '');
        setDate(today());
        setSource(null);
        setErrors({});
        touched.current = { category: false, account: false, amount: false, type: false };
        jsonFetch<Frequent[]>(route('transactions.frequent'))
            .then(setFrequent)
            .catch(() => setFrequent([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const parsed = parseQuick(text);

    // Nominal & jenis dari ketikan; kategori/rekening ditebak setelah berhenti mengetik sebentar
    useEffect(() => {
        if (!touched.current.amount) setAmount(parsed.amount ?? '');
        if (!touched.current.type && parsed.income) setType('income');
        if (!parsed.note) return;
        const timer = setTimeout(() => {
            jsonFetch<Suggestion>(route('transactions.suggest', parsed.income ? { note: parsed.note, type: 'income' } : { note: parsed.note }))
                .then((s) => {
                    setSource(s.source);
                    if (s.type && !touched.current.type && !parsed.income) setType(s.type);
                    if (s.category_id && !touched.current.category) setCategoryId(String(s.category_id));
                    if (s.account_id && !touched.current.account) setAccountId(String(s.account_id));
                })
                .catch(() => undefined);
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    const save = (data: {
        type: Kind;
        account_id: string | number;
        category_id: string | number;
        amount: number | '';
        note: string;
        date: string;
    }) => {
        router.post(route('transactions.store'), data, {
            preserveScroll: true,
            onStart: () => setProcessing(true),
            onFinish: () => setProcessing(false),
            onError: (e) => setErrors(e),
            onSuccess: () => onOpenChange(false),
        });
    };

    const options = categories.filter((c) => c.type === type);
    const nameOf = (id: number) => categories.find((c) => c.id === id)?.name ?? '';

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('Catat Cepat')}
            onSubmit={() => save({ type, account_id: accountId, category_id: categoryId, amount, note: parsed.note, date })}
            processing={processing}
        >
            {frequent.length > 0 && (
                <div className="grid gap-1.5">
                    <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                        <Zap className="size-3.5" /> {t('Sering dicatat, ketuk untuk simpan hari ini')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {frequent.map((f, i) => (
                            <button
                                key={i}
                                type="button"
                                disabled={processing}
                                onClick={() => save({ ...f, note: f.note ?? '', date: today() })}
                                className={cn(
                                    'rounded-full border px-3 py-1 text-xs active:scale-95',
                                    f.type === 'income' ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'hover:bg-muted',
                                )}
                            >
                                {f.note || nameOf(f.category_id)} · {compact(f.amount)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <Field label={t('Ketik nominal & catatan')} error={errors.amount ?? errors.note} htmlFor="quick-text">
                <Input
                    id="quick-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t('mis. 35rb makan siang · +2jt bonus')}
                    autoFocus
                    autoComplete="off"
                    enterKeyHint="done"
                />
            </Field>

            <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                {(['expense', 'income'] as const).map((k) => (
                    <button
                        key={k}
                        type="button"
                        data-active={type === k}
                        onClick={() => {
                            touched.current.type = true;
                            setType(k);
                            setCategoryId('');
                        }}
                        className={cn(
                            'rounded-md py-1.5 text-sm font-medium',
                            k === 'expense' ? 'data-[active=true]:bg-red-600' : 'data-[active=true]:bg-emerald-600',
                            'data-[active=true]:text-white',
                        )}
                    >
                        {k === 'expense' ? t('Pengeluaran') : t('Pemasukan')}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Field label={t('Nominal')} error={errors.amount}>
                    <MoneyInput
                        value={amount}
                        onChange={(v) => {
                            touched.current.amount = true;
                            setAmount(v);
                        }}
                    />
                </Field>
                <Field label={t('Tanggal')} htmlFor="quick-date">
                    <Input id="quick-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label={t('Kategori')} error={errors.category_id}>
                    <Select
                        value={categoryId}
                        onValueChange={(v) => {
                            touched.current.category = true;
                            setCategoryId(v);
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t('Pilih kategori')} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((c) => (
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
                <Field label={t('Rekening')} error={errors.account_id}>
                    <Select
                        value={accountId}
                        onValueChange={(v) => {
                            touched.current.account = true;
                            setAccountId(v);
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t('Pilih rekening')} />
                        </SelectTrigger>
                        <SelectContent>
                            <AccountOptions accounts={accounts} />
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                    {source && (
                        <>
                            <Sparkles className="size-3.5" />
                            {source === 'rule' ? t('Kategori dari aturan otomatis') : t('Kategori ditebak dari riwayat')}
                        </>
                    )}
                </span>
                <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                        onOpenChange(false);
                        onFullForm({ type, category_id: categoryId, note: parsed.note, amount, account_id: accountId });
                    }}
                >
                    {t('Form lengkap (pecah, tag, bukti)')}
                </button>
            </div>
        </FormDialog>
    );
}
