import { Input } from '@/components/ui/input';

/** Input persen, menerima koma atau titik sebagai desimal. */
export function PercentInput({ value, onChange, id, suffix = '%' }: { value: number; onChange: (v: number) => void; id?: string; suffix?: string }) {
    return (
        <div className="relative">
            <Input
                id={id}
                inputMode="decimal"
                value={String(value).replace('.', ',')}
                onChange={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'));
                    onChange(Number.isFinite(v) ? v : 0);
                }}
                className="pr-12"
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{suffix}</span>
        </div>
    );
}
