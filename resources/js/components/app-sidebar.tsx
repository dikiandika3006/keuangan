import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { t } from '@/lib/i18n';
import { type NavGroup } from '@/types';
import { Link } from '@inertiajs/react';
import {
    ArrowLeftRight,
    Calculator,
    CalendarDays,
    ChartPie,
    CreditCard,
    Gem,
    Handshake,
    LayoutGrid,
    LineChart,
    PiggyBank,
    Settings,
    Target,
    Wallet,
} from 'lucide-react';
import AppLogo from './app-logo';

export const navGroups: NavGroup[] = [
    {
        title: t('Harian'),
        items: [
            { title: t('Kondisi Keuangan'), url: '/dashboard', icon: LayoutGrid },
            { title: t('Transaksi'), url: '/transactions', icon: ArrowLeftRight },
            { title: t('Kalender'), url: '/calendar', icon: CalendarDays, match: ['/monthly'] },
        ],
    },
    {
        title: t('Bulanan'),
        items: [
            { title: t('Rekap Bulanan'), url: '/recap', icon: ChartPie, match: ['/review'] },
            { title: t('Anggaran'), url: '/budgets', icon: PiggyBank },
        ],
    },
    {
        title: t('Kekayaan'),
        items: [
            { title: t('Rekening'), url: '/accounts', icon: Wallet },
            { title: t('Aset & Investasi'), url: '/assets', icon: Gem },
            { title: t('Utang & Piutang'), url: '/debts', icon: CreditCard, match: ['/receivables'] },
            { title: t('Titipan'), url: '/titipan', icon: Handshake },
        ],
    },
    {
        title: t('Rencana'),
        items: [
            { title: t('Proyeksi'), url: '/projection', icon: LineChart, match: ['/plan'] },
            { title: t('Target'), url: '/goals', icon: Target },
            { title: t('Kalkulator'), url: '/calculator/fire', icon: Calculator, match: ['/calculator'] },
        ],
    },
    {
        title: t('Lainnya'),
        items: [{ title: t('Pengaturan'), url: '/settings', icon: Settings }],
    },
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
                <NavMain groups={navGroups} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
