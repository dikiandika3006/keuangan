import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';

const parse = (text: string) => {
    const v = parseFloat(text.replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
};

/**
 * Input persen, menerima koma atau titik sebagai desimal. Teks ketikan disimpan sendiri supaya
 * "1," atau "1,0" tidak langsung berubah jadi "1" sebelum selesai mengetik.
 */
export function PercentInput({ value, onChange, id, suffix = '%' }: { value: number; onChange: (v: number) => void; id?: string; suffix?: string }) {
    const [text, setText] = useState(() => String(value).replace('.', ','));

    // Nilai diubah dari luar (mis. tombol Reset) → tampilkan nilai baru
    useEffect(() => {
        if (parse(text) !== value) setText(String(value).replace('.', ','));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <div className="relative">
            <Input
                id={id}
                inputMode="decimal"
                value={text}
                onChange={(e) => {
                    const next = e.target.value.replace(/[^\d.,-]/g, '');
                    setText(next);
                    onChange(parse(next));
                }}
                className="pr-12"
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{suffix}</span>
        </div>
    );
}
