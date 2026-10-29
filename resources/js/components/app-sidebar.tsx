import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { t } from '@/lib/i18n';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import {
    ArrowLeftRight,
    CalendarCheck,
    CalendarDays,
    ChartPie,
    CreditCard,
    Flame,
    Gem,
    HandCoins,
    Handshake,
    House,
    LayoutGrid,
    LineChart,
    PiggyBank,
    Settings,
    Target,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import AppLogo from './app-logo';

export const mainNavItems: NavItem[] = [
    { title: t('Kondisi Keuangan'), url: '/dashboard', icon: LayoutGrid },
    { title: t('Transaksi'), url: '/transactions', icon: ArrowLeftRight },
    { title: t('Rekap Bulanan'), url: '/recap', icon: ChartPie },
    { title: t('Biaya Bulanan'), url: '/monthly', icon: CalendarCheck },
    { title: t('Kalender'), url: '/calendar', icon: CalendarDays },
    { title: t('Rekening'), url: '/accounts', icon: Wallet },
    { title: t('Utang & Cicilan'), url: '/debts', icon: CreditCard },
    { title: t('Piutang'), url: '/receivables', icon: HandCoins },
    { title: t('Titipan'), url: '/titipan', icon: Handshake },
    { title: t('Aset & Investasi'), url: '/assets', icon: Gem },
    { title: t('Proyeksi Skenario'), url: '/projection', icon: LineChart },
    { title: t('Anggaran'), url: '/budgets', icon: PiggyBank },
    { title: t('Target'), url: '/goals', icon: Target },
    { title: t('Simulasi Jangka Panjang'), url: '/plan', icon: TrendingUp },
    { title: t('Kalkulator FIRE'), url: '/calculator/fire', icon: Flame },
    { title: t('Kalkulator KPR'), url: '/calculator/kpr', icon: House },
    { title: t('Pengaturan'), url: '/settings', icon: Settings },
];

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
