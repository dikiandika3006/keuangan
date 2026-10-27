import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

interface MonthPickerProps {
    id?: string;
    value: string | null; // 'YYYY-MM' atau kosong
    onChange: (value: string) => void; // '' = dikosongkan
    placeholder?: string;
    clearable?: boolean;
    className?: string;
}

/** Pemilih bulan-tahun yang konsisten di semua browser (pengganti input type="month"). */
export function MonthPicker({ id, value, onChange, placeholder = 'Pilih bulan', clearable = true, className }: MonthPickerProps) {
    const selectedYear = value ? Number(value.slice(0, 4)) : null;
    const selectedMonth = value ? Number(value.slice(5, 7)) : null;
    const [year, setYear] = useState(selectedYear ?? new Date().getFullYear());
    const now = new Date();

    return (
        <DropdownMenu onOpenChange={(open) => open && setYear(selectedYear ?? now.getFullYear())}>
            <div className={cn('relative', className)}>
                <DropdownMenuTrigger asChild>
                    <button
                        id={id}
                        type="button"
                        className={cn(
                            'border-input bg-background focus-visible:ring-ring flex h-9 w-full items-center gap-2 rounded-md border px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-2',
                            !value && 'text-muted-foreground',
                            clearable && value && 'pr-8',
                        )}
                    >
                        <CalendarDays className="text-muted-foreground size-4 shrink-0" />
                        <span className="truncate">{value ? `${MONTHS[selectedMonth! - 1]} ${selectedYear}` : placeholder}</span>
                    </button>
                </DropdownMenuTrigger>
                {clearable && value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                        aria-label="Kosongkan"
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>
            <DropdownMenuContent align="start" className="w-64 p-2">
                <div className="mb-2 flex items-center justify-between">
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setYear(year - 1)} aria-label="Tahun sebelumnya">
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm font-semibold">{year}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setYear(year + 1)} aria-label="Tahun berikutnya">
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((label, i) => {
                        const active = selectedYear === year && selectedMonth === i + 1;
                        const isNow = now.getFullYear() === year && now.getMonth() === i;
                        return (
                            <DropdownMenuItem
                                key={label}
                                onSelect={() => onChange(`${year}-${String(i + 1).padStart(2, '0')}`)}
                                className={cn(
                                    'justify-center rounded-md py-2 text-sm',
                                    active && 'bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                                    !active && isNow && 'font-semibold underline underline-offset-4',
                                )}
                            >
                                {label}
                            </DropdownMenuItem>
                        );
                    })}
                </div>
                {clearable && (
                    <DropdownMenuItem onSelect={() => onChange('')} className="text-muted-foreground mt-1 justify-center text-xs">
                        Kosongkan
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
