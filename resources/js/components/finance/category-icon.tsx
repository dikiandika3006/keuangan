import { cn } from '@/lib/utils';
import {
    Baby,
    Banknote,
    Briefcase,
    Car,
    CircleDollarSign,
    Coffee,
    CreditCard,
    Dog,
    Droplet,
    Dumbbell,
    Film,
    Fuel,
    Gift,
    GraduationCap,
    HandCoins,
    Handshake,
    HeartPulse,
    Home,
    Landmark,
    type LucideIcon,
    Package,
    PiggyBank,
    Plane,
    Receipt,
    Shirt,
    ShoppingCart,
    Smartphone,
    Sparkles,
    Tag,
    TrendingUp,
    Users,
    UtensilsCrossed,
    Wifi,
    Wrench,
    Zap,
} from 'lucide-react';

/** Ikon yang bisa dipilih untuk kategori (nama disimpan di database). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
    food: UtensilsCrossed,
    coffee: Coffee,
    groceries: ShoppingCart,
    transport: Car,
    fuel: Fuel,
    bills: Zap,
    water: Droplet,
    internet: Wifi,
    phone: Smartphone,
    home: Home,
    health: HeartPulse,
    sport: Dumbbell,
    fun: Film,
    travel: Plane,
    clothes: Shirt,
    school: GraduationCap,
    baby: Baby,
    pet: Dog,
    family: Users,
    gift: Gift,
    debt: CreditCard,
    bank: Landmark,
    repair: Wrench,
    package: Package,
    salary: Banknote,
    business: Briefcase,
    invest: TrendingUp,
    savings: PiggyBank,
    lend: HandCoins,
    held: Handshake,
    receipt: Receipt,
    other: Tag,
    bonus: Sparkles,
};

/** Tebakan ikon dari nama kategori bila belum dipilih (Indonesia & Inggris). */
const GUESS: [RegExp, string][] = [
    [/kopi|coffee|cafe/i, 'coffee'],
    [/makan|minum|jajan|food|resto|kuliner|snack/i, 'food'],
    [/belanja|groceri|supermarket|pasar|indomaret|alfamart|rumah tangga/i, 'groceries'],
    [/bensin|bbm|fuel|pertamina/i, 'fuel'],
    [/transport|ojek|grab|gojek|parkir|tol|mobil|motor/i, 'transport'],
    [/listrik|token|pln|tagihan|utilit|bill/i, 'bills'],
    [/air|pdam|water/i, 'water'],
    [/internet|wifi|indihome/i, 'internet'],
    [/pulsa|hp|phone|paket data/i, 'phone'],
    [/rumah|tinggal|kos|sewa|rent|perlengkapan/i, 'home'],
    [/sehat|dokter|obat|rs\b|klinik|health|bpjs/i, 'health'],
    [/olahraga|gym|sport|fitness/i, 'sport'],
    [/hiburan|nonton|film|game|netflix|spotify|fun|entertain/i, 'fun'],
    [/liburan|travel|wisata|hotel|tiket|pesawat/i, 'travel'],
    [/baju|pakaian|fashion|cloth/i, 'clothes'],
    [/sekolah|pendidikan|kursus|spp|les|education|school/i, 'school'],
    [/anak|bayi|susu|popok|baby/i, 'baby'],
    [/hewan|kucing|anjing|pet/i, 'pet'],
    [/keluarga|sosial|orang tua|family|zakat|sedekah|donasi|amal/i, 'family'],
    [/hadiah|kado|gift/i, 'gift'],
    [/cicilan|utang|kredit|paylater|debt|loan/i, 'debt'],
    [/bank|admin|biaya bank/i, 'bank'],
    [/servis|service|perbaikan|bengkel|repair/i, 'repair'],
    [/gaji|salary|upah/i, 'salary'],
    [/bonus|thr/i, 'bonus'],
    [/usaha|bisnis|freelance|business|plastik|dagang/i, 'business'],
    [/investasi|saham|reksa|invest|dividen|pelagic|emas/i, 'invest'],
    [/tabungan|saving|dana darurat/i, 'savings'],
    [/piutang|pokok|bunga piutang/i, 'lend'],
    [/titip/i, 'held'],
];

export function categoryIconName(category: { name?: string | null; icon?: string | null } | null | undefined): string {
    if (category?.icon && CATEGORY_ICONS[category.icon]) return category.icon;
    const name = category?.name ?? '';
    return GUESS.find(([re]) => re.test(name))?.[1] ?? 'other';
}

/** Ikon kategori dalam lingkaran berwarna (warna kategori). */
export function CategoryIcon({
    category,
    className,
    size = 'md',
}: {
    category: { name?: string | null; icon?: string | null; color?: string | null } | null | undefined;
    className?: string;
    size?: 'sm' | 'md';
}) {
    const Icon = CATEGORY_ICONS[categoryIconName(category)] ?? CircleDollarSign;
    const color = category?.color ?? '#94a3b8';
    return (
        <span
            className={cn('flex shrink-0 items-center justify-center rounded-full', size === 'sm' ? 'size-7' : 'size-9', className)}
            style={{ backgroundColor: color + '22', color }}
        >
            <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />
        </span>
    );
}

/** Pemilih ikon untuk form kategori. */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (icon: string) => void; color: string }) {
    return (
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-11">
            {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => (
                <button
                    key={name}
                    type="button"
                    onClick={() => onChange(name)}
                    aria-label={name}
                    aria-pressed={value === name}
                    className={cn(
                        'flex aspect-square items-center justify-center rounded-lg border transition',
                        value === name ? 'border-transparent ring-2 ring-offset-1' : 'hover:bg-muted',
                    )}
                    style={value === name ? { backgroundColor: color + '22', color, ['--tw-ring-color' as string]: color } : undefined}
                >
                    <Icon className="size-4" />
                </button>
            ))}
        </div>
    );
}
