import { MoneyInput } from '@/components/finance/money-input';
import { MonthPicker } from '@/components/finance/month-picker';
import { DeleteButton, Section } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { compact, monthLabel, rupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { type Category, type RecurringItem } from '@/types/finance';
import { router, usePage } from '@inertiajs/react';
import { Check, Loader2, Plus, Repeat, Trash2, X } from 'lucide-react';
import { FocusEvent, KeyboardEvent, ReactNode, useState } from 'react';

type Kind = 'expense' | 'income';

// [nama, kategori yang otomatis dipilih bila ada]
const PRESETS: Record<Kind, [string, string][]> = {
    expense: [
        ['Listrik', 'Tagihan & Utilitas'],
        ['Air PDAM', 'Tagihan & Utilitas'],
        ['Internet', 'Tagihan & Utilitas'],
        ['Pulsa & paket data', 'Tagihan & Utilitas'],
        ['BPJS Kesehatan', 'Kesehatan'],
        ['Biaya kesehatan', 'Kesehatan'],
        ['Asuransi', 'Kesehatan'],
        ['Les / kursus anak', 'Pendidikan'],
        ['Bensin', 'Transportasi'],
        ['Uang orang tua', 'Keluarga & Sosial'],
        ['Sedekah / persembahan', 'Persembahan'],
        ['Arisan', 'Keluarga & Sosial'],
        ['Langganan streaming', 'Hiburan'],
        ['Iuran RT / sampah', 'Tagihan & Utilitas'],
    ],
    income: [
        ['Gaji pasangan', 'Gaji'],
        ['Sewa / kos', 'Lainnya'],
        ['Usaha sampingan', 'Usaha / Freelance'],
        ['Tunjangan', 'Lainnya'],
    ],
};

interface Draft {
    name: string;
    amount: number | '';
    category: string; // id kategori atau ''
    dueDay: string;
    start: string; // 'YYYY-MM' atau ''
    end: string;
}

const toMonth = (date: string | null) => (date ? date.slice(0, 7) : '');
const startDate = (month: string) => (month ? `${month}-01` : null);
function endDate(month: string) {
    if (!month) return null;
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isActive(item: { start_date: string | null; end_date: string | null }, month: string) {
    return (!item.start_date || item.start_date.slice(0, 7) <= month) && (!item.end_date || item.end_date.slice(0, 7) >= month);
}

function periodText(start: string, end: string) {
    if (!start && !end) return 'Setiap bulan, seterusnya';
    if (start && !end) return `Mulai ${monthLabel(start)}, seterusnya`;
    if (!start && end) return `Sampai ${monthLabel(end)}`;
    return `${monthLabel(start)} – ${monthLabel(end)}`;
}

function payload(d: Draft, type: Kind) {
    return {
        name: d.name.trim(),
        type,
        amount: d.amount || 0,
        category_id: d.category || null,
        due_day: d.dueDay || null,
        start_date: startDate(d.start),
        end_date: endDate(d.end),
    };
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-0.5">
            <span className="text-muted-foreground text-[11px] md:sr-only">{label}</span>
            {children}
        </div>
    );
}

/** Satu baris yang bisa diedit langsung; tersimpan otomatis saat fokus keluar dari baris. */
function ItemRow({
    initial,
    type,
    categories,
    itemId,
    autoFocusAmount,
    onSaved,
    onCancel,
}: {
    initial: Draft;
    type: Kind;
    categories: Category[];
    itemId?: number;
    autoFocusAmount?: boolean;
    onSaved?: () => void;
    onCancel?: () => void;
}) {
    const [d, setD] = useState<Draft>(initial);
    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const isNew = itemId === undefined;
    const dirty = JSON.stringify(d) !== JSON.stringify(initial);
    const valid = d.name.trim() !== '' && Number(d.amount) > 0;

    const save = (next: Draft = d) => {
        if (JSON.stringify(next) === JSON.stringify(initial) || !(next.name.trim() !== '' && Number(next.amount) > 0) || state === 'saving') return;
        const options = {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setState('saving'),
            onError: (e: Record<string, string>) => {
                setErrors(e);
                setState('idle');
            },
            onSuccess: () => {
                setErrors({});
                setState('saved');
                onSaved?.();
            },
        };
        if (isNew) router.post(route('recurring.store'), payload(next, type), options);
        else router.put(route('recurring.update', itemId), payload(next, type), options);
    };

    // Pilihan dari dropdown (kategori, bulan) langsung disimpan untuk baris yang sudah ada
    const change = (next: Draft) => {
        setD(next);
        if (!isNew) save(next);
    };

    const onBlur = (e: FocusEvent<HTMLDivElement>) => {
        const to = e.relatedTarget as HTMLElement | null;
        // Dropdown kategori/bulan dirender di luar baris (portal), jangan dianggap keluar baris
        if (e.currentTarget.contains(to) || to?.closest('[role="listbox"], [role="menu"]')) return;
        save();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
            save();
        }
        if (e.key === 'Escape' && isNew) onCancel?.();
    };

    const error = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k]}</p>;

    return (
        <div onBlur={onBlur} onKeyDown={onKeyDown} className={cn('grid gap-2 py-3', isNew && 'bg-muted/40 -mx-2 rounded-lg px-2')}>
            <div className="grid gap-2 md:grid-cols-[1fr_170px_150px_150px_auto] md:items-start md:gap-3">
                <div>
                    <Input
                        value={d.name}
                        onChange={(e) => setD({ ...d, name: e.target.value })}
                        placeholder="Nama, mis. Listrik"
                        aria-label="Nama"
                        autoFocus={isNew && !initial.name}
                    />
                    {error('name')}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 md:contents">
                    <div>
                        <MoneyInput value={d.amount} onChange={(v) => setD({ ...d, amount: v })} autoFocus={autoFocusAmount} />
                        {error('amount')}
                    </div>
                    <div className="flex items-center gap-1 md:order-last">
                        <span
                            className="flex size-8 items-center justify-center"
                            title={state === 'saving' ? 'Menyimpan…' : dirty ? 'Belum tersimpan' : 'Tersimpan'}
                        >
                            {state === 'saving' ? (
                                <Loader2 className="text-muted-foreground size-4 animate-spin" />
                            ) : dirty ? (
                                <span className={cn('size-2 rounded-full', valid ? 'bg-amber-500' : 'bg-muted-foreground/40')} />
                            ) : state === 'saved' ? (
                                <Check className="size-4 text-emerald-600" />
                            ) : null}
                        </span>
                        {isNew ? (
                            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onCancel} aria-label="Batal">
                                <X className="size-4" />
                            </Button>
                        ) : (
                            <DeleteButton url={route('recurring.destroy', itemId)} label={d.name || 'item'}>
                                <Button type="button" variant="ghost" size="icon" className="size-8 text-red-600" aria-label="Hapus">
                                    <Trash2 className="size-4" />
                                </Button>
                            </DeleteButton>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:contents">
                    <Labeled label="Mulai">
                        <MonthPicker value={d.start} onChange={(v) => change({ ...d, start: v })} placeholder="Sudah berjalan" />
                    </Labeled>
                    <Labeled label="Sampai">
                        <MonthPicker value={d.end} onChange={(v) => change({ ...d, end: v })} placeholder="Seterusnya" />
                        {error('end_date')}
                    </Labeled>
                </div>
            </div>
            <div className="grid grid-cols-[1fr_110px] items-center gap-2 md:grid-cols-[1fr_170px_auto] md:gap-3">
                <Select
                    value={d.category || 'none'}
                    onValueChange={(v) => change({ ...d, category: v === 'none' ? '' : v })}
                >
                    <SelectTrigger className="h-8 text-xs" aria-label="Kategori">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Tanpa kategori</SelectItem>
                        {categories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                                <span className="flex items-center gap-2">
                                    <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                    {c.name}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    type="number"
                    min={1}
                    max={31}
                    value={d.dueDay}
                    onChange={(e) => setD({ ...d, dueDay: e.target.value })}
                    placeholder="Tgl bayar"
                    aria-label="Tanggal bayar"
                    className="h-8 text-xs"
                />
                <p className="text-muted-foreground col-span-2 text-xs md:col-span-1">
                    {periodText(d.start, d.end)}
                    {d.dueDay && ` · tiap tgl ${d.dueDay}`}
                    {isNew && !valid && ' · isi nama & nominal, tersimpan otomatis'}
                </p>
            </div>
            {error('due_day')}
        </div>
    );
}

export function FixedItemsEditor({ items, defaultTab = 'expense' }: { items: RecurringItem[]; defaultTab?: Kind }) {
    const { finance } = usePage<SharedData & { finance: { categories: Category[] } | null }>().props;
    const [tab, setTab] = useState<Kind>(defaultTab);
    const [drafts, setDrafts] = useState<{ key: number; name: string; category: string }[]>([]);
    const month = currentMonth();

    const categories = (finance?.categories ?? []).filter((c) => c.type === tab);
    const list = items.filter((i) => i.type === tab);
    const totalNow = (type: Kind) => items.filter((i) => i.type === type && isActive(i, month)).reduce((s, i) => s + i.amount, 0);
    const usedNames = new Set(list.map((i) => i.name.toLowerCase()));

    const addDraft = (name = '', categoryName = '') => {
        const category = categories.find((c) => c.name === categoryName);
        setDrafts((ds) => [...ds, { key: Date.now(), name, category: category ? String(category.id) : '' }]);
    };
    const removeDraft = (key: number) => setDrafts((ds) => ds.filter((x) => x.key !== key));

    return (
        <Section
            title={
                <span className="flex items-center gap-2">
                    <Repeat className="size-4" /> Daftar Biaya & Pemasukan Tetap
                </span>
            }
        >
            <p className="text-muted-foreground mb-3 text-sm">
                Nominal per bulan. Kosongkan <b>Mulai</b> jika sudah berjalan, kosongkan <b>Sampai</b> jika seterusnya. Berlaku di semua skenario dan
                tersimpan otomatis.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                    {(['expense', 'income'] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            data-active={tab === k}
                            onClick={() => {
                                setTab(k);
                                setDrafts([]);
                            }}
                            className="data-[active=true]:bg-background rounded-md px-3 py-1.5 text-sm font-medium transition data-[active=true]:shadow-sm"
                        >
                            {k === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
                            <span className={cn('ml-1.5 text-xs tabular-nums', k === 'expense' ? 'text-red-600' : 'text-emerald-600')}>
                                {compact(totalNow(k))}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="text-muted-foreground text-xs">
                    Bulan ini: <span className="text-foreground font-semibold tabular-nums">{rupiah(totalNow(tab))}</span>
                </div>
            </div>

            <div className="text-muted-foreground mt-4 hidden grid-cols-[1fr_170px_130px_130px_auto] gap-3 border-b pb-1 text-xs font-medium md:grid">
                <span>Nama · kategori</span>
                <span>Per bulan · tgl bayar</span>
                <span>Mulai</span>
                <span>Sampai</span>
                <span className="w-[68px]" />
            </div>

            <div className="divide-y">
                {list.map((item) => (
                    <ItemRow
                        key={`${item.id}-${item.updated_at}`}
                        itemId={item.id}
                        type={tab}
                        categories={categories}
                        initial={{
                            name: item.name,
                            amount: item.amount,
                            category: item.category_id ? String(item.category_id) : '',
                            dueDay: item.due_day ? String(item.due_day) : '',
                            start: toMonth(item.start_date),
                            end: toMonth(item.end_date),
                        }}
                    />
                ))}
                {drafts.map((dr) => (
                    <ItemRow
                        key={dr.key}
                        type={tab}
                        categories={categories}
                        autoFocusAmount={dr.name !== ''}
                        initial={{ name: dr.name, amount: '', category: dr.category, dueDay: '', start: '', end: '' }}
                        onSaved={() => removeDraft(dr.key)}
                        onCancel={() => removeDraft(dr.key)}
                    />
                ))}
                {list.length === 0 && drafts.length === 0 && (
                    <p className="text-muted-foreground py-6 text-center text-sm">Belum ada. Pilih contoh di bawah atau tambah sendiri.</p>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                <Button type="button" size="sm" onClick={() => addDraft()}>
                    <Plus /> Tambah
                </Button>
                {PRESETS[tab]
                    .filter(([p]) => !usedNames.has(p.toLowerCase()) && !drafts.some((d) => d.name === p))
                    .map(([p, cat]) => (
                        <button key={p} type="button" onClick={() => addDraft(p, cat)} className="hover:bg-muted rounded-full border px-3 py-1 text-xs transition">
                            + {p}
                        </button>
                    ))}
            </div>
        </Section>
    );
}
