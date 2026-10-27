<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class FinanceService
{
    public function __construct(private User $user) {}

    /**
     * Semua rekening beserta saldo per tanggal (default hari ini; transaksi bertanggal depan belum dihitung, BR-03).
     */
    public function accounts(?string $asOf = null): Collection
    {
        $tx = $this->user->transactions()->where('date', '<=', $asOf ?? now()->toDateString());

        $in = (clone $tx)->where('type', 'income')->groupBy('account_id')
            ->selectRaw('account_id, SUM(amount) as total')->pluck('total', 'account_id');
        $out = (clone $tx)->whereIn('type', ['expense', 'transfer'])->groupBy('account_id')
            ->selectRaw('account_id, SUM(amount) as total')->pluck('total', 'account_id');
        $transferIn = (clone $tx)->where('type', 'transfer')->groupBy('to_account_id')
            ->selectRaw('to_account_id, SUM(amount) as total')->pluck('total', 'to_account_id');

        return $this->user->accounts()->orderBy('name')->get()->map(function (Account $a) use ($in, $out, $transferIn) {
            $a->balance = $a->initial_balance
                + (int) ($in[$a->id] ?? 0)
                + (int) ($transferIn[$a->id] ?? 0)
                - (int) ($out[$a->id] ?? 0);

            return $a;
        });
    }

    /**
     * Pemasukan & pengeluaran per bulan untuk N bulan terakhir (termasuk bulan ini).
     */
    public function monthlySeries(int $months = 12): array
    {
        $start = CarbonImmutable::now()->startOfMonth()->subMonths($months - 1);
        $monthExpr = DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%Y-%m', date)"
            : "DATE_FORMAT(date, '%Y-%m')";

        $rows = $this->user->transactions()
            ->whereIn('type', ['income', 'expense'])
            ->where('date', '>=', $start->toDateString())
            ->selectRaw("$monthExpr as month, type, SUM(amount) as total")
            ->groupBy('month', 'type')
            ->get();

        $series = [];
        for ($i = 0; $i < $months; $i++) {
            $m = $start->addMonths($i);
            $key = $m->format('Y-m');
            $income = (int) $rows->where('month', $key)->where('type', 'income')->sum('total');
            $expense = (int) $rows->where('month', $key)->where('type', 'expense')->sum('total');
            $series[] = [
                'month' => $key,
                'label' => $m->locale('id')->translatedFormat('M y'),
                'income' => $income,
                'expense' => $expense,
                'net' => $income - $expense,
            ];
        }

        return $series;
    }

    /**
     * Rata-rata pemasukan/pengeluaran bulanan dari bulan-bulan sebelumnya yang punya data.
     * Jika belum ada riwayat, pakai bulan berjalan, lalu fallback ke item rutin.
     */
    public function averages(int $months = 3): array
    {
        $series = collect($this->monthlySeries($months + 1));
        $past = $series->slice(0, $months)->filter(fn ($m) => $m['income'] > 0 || $m['expense'] > 0);

        if ($past->isEmpty()) {
            $past = $series->slice($months)->filter(fn ($m) => $m['income'] > 0 || $m['expense'] > 0);
        }

        $recurring = $this->recurringTotals();

        return [
            'income' => $past->isNotEmpty() ? (int) round($past->avg('income')) : $recurring['income'],
            'expense' => $past->isNotEmpty() ? (int) round($past->avg('expense')) : $recurring['expense'],
            'months_of_data' => $past->count(),
        ];
    }

    public function recurringTotals(): array
    {
        $today = now()->toDateString();
        $items = $this->user->recurringItems()
            ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', $today))
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $today))
            ->get();

        return [
            'income' => (int) $items->where('type', 'income')->sum('amount'),
            'expense' => (int) $items->where('type', 'expense')->sum('amount'),
        ];
    }

    /**
     * Ringkasan posisi keuangan (BR-01): uang siap pakai, dana darurat, piutang, aset, utang, kekayaan bersih.
     * Dengan $asOf hanya saldo rekening yang dihitung mundur; piutang, aset & utang memakai nilai terkini.
     */
    public function position(?string $asOf = null): array
    {
        $accounts = $this->accounts($asOf);
        $debts = $this->user->debts()->get();

        $liquid = (int) $accounts->where('type', '!=', 'investment')->sum('balance');
        $investment = (int) $accounts->where('type', 'investment')->sum('balance');
        $flagged = $accounts->where('is_emergency_fund', true);
        $emergency = $flagged->isNotEmpty() ? (int) $flagged->sum('balance') : $liquid;
        $totalDebt = (int) $debts->sum('remaining_amount');
        // Dompet Tujuan (kesehatan, tabungan anak, dll.) sudah dialokasikan, bukan uang siap pakai
        $pockets = (int) $accounts->where('type', 'pocket')->where('is_emergency_fund', false)->sum('balance');

        if ($asOf !== null) {
            return ['liquid' => $liquid, 'investment' => $investment, 'pockets' => $pockets];
        }

        $receivables = (int) $this->user->receivables()->get()->sum(fn ($r) => $r->remainingPrincipal());
        $assets = (int) $this->user->assets()->with('latestValuation')->get()->sum(fn ($a) => $a->currentValue());

        return [
            'total_assets' => $liquid + $investment + $receivables + $assets,
            'liquid' => $liquid,
            'spendable' => $liquid - ($flagged->isNotEmpty() ? $emergency : 0) - $pockets,
            'pockets' => $pockets,
            'investment' => $investment,
            'receivables' => $receivables,
            'other_assets' => $assets,
            'emergency_fund' => $emergency,
            'emergency_fund_flagged' => $flagged->isNotEmpty(),
            'total_debt' => $totalDebt,
            'monthly_debt_payment' => (int) $debts->where('remaining_amount', '>', 0)->sum('monthly_payment'),
            'net_worth' => $liquid + $investment + $receivables + $assets - $totalDebt,
        ];
    }

    /**
     * Rekonsiliasi (ACC-04, BR-22): samakan saldo aplikasi dengan saldo sebenarnya per tanggal.
     * Selisihnya dicatat sebagai transaksi Pengeluaran/Pemasukan Tidak Dirinci.
     */
    public function reconcile(Account $account, int $actual, string $date): ?Transaction
    {
        $current = (int) $this->accounts($date)->firstWhere('id', $account->id)->balance;
        $diff = $current - $actual;

        $tx = null;
        if ($diff !== 0) {
            $tx = $this->user->transactions()->create([
                'type' => $diff > 0 ? 'expense' : 'income',
                'account_id' => $account->id,
                'category_id' => Category::system($this->user, $diff > 0 ? 'unspecified_expense' : 'unspecified_income')->id,
                'amount' => abs($diff),
                'date' => $date,
                'note' => 'Rekonsiliasi saldo',
                'source' => 'reconcile',
            ]);
        }

        if (! $account->last_reconciled_at || $date >= $account->last_reconciled_at->toDateString()) {
            $account->update(['last_reconciled_at' => $date, 'last_reconciled_balance' => $actual]);
        }

        return $tx;
    }

    /**
     * Indikator kesehatan keuangan beserta saran.
     */
    public function health(array $position, array $avg, array $thisMonth): array
    {
        $checks = [];

        $efMonths = $avg['expense'] > 0 ? $position['emergency_fund'] / $avg['expense'] : null;
        $checks[] = [
            'key' => 'emergency_fund',
            'label' => 'Dana darurat',
            'value' => $efMonths === null ? '-' : number_format($efMonths, 1, ',', '.').' bln',
            'status' => $efMonths === null ? 'unknown' : ($efMonths >= 6 ? 'good' : ($efMonths >= 3 ? 'warning' : 'bad')),
            'hint' => 'Idealnya 3–6x pengeluaran bulanan (6–12x jika sudah berkeluarga / pekerja lepas).',
        ];

        $savingRate = $avg['income'] > 0 ? ($avg['income'] - $avg['expense']) / $avg['income'] * 100 : null;
        $checks[] = [
            'key' => 'saving_rate',
            'label' => 'Rasio tabungan',
            'value' => $savingRate === null ? '-' : number_format($savingRate, 0, ',', '.').'%',
            'status' => $savingRate === null ? 'unknown' : ($savingRate >= 20 ? 'good' : ($savingRate >= 10 ? 'warning' : 'bad')),
            'hint' => 'Sisihkan minimal 20% pemasukan untuk tabungan & investasi.',
        ];

        $debtRatio = $avg['income'] > 0 ? $position['monthly_debt_payment'] / $avg['income'] * 100 : null;
        $checks[] = [
            'key' => 'debt_ratio',
            'label' => 'Rasio cicilan',
            'value' => $debtRatio === null ? '-' : number_format($debtRatio, 0, ',', '.').'%',
            'status' => $debtRatio === null ? 'unknown' : ($debtRatio <= 30 ? 'good' : ($debtRatio <= 40 ? 'warning' : 'bad')),
            'hint' => 'Total cicilan sebaiknya maksimal 30% dari pemasukan.',
        ];

        $investRatio = $position['total_assets'] > 0 ? $position['investment'] / $position['total_assets'] * 100 : null;
        $checks[] = [
            'key' => 'investment_ratio',
            'label' => 'Porsi investasi',
            'value' => $investRatio === null ? '-' : number_format($investRatio, 0, ',', '.').'%',
            'status' => $investRatio === null ? 'unknown' : ($investRatio >= 50 ? 'good' : ($investRatio >= 20 ? 'warning' : 'bad')),
            'hint' => 'Setelah dana darurat aman, kembangkan aset lewat investasi agar tidak tergerus inflasi.',
        ];

        $budgetOver = $thisMonth['expense'] > $thisMonth['income'] && $thisMonth['income'] > 0;
        $checks[] = [
            'key' => 'cashflow',
            'label' => 'Arus kas bulan ini',
            'value' => $thisMonth['income'] - $thisMonth['expense'] >= 0 ? 'Surplus' : 'Defisit',
            'status' => $thisMonth['income'] === 0 && $thisMonth['expense'] === 0 ? 'unknown' : ($budgetOver ? 'bad' : 'good'),
            'hint' => 'Pastikan pengeluaran bulanan tidak melebihi pemasukan.',
        ];

        $known = collect($checks)->where('status', '!=', 'unknown');
        $score = $known->isEmpty() ? null : (int) round($known->avg(fn ($c) => ['good' => 100, 'warning' => 60, 'bad' => 20][$c['status']]));

        return ['score' => $score, 'checks' => $checks];
    }
}
