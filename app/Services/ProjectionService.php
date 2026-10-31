<?php

namespace App\Services;

use App\Models\Debt;
use App\Models\Receivable;
use App\Models\Scenario;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Proyeksi arus kas bulanan per skenario (PRJ-02, BR-11 s/d BR-17).
 * Bulan yang sudah lewat memakai angka aktual dari transaksi, bulan depan memakai asumsi.
 * Cicilan & dana di teman diambil dari menu Utang/Piutang bila datanya ada, supaya tidak dicatat dua kali;
 * asumsi skenario untuk hal itu hanya dipakai bila menu tersebut masih kosong.
 */
class ProjectionService
{
    /** Asumsi default dari Ringkasan Rencana Keuangan 21 Okt 2026. */
    public const DEFAULTS = [
        'salary' => 13_000_000,
        'last_salary_month' => '2026-11',
        'rehire_month' => '2027-02',
        'new_salary' => 10_000_000,
        'plastic_income' => 2_000_000,
        'djitu_income' => 0,
        'friend_principal' => 150_000_000,
        'friend_interest_pct' => 1.0,
        'friend_withdraw_during_car' => 5_000_000,
        'friend_withdraw_after_car' => 0,
        'jht_amount' => 6_000_000,
        'jht_month' => '2027-01',
        'car_installment' => 10_000_000,
        'car_last_month' => '2027-12',
        'house_installment' => 3_000_000,
        'house_last_month' => '2032-06',
        'school_fee' => 1_500_000,
        'school_start_month' => '2027-07',
        'groceries' => 3_500_000,
        'pelagic_deposit' => 1_000_000,
        'other_expense' => 0,
        'emergency_target' => 30_000_000,
    ];

    /** Variasi skenario bawaan: [nama, override asumsi, aktif]. */
    public const PRESETS = [
        ['Dasar', [], true],
        ['Optimis', ['rehire_month' => '2027-01', 'new_salary' => 11_000_000, 'jht_month' => null], false],
        ['Konservatif', ['rehire_month' => '2027-05', 'groceries' => 4_000_000], false],
    ];

    public function __construct(private User $user, private FinanceService $finance) {}

    /** Buat 3 skenario bawaan bila user belum punya skenario. */
    public static function ensureScenarios(User $user): void
    {
        if ($user->scenarios()->exists()) {
            return;
        }

        foreach (self::PRESETS as [$name, $override, $active]) {
            $user->scenarios()->create([
                'name' => $name,
                'is_active' => $active,
                'start_month' => '2026-11-01',
                'months' => 26,
                'assumptions' => [...self::DEFAULTS, ...$override],
            ]);
        }
    }

    public function activeScenario(): ?Scenario
    {
        return $this->user->scenarios()->where('is_active', true)->first() ?? $this->user->scenarios()->first();
    }

