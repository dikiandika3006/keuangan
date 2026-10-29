import { locale, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { HTMLAttributes, useState } from 'react';

const LANGUAGES: { value: Locale; label: string }[] = [
    { value: 'id', label: 'Bahasa Indonesia' },
    { value: 'en', label: 'English' },
];

/** Pilihan bahasa; setelah disimpan halaman dimuat ulang agar semua teks ikut berganti. */
export default function LanguageTabs({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
    const [saving, setSaving] = useState(false);

    const change = (value: Locale) => {
        if (value === locale || saving) return;
        router.put(
            route('locale.update'),
            { locale: value },
            { preserveScroll: true, onStart: () => setSaving(true), onSuccess: () => window.location.reload(), onFinish: () => setSaving(false) },
        );
    };

    return (
        <div className={cn('inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800', className)} {...props}>
            {LANGUAGES.map(({ value, label }) => (
                <button
                    key={value}
                    type="button"
                    disabled={saving}
                    onClick={() => change(value)}
                    className={cn(
                        'rounded-md px-3.5 py-1.5 text-sm transition-colors',
                        locale === value
                            ? 'bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100'
                            : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-700/60',
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
