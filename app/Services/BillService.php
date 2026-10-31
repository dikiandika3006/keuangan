<?php

namespace App\Services;

use App\Models\Category;
use App\Models\DebtInstallment;
use App\Models\ReceivableSchedule;
use App\Models\RecurringItem;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Tagihan & rencana arus kas per bulan: biaya tetap, isi Dompet Tujuan, cicilan utang berjadwal,
 * pemasukan rutin, dan penerimaan piutang. Dipakai Biaya Bulanan, Kalender, dan agenda dashboard.
 */
class BillService
{
    public function __construct(private User $user) {}

    /**
     * Biaya tetap + isi dompet + cicilan utang di bulan 'Y-m', urut tanggal bayar.
     *
     * @return Collection<int, array>
     */
    public function bills(string $month, ?Collection $items = null): Collection
    {
        [$start, $end] = $this->range($month);

        $items ??= $this->recurringItems();
        // Biaya tetap + isi Dompet Tujuan (type transfer) yang berlaku di bulan ini
        $expenses = $items->whereIn('type', ['expense', 'transfer'])->filter(fn (RecurringItem $i) => $i->activeIn($month))->values();

        $payments = $this->user->transactions()
            ->whereIn('recurring_item_id', $expenses->pluck('id'))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->with('account:id,name')
            ->orderBy('date')
            ->get()
            ->groupBy('recurring_item_id');

        $bills = $expenses->map(fn (RecurringItem $i) => [
            'source' => $i->type === 'transfer' ? 'pocket' : 'recurring',
            'id' => $i->id,
            'name' => $i->name,
            'amount' => $i->amount,
            'due_day' => $i->due_day,
            'category' => $i->type === 'transfer' && $i->toAccount
                ? ['id' => null, 'name' => "Dompet {$i->toAccount->name}", 'color' => $i->toAccount->color]
                : $i->category,
            'from_account_id' => $i->account_id,
            'to_account' => $i->toAccount?->name,
            'to_account_id' => $i->to_account_id,
            'paid' => (int) ($payments[$i->id] ?? collect())->sum('amount'),
            'payments' => $this->paymentRows($payments[$i->id] ?? collect()),
        ]);

        // Cicilan utang berjadwal (mobil, rumah, dll) di bulan ini ikut jadi biaya tetap; bayar → tandai cicilan lunas
        $installments = $this->installments($month);
        $debtCategory = Category::system($this->user, 'debt_installment')->only(['id', 'name', 'color']);

        return $bills->concat($installments->map(fn (DebtInstallment $i) => [
            'source' => 'debt',
            'id' => $i->id,
            'debt_id' => $i->debt_id,
            'kind' => $i->debt->kind,
            'name' => $i->debt->name,
            'amount' => $i->amount,
            'due_day' => $i->due_date->day,
            'category' => $debtCategory,
            'paid' => $i->paid_at ? max($i->amount, (int) $i->transactions->sum('amount')) : (int) $i->transactions->sum('amount'),
            'payments' => $this->paymentRows($i->transactions->sortBy('date')),
        ]))->sortBy(fn ($b) => $b['due_day'] ?? 32)->values();
    }

