import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { LucideIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                {description && <p className="text-muted-foreground text-sm">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

export function Page({ children }: { children: ReactNode }) {
    return <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 pb-24 md:gap-6 md:p-6 md:pb-6">{children}</div>;
}

export function StatCard({
    label,
    value,
    sub,
    icon: Icon,
    tone = 'default',
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    icon?: LucideIcon;
    tone?: 'default' | 'positive' | 'negative';
}) {
    return (
        <div className="bg-card rounded-xl border p-4">
            <div className="text-muted-foreground flex items-center justify-between text-xs font-medium sm:text-sm">
                <span>{label}</span>
                {Icon && <Icon className="size-4" />}
            </div>
            <div
                className={cn(
                    'mt-1 truncate text-lg font-semibold tabular-nums sm:text-2xl',
                    tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                    tone === 'negative' && 'text-red-600 dark:text-red-400',
                )}
            >
                {value}
            </div>
            {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
        </div>
    );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('bg-card rounded-xl border', className)}>
            {(title || action) && (
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <h2 className="font-semibold">{title}</h2>
                    {action}
                </div>
            )}
            <div className="p-4">{children}</div>
        </section>
    );
}

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
    return (
        <div className={cn('bg-muted h-2 w-full overflow-hidden rounded-full', className)}>
            <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color ?? 'var(--primary)' }}
            />
        </div>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="bg-muted rounded-full p-3">
                <Icon className="text-muted-foreground size-6" />
            </div>
            <p className="font-medium">{title}</p>
            {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    className={cn('size-7 rounded-full border-2 transition', value === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                />
            ))}
        </div>
    );
}

/** Tombol hapus dengan dialog konfirmasi. */
export function DeleteButton({ url, label, children }: { url: string; label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    return (
        <>
            <span onClick={() => setOpen(true)}>{children}</span>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Hapus {label}?</DialogTitle>
                        <DialogDescription>Data yang dihapus tidak bisa dikembalikan.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={processing}
                            onClick={() =>
                                router.delete(url, {
                                    preserveScroll: true,
                                    onStart: () => setProcessing(true),
                                    onFinish: () => {
                                        setProcessing(false);
                                        setOpen(false);
                                    },
                                })
                            }
                        >
                            Hapus
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
    paid: { label: 'Lunas', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    received: { label: 'Diterima', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    partial: { label: 'Sebagian', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    late: { label: 'Terlambat', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
    pending: { label: 'Belum', className: 'bg-muted text-muted-foreground' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
    const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
    return (
        <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium', s.className)}>
            {label ?? s.label}
        </span>
    );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor?: string }) {
    return (
        <div className="grid gap-1.5">
            <label htmlFor={htmlFor} className="text-sm font-medium">
                {label}
            </label>
            {children}
            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    );
}

export function FormDialog({
    open,
    onOpenChange,
    title,
    description,
    onSubmit,
    processing,
    children,
    submitLabel = 'Simpan',
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    title: string;
    description?: string;
    onSubmit: () => void;
    processing?: boolean;
    children: ReactNode;
    submitLabel?: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit();
                    }}
                >
                    {children}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
