import { cn } from '@/lib/utils';
import { ReactNode, useRef, useState } from 'react';

const WIDTH = 128;

/**
 * Baris yang bisa digeser ke kiri di HP untuk memunculkan tombol aksi (Ubah/Hapus).
 * Di layar besar tidak aktif; aksi ditampilkan langsung di baris oleh pemanggil.
 */
export function SwipeActions({ children, actions, className }: { children: ReactNode; actions: ReactNode; className?: string }) {
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);

    return (
        <div className={cn('relative overflow-hidden md:overflow-visible', className)}>
            <div className="absolute inset-y-0 right-0 flex items-stretch md:hidden" style={{ width: WIDTH }} aria-hidden={offset === 0}>
                {actions}
            </div>
            <div
                className={cn('bg-card relative md:transform-none!', !dragging && 'transition-transform duration-200')}
                style={{ transform: `translateX(${offset}px)` }}
                onTouchStart={(e) => {
                    const touch = e.touches[0];
                    start.current = { x: touch.clientX, y: touch.clientY, base: offset, horizontal: null };
                }}
                onTouchMove={(e) => {
                    const s = start.current;
                    if (!s) return;
                    const touch = e.touches[0];
                    const dx = touch.clientX - s.x;
                    const dy = touch.clientY - s.y;
                    // Tentukan arah sekali: geser vertikal tetap untuk scroll halaman
                    if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
                    if (!s.horizontal) return;
                    setDragging(true);
                    setOffset(Math.max(-WIDTH, Math.min(0, s.base + dx)));
                }}
                onTouchEnd={() => {
                    if (start.current?.horizontal) setOffset((o) => (o < -WIDTH / 2 ? -WIDTH : 0));
                    start.current = null;
                    setDragging(false);
                }}
                onClickCapture={(e) => {
                    // Ketuk saat terbuka → tutup saja, jangan jalankan klik baris
                    if (offset !== 0) {
                        e.stopPropagation();
                        e.preventDefault();
                        setOffset(0);
                    }
                }}
            >
                {children}
            </div>
        </div>
    );
}
