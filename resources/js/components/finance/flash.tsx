import { usePage } from '@inertiajs/react';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Flash() {
    const { flash } = usePage<{ flash: { success: string | null } }>().props;
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!flash?.success) return;
        setMessage(flash.success);
        const t = setTimeout(() => setMessage(null), 2500);
        return () => clearTimeout(t);
    }, [flash]);

    if (!message) return null;

    return (
        <div className="animate-in fade-in slide-in-from-top-2 fixed top-4 left-1/2 z-50 -translate-x-1/2">
            <div className="bg-foreground text-background flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg">
                <CheckCircle2 className="size-4 text-emerald-400" />
                {message}
            </div>
        </div>
    );
}
