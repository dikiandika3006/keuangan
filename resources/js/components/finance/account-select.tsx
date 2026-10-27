import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';

interface FinanceShared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[] } | null;
}

/** Isi dropdown rekening, dikelompokkan: Rekening lalu Dompet Tujuan. */
export function AccountOptions({ accounts }: { accounts: { id: number; name: string; type?: string }[] }) {
    const groups = [
        { label: 'Rekening', items: accounts.filter((a) => a.type !== 'pocket') },
        { label: 'Dompet Tujuan', items: accounts.filter((a) => a.type === 'pocket') },
    ].filter((g) => g.items.length > 0);

    // Tanpa dompet tidak perlu judul kelompok
    if (groups.length === 1) {
        return groups[0].items.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
            </SelectItem>
        ));
    }

    return groups.map((g, i) => (
        <SelectGroup key={g.label}>
            {i > 0 && <SelectSeparator />}
            <SelectLabel className="text-muted-foreground text-xs">{g.label}</SelectLabel>
            {g.items.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                </SelectItem>
            ))}
        </SelectGroup>
    ));
}

/** Pilihan rekening aktif (tidak diarsipkan) dari shared props. */
export function AccountSelect({
    value,
    onChange,
    placeholder = 'Pilih rekening',
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const accounts = usePage<FinanceShared>().props.finance?.accounts ?? [];

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <AccountOptions accounts={accounts} />
            </SelectContent>
        </Select>
    );
}

export function useDefaultAccountId(): string {
    const accounts = usePage<FinanceShared>().props.finance?.accounts ?? [];
    const first = accounts.find((a) => a.type !== 'investment') ?? accounts[0];
    return first ? String(first.id) : '';
}