    /**
     * Semua kejadian terencana di bulan 'Y-m' untuk kalender: tagihan keluar + pemasukan rutin + piutang,
     * masing-masing dengan tanggal dan status (paid, partial, late, pending).
     *
     * @return Collection<int, array>
     */
    public function events(string $month): Collection
    {
        [$start, $end] = $this->range($month);
        $items = $this->recurringItems();
        $date = fn (?int $day) => $start->day(min($day ?: 1, $start->daysInMonth))->toDateString();

        $events = $this->bills($month, $items)->map(fn (array $b) => [
            'key' => "{$b['source']}-{$b['id']}",
            'source' => $b['source'],
            'direction' => $b['source'] === 'pocket' ? 'transfer' : 'out',
            'title' => $b['name'],
            'subtitle' => $b['category']['name'] ?? null,
            'color' => $b['category']['color'] ?? null,
            'amount' => $b['amount'],
            'done' => $b['paid'],
            'date' => $date($b['due_day']),
            'has_day' => $b['due_day'] !== null,
            'url' => route('monthly.index', ['month' => $month]),
        ]);

        // Pemasukan rutin (gaji, usaha, dll): diterima = transaksi bertaut di bulan itu, atau bila tidak ada,
        // pemasukan dengan kategori yang sama (gaji biasanya dicatat lewat form transaksi biasa)
        $incomes = $items->where('type', 'income')->filter(fn (RecurringItem $i) => $i->activeIn($month))->values();
        $monthTx = fn () => $this->user->transactions()->where('type', 'income')->whereBetween('date', [$start->toDateString(), $end->toDateString()]);
        $linked = $monthTx()->whereIn('recurring_item_id', $incomes->pluck('id'))
            ->selectRaw('recurring_item_id, SUM(amount) as total')->groupBy('recurring_item_id')->pluck('total', 'recurring_item_id');
        $byCategory = $monthTx()->whereIn('category_id', $incomes->pluck('category_id')->filter())
            ->selectRaw('category_id, SUM(amount) as total')->groupBy('category_id')->pluck('total', 'category_id');
        // Tebakan per kategori hanya bila kategori itu dipakai satu item pemasukan saja; kalau dua item
        // (mis. dua sumber Usaha) berbagi kategori, total yang sama akan terhitung untuk keduanya
        $sharedCategory = $incomes->pluck('category_id')->filter()->countBy();
        $received = $incomes->mapWithKeys(fn (RecurringItem $i) => [
            $i->id => (int) ($linked[$i->id] ?? ($i->category_id && $sharedCategory[$i->category_id] === 1 ? ($byCategory[$i->category_id] ?? 0) : 0)),
        ]);

        $events = $events->concat($incomes->map(fn (RecurringItem $i) => [
            'key' => "income-{$i->id}",
            'source' => 'income',
            'direction' => 'in',
            'title' => $i->name,
            'subtitle' => $i->category?->name,
            'color' => $i->category?->color,
            'amount' => $i->amount,
            'done' => (int) ($received[$i->id] ?? 0),
            'date' => $date($i->due_day),
            'has_day' => $i->due_day !== null,
            'url' => route('monthly.index', ['month' => $month]),
        ]));

        // Penerimaan piutang (bunga + pokok dari teman)
        foreach ($this->user->receivables()->get() as $receivable) {
            $receivable->syncSchedule();
        }
        $schedules = ReceivableSchedule::query()
            ->whereIn('receivable_id', $this->user->receivables()->select('id'))
            ->where('period', $start->toDateString())
            ->with('receivable:id,counterparty')
            ->get();

        $events = $events->concat($schedules->map(function (ReceivableSchedule $s) {
            $got = $s->received();

            return [
                'key' => "receivable-{$s->id}",
                'source' => 'receivable',
                'direction' => 'in',
                'title' => __('Terima dari :name', ['name' => $s->receivable->counterparty]),
                'subtitle' => __('Bunga :interest + pokok :principal', [
                    'interest' => 'Rp'.number_format($s->interest_due, 0, ',', '.'),
                    'principal' => 'Rp'.number_format($s->principal_due, 0, ',', '.'),
                ]),
                'color' => '#6366f1',
                'amount' => $s->interest_due + $s->principal_due,
                'done' => $got['interest'] + $got['principal'],
                'date' => $s->due_date->toDateString(),
                'has_day' => true,
                'url' => route('receivables.index'),
            ];
        }));

        return $events
            ->filter(fn ($e) => $e['amount'] > 0)
            ->map(fn ($e) => [...$e, 'status' => self::status($e['done'], $e['amount'], $e['date'], $e['direction'] === 'in' ? 3 : 0)])
            ->sortBy([['date', 'asc'], ['direction', 'desc'], ['amount', 'desc']])
            ->values();
    }

    /**
     * paid / partial / late / pending. Pemasukan diberi toleransi beberapa hari sebelum dianggap terlambat (BR-10).
     */
    public static function status(int $done, int $amount, string $date, int $graceDays = 0): string
    {
        if ($done >= $amount) {
            return 'paid';
        }
        if (CarbonImmutable::parse($date)->addDays($graceDays)->lt(CarbonImmutable::today())) {
            return 'late';
        }

        return $done > 0 ? 'partial' : 'pending';
    }

    public function installments(string $month): Collection
    {
        return DebtInstallment::query()
            ->whereIn('debt_id', $this->user->debts()->select('id'))
            ->where('period', $this->range($month)[0]->toDateString())
            ->with(['debt:id,name,kind', 'transactions.account:id,name'])
            ->get();
    }

    public function recurringItems(): Collection
    {
        return $this->user->recurringItems()->with(['category:id,name,color,icon', 'account:id,name', 'toAccount:id,name,color'])->orderBy('id')->get();
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    private function range(string $month): array
    {
        $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay();

        return [$start, $start->endOfMonth()];
    }

    private function paymentRows(Collection $transactions): Collection
    {
        return $transactions->map(fn ($t) => [
            'id' => $t->id,
            'date' => $t->date->toDateString(),
            'amount' => $t->amount,
            'account' => $t->account?->name,
        ])->values();
    }
}