    /**
     * @return array{rows: array<int, array>, summary: array}
     */
    public function project(Scenario $scenario): array
    {
        $a = [...self::DEFAULTS, ...($scenario->assumptions ?? [])];
        $start = CarbonImmutable::parse($scenario->start_month)->startOfMonth();
        $thisMonth = CarbonImmutable::now()->startOfMonth();
        $actuals = $this->actualTotals($start, $thisMonth);
        // Saldo kas = uang di rekening di luar Dompet Tujuan (isi dompet dihitung sebagai uang keluar)
        $position = $this->finance->position();
        $liquidNow = $position['liquid'] - $position['pockets'] - $position['held'];
        $pocketTransfers = $this->pocketTransfers($thisMonth);

        $principal = (int) $a['friend_principal'];
        $sources = $this->sources();
        $debts = $this->user->debts()->with('installments')->get();
        $receivables = $this->user->receivables()->get();
        $friend = $sources['friend'] ? $this->receivableFlows($receivables, $start, $scenario->months) : null;
        $balance = $liquidNow;
        $rows = [];
        $realization = [];
        // Pemasukan/pengeluaran tetap berlaku untuk semua skenario
        $recurring = $this->user->recurringItems()->get();

        for ($i = 0; $i < $scenario->months; $i++) {
            $m = $start->addMonths($i);
            $key = $m->format('Y-m');

            $salary = $this->salaryFor($key, $a);
            $carActive = $this->onOrBefore($key, $a['car_last_month']);
            if ($friend) {
                ['principal' => $principalStart, 'interest' => $interest, 'withdraw' => $withdraw] = $friend[$key];
            } else {
                $interest = (int) round($principal * (float) $a['friend_interest_pct'] / 100);
                $withdraw = min($principal, (int) ($carActive ? $a['friend_withdraw_during_car'] : $a['friend_withdraw_after_car']));
                $principalStart = $principal;
                $principal -= $withdraw;
            }

            $line = [
                'salary' => $salary,
                'plastic' => (int) $a['plastic_income'],
                'interest' => $interest,
                'withdraw' => $withdraw,
                'jht' => $salary === 0 && $a['jht_month'] === $key ? (int) $a['jht_amount'] : 0,
                'djitu' => (int) $a['djitu_income'],
                'car' => $sources['car'] ? $this->debtDue($debts->where('kind', 'car'), $m, $thisMonth) : ($carActive ? (int) $a['car_installment'] : 0),
                'house' => $sources['house'] ? $this->debtDue($debts->where('kind', 'house'), $m, $thisMonth) : ($this->onOrBefore($key, $a['house_last_month']) ? (int) $a['house_installment'] : 0),
                // Utang lain dari menu Utang (kartu kredit, paylater, pinjaman pribadi, dll.)
                'debt' => $this->debtDue($debts->whereNotIn('kind', ['car', 'house']), $m, $thisMonth),
                'school' => $this->onOrAfter($key, $a['school_start_month']) ? (int) $a['school_fee'] : 0,
                'groceries' => (int) $a['groceries'],
                'pelagic' => $salary > 0 ? (int) $a['pelagic_deposit'] : 0,
                'other' => (int) $a['other_expense'],
            ];
            $active = $recurring->filter(fn ($item) => $item->activeIn($key));
            $line['recurring_in'] = (int) $active->where('type', 'income')->sum('amount');
            $line['recurring_out'] = (int) $active->where('type', 'expense')->sum('amount');
            $line['pocket'] = (int) $active->where('type', 'transfer')->sum('amount');

            $in = $line['salary'] + $line['plastic'] + $line['interest'] + $line['withdraw'] + $line['jht'] + $line['djitu'] + $line['recurring_in'];
            $out = $line['car'] + $line['house'] + $line['debt'] + $line['school'] + $line['groceries'] + $line['pelagic'] + $line['other'] + $line['recurring_out'] + $line['pocket'];

            $actual = null;
            if ($m->lt($thisMonth)) {
                $actual = $actuals[$key] ?? ['income' => 0, 'expense' => 0];
                $past = $this->finance->position($m->endOfMonth()->toDateString());
                $balance = $past['liquid'] - $past['pockets'] - $past['held'];
            } elseif ($m->eq($thisMonth)) {
                // Bulan berjalan: aktual sampai hari ini + sisa rencana yang belum terjadi
                $actual = $actuals[$key] ?? ['income' => 0, 'expense' => 0];
                // Pemasukan dinilai per baris: yang sudah direalisasi memakai angka aktualnya (sudah ada di saldo),
                // jadi rencananya tidak ditambahkan lagi; pemasukan tak terduga tidak mengurangi rencana lain
                $realization = $this->incomeRealization($line, $m, $active, $sources['friend']);
                $remainingIn = (int) collect($realization)->sum('remaining');
                // Isi dompet bulan ini yang sudah ditransfer tidak termasuk 'expense' aktual
                $plannedOut = $out - $line['pocket'];
                $balance = $liquidNow + $remainingIn - max(0, $plannedOut - $actual['expense']) - max(0, $line['pocket'] - $pocketTransfers);
            } else {
                $balance += $in - $out;
            }

            $rows[] = [
                'month' => $key,
                'label' => $m->locale(app()->getLocale())->translatedFormat('M Y'),
                'is_past' => $m->lt($thisMonth),
                'is_current' => $m->eq($thisMonth),
                'principal_start' => $principalStart,
                ...$line,
                'income' => $in,
                'expense' => $out,
                'net' => $in - $out,
                'actual_income' => $actual['income'] ?? null,
                'actual_expense' => $actual['expense'] ?? null,
                'balance' => $balance,
            ];
        }

        $principalNow = $friend ? (int) $receivables->sum(fn (Receivable $r) => $r->remainingPrincipal()) : (int) $a['friend_principal'];

        return [
            'rows' => $rows,
            'summary' => $this->summary($rows, $a, $liquidNow, $principalNow),
            'sources' => $sources,
            'realization' => $realization,
        ];
    }

