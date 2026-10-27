import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MoneyInputProps {
    id?: string;
    value: number | '';
    onChange: (value: number | '') => void;
    allowNegative?: boolean;
    className?: string;
    placeholder?: string;
    autoFocus?: boolean;
}

/** Input nominal rupiah dengan pemisah ribuan otomatis. */
export function MoneyInput({ id, value, onChange, allowNegative, className, placeholder = '0', autoFocus }: MoneyInputProps) {
    const display = value === '' ? '' : (value < 0 ? '-' : '') + Math.abs(value).toLocaleString('id-ID');

    return (
        <div className={cn('relative', className)}>
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">Rp</span>
            <Input
                id={id}
                inputMode="numeric"
                className="pl-9 tabular-nums"
                value={display}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(e) => {
                    const raw = e.target.value;
                    const negative = allowNegative && raw.trim().startsWith('-');
                    const digits = raw.replace(/\D/g, '');
                    if (!digits) return onChange(negative ? (0 as number) : '');
                    const n = parseInt(digits, 10);
                    onChange(negative ? -n : n);
                }}
            />
        </div>
    );
}
