import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
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
    House,
    Handshake,
    LayoutGrid,
    LineChart,
    PiggyBank,
    Target,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import AppLogo from './app-logo';

export const mainNavItems: NavItem[] = [
    { title: 'Kondisi Keuangan', url: '/dashboard', icon: LayoutGrid },
    { title: 'Transaksi', url: '/transactions', icon: ArrowLeftRight },
    { title: 'Rekap Bulanan', url: '/recap', icon: ChartPie },
    { title: 'Biaya Bulanan', url: '/monthly', icon: CalendarCheck },
    { title: 'Kalender', url: '/calendar', icon: CalendarDays },
    { title: 'Rekening', url: '/accounts', icon: Wallet },
    { title: 'Utang & Cicilan', url: '/debts', icon: CreditCard },
    { title: 'Piutang', url: '/receivables', icon: HandCoins },
    { title: 'Titipan', url: '/titipan', icon: Handshake },
    { title: 'Aset & Investasi', url: '/assets', icon: Gem },
    { title: 'Proyeksi Skenario', url: '/projection', icon: LineChart },
    { title: 'Anggaran', url: '/budgets', icon: PiggyBank },
    { title: 'Target', url: '/goals', icon: Target },
    { title: 'Simulasi Jangka Panjang', url: '/plan', icon: TrendingUp },
    { title: 'Kalkulator FIRE', url: '/calculator/fire', icon: Flame },
    { title: 'Kalkulator KPR', url: '/calculator/kpr', icon: House },
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
