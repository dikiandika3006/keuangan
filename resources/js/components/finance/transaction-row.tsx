import { formatDate, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type Transaction } from '@/types/finance';
import { ArrowLeftRight, Paperclip, Split } from 'lucide-react';
import { ReactNode } from 'react';

export function TransactionRow({ tx, actions, onClick }: { tx: Transaction; actions?: ReactNode; onClick?: () => void }) {
    const isTransfer = tx.type === 'transfer';
    const color = isTransfer ? '#3b82f6' : (tx.category?.color ?? '#94a3b8');
    const title = isTransfer ? t('Transfer ke :name', { name: tx.to_account?.name ?? '-' }) : (tx.category?.name ?? t('Tanpa kategori'));

    return (
        <div className={cn('flex items-center gap-3 py-2.5', onClick && 'hover:bg-muted/50 -mx-2 cursor-pointer rounded-lg px-2')} onClick={onClick}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color + '22', color }}>
                {isTransfer ? <ArrowLeftRight className="size-4" /> : <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{title}</span>
                    {tx.attachment_url && (
                        <a
                            href={tx.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            title={t('Lihat bukti')}
                            aria-label={t('Lihat bukti')}
                        >
                            <Paperclip className="size-3.5" />
                        </a>
                    )}
                    {tx.split_group && <Split className="text-muted-foreground size-3.5 shrink-0" aria-label={t('Hasil pecah transaksi')} />}
                    {tx.source === 'import' && (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-normal">{t('impor')}</span>
                    )}
                    {tx.source === 'reconcile' && (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-normal">
                            {t('rekonsiliasi')}
                        </span>
                    )}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                    {formatDate(tx.date)} · {tx.account?.name}
                    {tx.note ? ` · ${tx.note}` : ''}
                    {tx.tags?.map((tag) => (
                        <span key={tag.id} className="ml-1" style={{ color: tag.color }}>
                            #{tag.name}
                        </span>
                    ))}
                </div>
            </div>
            <div
                className={cn(
                    'shrink-0 text-right text-sm font-semibold tabular-nums',
                    tx.type === 'income' && 'text-emerald-600 dark:text-emerald-400',
                    tx.type === 'expense' && 'text-red-600 dark:text-red-400',
                )}
            >
                {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                {rupiah(tx.amount)}
            </div>
            {actions}
        </div>
    );
}