    private function summary(array $rows, array $a, int $liquidNow, int $principalNow): array
    {
        $future = array_values(array_filter($rows, fn ($r) => ! $r['is_past']));
        $min = collect($future)->sortBy('balance')->first();
        $withSalary = collect($rows)->first(fn ($r) => $r['salary'] > 0);
        $withoutSalary = collect($future)->first(fn ($r) => $r['salary'] === 0 && $r['school'] > 0)
            ?? collect($future)->first(fn ($r) => $r['salary'] === 0);

        // Runway (BR-18): rata-rata defisit tanpa gaji 3 bulan ke depan
        $burns = collect($future)->take(3)->map(fn ($r) => ($r['expense'] - $r['pelagic']) - ($r['income'] - $r['salary'] - $r['jht']));
        $burn = $burns->isEmpty() ? 0 : (int) round($burns->avg());
        $carLast = collect($rows)->last(fn ($r) => $r['car'] > 0);

        return [
            'liquid_now' => $liquidNow,
            'net_with_salary' => $withSalary ? $withSalary['net'] : null,
            'net_without_salary' => $withoutSalary ? $withoutSalary['net'] - $withoutSalary['jht'] : null,
            'min_balance' => $min['balance'] ?? $liquidNow,
            'min_month' => $min['label'] ?? null,
            'end_balance' => end($rows)['balance'] ?? $liquidNow,
            'monthly_burn' => $burn,
            'runway_months' => $burn > 0 ? round($liquidNow / $burn, 1) : null,
            'car_paid_off' => $carLast ? $carLast['label'] : null,
            'principal_after_car' => $carLast ? $carLast['principal_start'] - $carLast['withdraw'] : $principalNow,
            'emergency_target' => (int) $a['emergency_target'],
        ];
    }

    /**
     * Bagian skenario yang digantikan data menu: cicilan mobil/rumah dari Utang, dana di teman dari Piutang.
     *
     * @return array{car: bool, house: bool, friend: bool}
     */
    public function sources(): array
    {
        $kinds = $this->user->debts()->pluck('kind');

        return [
            'car' => $kinds->contains('car'),
            'house' => $kinds->contains('house'),
            'friend' => $this->user->receivables()->exists(),
        ];
    }

    /**
     * Cicilan utang yang jatuh di bulan $m: utang berjadwal memakai jadwal cicilannya,
     * utang tanpa jadwal dibayar cicilan per bulan mulai bulan ini sampai sisa utang habis.
     */
    private function debtDue(Collection $debts, CarbonImmutable $m, CarbonImmutable $thisMonth): int
    {
        return (int) $debts->sum(function (Debt $d) use ($m, $thisMonth) {
            if ($d->hasSchedule()) {
                return (int) $d->installments->first(fn ($i) => $i->period->isSameMonth($m))?->amount;
            }
            if ($d->monthly_payment <= 0 || $d->remaining_amount <= 0) {
                return 0;
            }
            if ($m->lt($thisMonth)) {
                return $d->monthly_payment;
            }

            return max(0, min($d->monthly_payment, $d->remaining_amount - (int) $thisMonth->diffInMonths($m) * $d->monthly_payment));
        });
    }

