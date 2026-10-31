import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { X } from 'lucide-react';
import { useState } from 'react';

/** Input tag: ketik lalu Enter/koma untuk menambah; saran dari tag yang sudah pernah dipakai. */
export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
    const [text, setText] = useState('');
    const has = (name: string) => value.some((v) => v.toLowerCase() === name.toLowerCase());
    const add = (name: string) => {
        const clean = name.trim().slice(0, 50);
        if (clean && !has(clean) && value.length < 10) onChange([...value, clean]);
        setText('');
    };
    const matches = suggestions.filter((s) => !has(s) && (text === '' || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 6);

    return (
        <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
                {value.map((tag) => (
                    <span key={tag} className="bg-muted flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                        #{tag}
                        <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} aria-label={t('Hapus')}>
                            <X className="size-3" />
                        </button>
                    </span>
                ))}
                <Input
                    id="tags"
                    value={text}
                    onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && text.trim()) {
                            e.preventDefault();
                            add(text);
                        } else if (e.key === 'Backspace' && !text && value.length) {
                            onChange(value.slice(0, -1));
                        }
                    }}
                    onBlur={() => text.trim() && add(text)}
                    placeholder={value.length ? '' : t('mis. Renovasi, Liburan Bali')}
                    className="h-7 min-w-24 flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
                />
            </div>
            {matches.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {matches.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => add(s)}
                            className="text-muted-foreground hover:bg-muted rounded-full border px-2 py-0.5 text-xs"
                        >
                            +{s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
