<?php

namespace App\Services;

use App\Models\DebtInstallment;
use App\Models\ReceivableSchedule;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Agenda 7 hari ke depan & peringatan dashboard (DSH-06, DSH-07, DEBT-05, RCV-04).
 */
class AlertService
{
    public function __construct(private User $user) {}

    /** Cicilan, biaya tetap & penerimaan piutang yang belum beres, dari yang terlambat sampai 7 hari ke depan. */
    public function agenda(int $days = 7): array
    {
        $until = CarbonImmutable::today()->addDays($days)->toDateString();
        $items = [];

        $installments = DebtInstallment::query()
            ->whereIn('debt_id', $this->user->debts()->select('id'))
            ->whereNull('paid_at')
            ->where('due_date', '<=', $until)
            ->with('debt:id,name')
            ->orderBy('due_date')
            ->get();

        foreach ($installments as $i) {
            $items[] = [
                'kind' => 'debt',
                'id' => $i->id,
                'title' => __('Cicilan :name', ['name' => $i->debt->name]),
                'amount' => $i->amount,
                'due_date' => $i->due_date->toDateString(),
                'status' => $i->status(),
                'url' => route('debts.index'),
            ];
        }

        foreach ($this->user->receivables()->get() as $receivable) {
            $receivable->syncSchedule();
        }

        $schedules = ReceivableSchedule::query()
            ->whereIn('receivable_id', $this->user->receivables()->select('id'))
            ->where('due_date', '<=', $until)
            ->with('receivable:id,counterparty')
            ->orderBy('due_date')
            ->get();

        foreach ($schedules as $s) {
            $received = $s->received();
            $status = $s->status($received);
            if ($status === 'received') {
                continue;
            }
            $items[] = [
                'kind' => 'receivable',
                'id' => $s->id,
                'title' => __('Terima dari :name', ['name' => $s->receivable->counterparty]),
                'amount' => $s->interest_due + $s->principal_due - $received['interest'] - $received['principal'],
                'due_date' => $s->due_date->toDateString(),
                'status' => $status,
                'url' => route('receivables.index'),
            ];
        }

        // Biaya tetap & isi dompet (punya tanggal bayar) bulan ini dan bulan depan yang belum lunas
        $bills = new BillService($this->user);
        $thisMonth = CarbonImmutable::today()->startOfMonth();
        foreach ([$thisMonth, $thisMonth->addMonth()] as $m) {
            if ($m->toDateString() > $until) {
                continue;
            }
            foreach ($bills->bills($m->format('Y-m')) as $b) {
                if ($b['source'] === 'debt' || $b['due_day'] === null || $b['paid'] >= $b['amount']) {
                    continue;
                }
                $due = $m->day(min($b['due_day'], $m->daysInMonth))->toDateString();
                if ($due > $until) {
                    continue;
                }
                $items[] = [
                    'kind' => 'bill',
                    'id' => $b['id'],
                    'title' => $b['name'],
                    'amount' => $b['amount'] - $b['paid'],
                    'due_date' => $due,
                    'status' => BillService::status($b['paid'], $b['amount'], $due),
                    'url' => route('monthly.index', ['month' => $m->format('Y-m')]),
                ];
            }
        }

        usort($items, fn ($a, $b) => strcmp($a['due_date'], $b['due_date']));

        return $items;
    }

    /**
     * @param  array  $agenda  hasil agenda()
     * @param  array|null  $projection  summary proyeksi skenario aktif
     */
    public function alerts(array $agenda, ?array $projection): array
    {
        $alerts = [];

        foreach ($agenda as $item) {
            if ($item['status'] === 'late') {
                $alerts[] = [
                    'level' => 'bad',
                    'message' => __(':title terlambat sejak :date', ['title' => $item['title'], 'date' => CarbonImmutable::parse($item['due_date'])->locale(app()->getLocale())->translatedFormat('j M')]),
                    'url' => $item['url'],
                ];
            }
        }

        if ($projection && $projection['min_balance'] < 0) {
            $alerts[] = [
                'level' => 'bad',
                'message' => __('Saldo diproyeksikan minus di :month: butuh dana tambahan :amount', ['month' => $projection['min_month'], 'amount' => 'Rp'.number_format(-$projection['min_balance'], 0, ',', '.')]),
                'url' => route('projection.index'),
            ];
        }

        // Biaya/pemasukan tetap yang berakhir paling lambat bulan depan dan belum dikonfirmasi
        foreach ($this->user->recurringItems()->endingSoon()->orderBy('end_date')->get() as $item) {
            $alerts[] = [
                'level' => 'warning',
                'message' => __(':name berakhir :month — perpanjang atau konfirmasi selesai?', ['name' => $item->name, 'month' => $item->end_date->locale(app()->getLocale())->translatedFormat('F Y')]),
                'url' => route('monthly.index'),
            ];
        }

        // ACC-04: rekening yang belum dicocokkan > 7 hari
        $stale = $this->user->accounts()->where('is_archived', false)->where('type', '!=', 'investment')
            ->where(fn ($q) => $q->whereNull('last_reconciled_at')->orWhere('last_reconciled_at', '<', today()->subDays(7)->toDateString()))
            ->pluck('name');
        if ($stale->isNotEmpty()) {
            $alerts[] = [
                'level' => 'warning',
                'message' => __('Cocokkan saldo: :names belum direkonsiliasi lebih dari 7 hari', ['names' => $stale->join(', ', ' & ')]),
                'url' => route('accounts.index'),
            ];
        }

        return $alerts;
    }
}
