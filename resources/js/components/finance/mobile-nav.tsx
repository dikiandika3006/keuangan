import { TransactionForm } from '@/components/finance/transaction-form';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { Link, usePage } from '@inertiajs/react';
import { ArrowLeftRight, LayoutGrid, LineChart, Menu, Plus } from 'lucide-react';
import { useState } from 'react';

const items = [
    { title: 'Kondisi', url: '/dashboard', icon: LayoutGrid },
    { title: 'Transaksi', url: '/transactions', icon: ArrowLeftRight },
    null,
    { title: 'Proyeksi', url: '/projection', icon: LineChart },
];

/** Navigasi bawah + tombol tambah transaksi, hanya tampil di layar kecil. */
export function MobileNav() {
    const { url } = usePage();
    const { setOpenMobile } = useSidebar();
    const [open, setOpen] = useState(false);

    return (
        <>
            <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
                <div className="grid h-16 grid-cols-5 items-center">
                    {items.map((item, i) =>
                        item === null ? (
                            <div key={i} className="flex justify-center">
                                <button
                                    onClick={() => setOpen(true)}
                                    className="-mt-6 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg active:scale-95"
                                    aria-label="Catat transaksi"
                                >
                                    <Plus className="size-7" />
                                </button>
                            </div>
                        ) : (
                            <Link
                                key={item.url}
                                href={item.url}
                                prefetch
                                className={cn(
                                    'flex flex-col items-center gap-1 text-[11px]',
                                    url.startsWith(item.url) ? 'text-foreground font-medium' : 'text-muted-foreground',
                                )}
                            >
                                <item.icon className="size-5" />
                                {item.title}
                            </Link>
                        ),
                    )}
                    <button onClick={() => setOpenMobile(true)} className="text-muted-foreground flex flex-col items-center gap-1 text-[11px]">
                        <Menu className="size-5" />
                        Lainnya
                    </button>
                </div>
            </nav>
            <TransactionForm open={open} onOpenChange={setOpen} />
        </>
    );
}
