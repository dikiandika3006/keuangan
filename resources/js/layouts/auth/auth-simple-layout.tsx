import AppLogoIcon from '@/components/app-logo-icon';
import { Link } from '@inertiajs/react';

interface AuthLayoutProps {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        // Latar gradien lembut bernuansa warna utama, kartu di tengah
        <div className="via-background dark:via-background relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 p-4 md:p-10 dark:from-emerald-950/40 dark:to-teal-950/30">
            <div className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
            <div className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/10" />

            <div className="bg-card/90 relative w-full max-w-sm rounded-2xl border p-6 shadow-xl shadow-emerald-900/5 backdrop-blur sm:p-8">
                <div className="flex flex-col gap-7">
                    <div className="flex flex-col items-center gap-4">
                        <Link href={route('home')} className="flex flex-col items-center gap-2 font-medium">
                            <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl">
                                <AppLogoIcon className="text-primary size-9 fill-current" />
                            </div>
                            <span className="sr-only">{title}</span>
                        </Link>

                        <div className="space-y-1.5 text-center">
                            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                            <p className="text-muted-foreground text-center text-sm">{description}</p>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