    /**
     * Bunga & tarikan pokok dari semua piutang per bulan proyeksi. Jadwal yang sudah ada (sampai bulan depan)
     * dipakai apa adanya; bulan setelahnya dihitung dengan aturan yang sama seperti jadwal piutang.
     *
     * @return array<string, array{principal: int, interest: int, withdraw: int}>
     */
    private function receivableFlows(Collection $receivables, CarbonImmutable $start, int $months): array
    {
        $end = $start->addMonths($months - 1);
        $thisMonth = CarbonImmutable::now()->startOfMonth();
        $flows = [];
        for ($i = 0; $i < $months; $i++) {
            $flows[$start->addMonths($i)->format('Y-m')] = ['principal' => 0, 'interest' => 0, 'withdraw' => 0];
        }

        foreach ($receivables as $r) {
            $r->syncSchedule();
            $schedules = $r->schedules()->get()->keyBy(fn ($s) => $s->period->format('Y-m'));
            $topups = $r->topupsByMonth();
            $remaining = $r->principal + (int) $topups->filter(fn ($v, $m) => $m < CarbonImmutable::parse($r->start_month)->format('Y-m'))->sum();

            for ($period = CarbonImmutable::parse($r->start_month)->startOfMonth(); $period->lte($end); $period = $period->addMonth()) {
                $key = $period->format('Y-m');
                $schedule = $schedules[$key] ?? null;
                $interest = $schedule ? $schedule->interest_due : (int) round($remaining * $r->interest_pct / 100);
                $due = $schedule ? $schedule->principal_due : min($remaining, $r->withdrawalFor($period));

                if (isset($flows[$key])) {
                    $flows[$key]['principal'] += $remaining;
                    $flows[$key]['interest'] += $interest;
                    $flows[$key]['withdraw'] += $due;
                }

                $received = $schedule && $period->lte($thisMonth) ? $schedule->received()['principal'] : 0;
                $remaining = max(0, $remaining - ($period->lt($thisMonth) ? $received : max($received, $due))) + (int) ($topups[$key] ?? 0);
            }
        }

        return $flows;
    }

    private function salaryFor(string $month, array $a): int
    {
        if ($this->onOrBefore($month, $a['last_salary_month'])) {
            return (int) $a['salary'];
        }

        return $this->onOrAfter($month, $a['rehire_month']) ? (int) $a['new_salary'] : 0;
    }

    private function onOrBefore(string $month, ?string $limit): bool
    {
        return $limit !== null && $limit !== '' && $month <= $limit;
    }

    private function onOrAfter(string $month, ?string $from): bool
    {
        return $from !== null && $from !== '' && $month >= $from;
    }

    /** Baris pemasukan skenario yang bisa direalisasi lewat transaksi bertanda plan_key. */
    public const PLAN_INCOME = ['salary' => 'Gaji', 'plastic' => 'Usaha plastik', 'djitu' => 'Djitu', 'jht' => 'JHT'];

