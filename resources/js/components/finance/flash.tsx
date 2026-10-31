import { usePage } from '@inertiajs/react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Message = { text: string; error: boolean };

export function Flash() {
    const { flash } = usePage<{ flash: { success: string | null; error: string | null } }>().props;
    const [message, setMessage] = useState<Message | null>(null);

    useEffect(() => {
        const text = flash?.error ?? flash?.success;
        if (!text) return;
        const error = !!flash?.error;
        setMessage({ text, error });
        // Pesan gagal ditampilkan lebih lama supaya sempat terbaca
        const t = setTimeout(() => setMessage(null), error ? 6000 : 2500);
        return () => clearTimeout(t);
    }, [flash]);

    if (!message) return null;

    return (
        <div className="animate-in fade-in slide-in-from-top-2 fixed top-4 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
            <div
                role={message.error ? 'alert' : 'status'}
                className="bg-foreground text-background flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg"
                onClick={() => setMessage(null)}
            >
                {message.error ? (
                    <AlertCircle className="size-4 shrink-0 text-red-400" />
                ) : (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                )}
                {message.text}
            </div>
        </div>
    );
}