    /**
     * Rencana vs realisasi tiap baris pemasukan bulan berjalan. Gaji, usaha & pemasukan tetap dianggap selesai
     * begitu ada realisasinya, berapa pun nominalnya (rencana 10 jt, cair 11 jt → yang dipakai 11 jt);
     * piutang dihitung sisa yang belum diterima.
     *
     * @return list<array{key: string, label: string, kind: string, planned: int, realized: int, remaining: int}>
     */
    private function incomeRealization(array $line, CarbonImmutable $month, Collection $active, bool $friendFromMenu): array
    {
        $tx = $this->user->transactions()->where('type', 'income')
            ->whereBetween('date', [$month->toDateString(), $month->endOfMonth()->toDateString()])
            ->get(['id', 'amount', 'category_id', 'plan_key', 'recurring_item_id', 'receivable_schedule_id']);
        $lines = [];
        $add = function (string $key, string $label, string $kind, int $planned, int $realized) use (&$lines) {
            if ($planned > 0 || $realized > 0) {
                $remaining = $kind === 'receivable' ? max(0, $planned - $realized) : ($realized > 0 ? 0 : $planned);
                $lines[] = compact('key', 'label', 'kind', 'planned', 'realized', 'remaining');
            }
        };

        foreach (self::PLAN_INCOME as $key => $label) {
            $add($key, __($label), 'scenario', (int) $line[$key], (int) $tx->where('plan_key', $key)->sum('amount'));
        }

        // Pemasukan tetap: transaksi bertaut, atau bila tidak ada, pemasukan tanpa tautan berkategori sama
        // (hanya bila kategori itu dipakai satu item saja, seperti di Kalender)
        $incomes = $active->where('type', 'income');
        $sharedCategory = $incomes->pluck('category_id')->filter()->countBy();
        $loose = $tx->whereNull('plan_key')->whereNull('recurring_item_id')->whereNull('receivable_schedule_id');
        foreach ($incomes as $item) {
            $realized = (int) $tx->where('recurring_item_id', $item->id)->sum('amount');
            if ($realized === 0 && $item->category_id && $sharedCategory[$item->category_id] === 1) {
                $realized = (int) $loose->where('category_id', $item->category_id)->sum('amount');
            }
            $add("recurring:{$item->id}", $item->name, 'recurring', $item->amount, $realized);
        }

        $received = $friendFromMenu ? (int) $tx->whereNotNull('receivable_schedule_id')->sum('amount') : 0;
        $add('receivable', __('Bunga + pokok piutang'), 'receivable', (int) $line['interest'] + (int) $line['withdraw'], $received);

        return $lines;
    }

    /** Total transfer dari rekening biasa ke Dompet Tujuan di bulan tertentu (sampai hari ini). */
    private function pocketTransfers(CarbonImmutable $month): int
    {
        $pocketIds = $this->user->accounts()->where('type', 'pocket')->pluck('id');

        return (int) $this->user->transactions()
            ->where('type', 'transfer')
            ->whereIn('to_account_id', $pocketIds)
            ->whereNotIn('account_id', $pocketIds)
            ->whereBetween('date', [$month->toDateString(), min($month->endOfMonth(), CarbonImmutable::today())->toDateString()])
            ->sum('amount');
    }

    /** Total pemasukan/pengeluaran aktual per bulan (tanpa transfer, BR-02). */
    private function actualTotals(CarbonImmutable $from, CarbonImmutable $to): array
    {
        if ($from->gt($to)) {
            return [];
        }

        $monthExpr = DB::connection()->getDriverName() === 'sqlite' ? "strftime('%Y-%m', date)" : "DATE_FORMAT(date, '%Y-%m')";
        $rows = $this->user->transactions()
            ->whereIn('type', ['income', 'expense'])
            ->ownMoney()
            ->whereBetween('date', [$from->toDateString(), min($to->endOfMonth(), CarbonImmutable::today())->toDateString()])
            // Belanja dari Dompet Tujuan sudah direncanakan lewat isi dompet bulanan
            ->whereNotIn('account_id', $this->user->accounts()->where('type', 'pocket')->select('id'))
            ->selectRaw("$monthExpr as month, type, SUM(amount) as total")
            ->groupBy('month', 'type')
            ->get();

        $result = [];
        foreach ($rows as $r) {
            $result[$r->month] ??= ['income' => 0, 'expense' => 0];
            $result[$r->month][$r->type] = (int) $r->total;
        }

        return $result;
    }
}
