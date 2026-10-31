<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Category;
use App\Models\Goal;
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
            ->reportable()
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
                'label' => $m->locale(app()->getLocale())->translatedFormat('M y'),
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
     * Saldo tiap titipan (kategori bertipe titipan): masuk − keluar sampai tanggal tertentu.
     * Saldo positif = uang orang lain yang masih dipegang. Dengan $inAccountsOnly hanya transaksi yang
     * tercatat di rekening (titipan lama); titipan baru dicatat tanpa rekening sehingga tidak ada di saldo rekening.
     */
    public function heldFunds(?string $asOf = null, bool $inAccountsOnly = false): Collection
    {
        $categories = $this->user->categories()->where('type', Category::TITIPAN)->orderBy('name')->get();
        if ($categories->isEmpty()) {
            return collect();
        }

        $totals = $this->user->transactions()
            ->whereIn('category_id', $categories->pluck('id'))
            ->when($inAccountsOnly, fn ($q) => $q->whereNotNull('account_id'))
            ->where('date', '<=', $asOf ?? now()->toDateString())
            ->selectRaw('category_id, type, SUM(amount) as total, COUNT(*) as count, MAX(date) as last_date')
            ->groupBy('category_id', 'type')
            ->get();

        return $categories->map(function (Category $c) use ($totals) {
            $rows = $totals->where('category_id', $c->id);
            $in = (int) $rows->firstWhere('type', 'income')?->total;
            $out = (int) $rows->firstWhere('type', 'expense')?->total;

            return [
                ...$c->only(['id', 'name', 'color']),
                'in' => $in,
                'out' => $out,
                'balance' => $in - $out,
                'count' => (int) $rows->sum('count'),
                'last_date' => $rows->max('last_date'),
            ];
        })->values();
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
        $totalDebt = (int) $debts->sum('remaining_amount');
        // Dompet Tujuan (kesehatan, tabungan anak, dll.) sudah dialokasikan, bukan uang siap pakai
        $pockets = (int) $accounts->where('type', 'pocket')->where('is_emergency_fund', false)->sum('balance');

        // Uang titipan/usaha yang masih mengendap di rekening: milik orang lain (titipan tanpa rekening tidak ada di saldo)
        $held = (int) $this->heldFunds($asOf, true)->sum(fn ($f) => max(0, $f['balance']));
        // Tanpa rekening bertanda dana darurat: pakai uang likuid milik sendiri yang belum dialokasikan
        $emergency = $flagged->isNotEmpty() ? (int) $flagged->sum('balance') : max(0, $liquid - $pockets - $held);

        if ($asOf !== null) {
            return ['liquid' => $liquid, 'investment' => $investment, 'pockets' => $pockets, 'held' => $held];
        }

        $receivables = (int) $this->user->receivables()->get()->sum(fn ($r) => $r->remainingPrincipal());
        $assetList = $this->user->assets()->with('latestValuation')->get();
        $assets = (int) $assetList->sum(fn ($a) => $a->currentValue());
        // Aset investasi (reksa dana, Pelagic, JHT) ikut dihitung di porsi investasi, bukan hanya rekening investasi
        $investedAssets = (int) $assetList->whereIn('kind', ['investment', 'jht'])->sum(fn ($a) => $a->currentValue());

        return [
            // Uang titipan ada di rekening tetapi milik orang lain, jadi tidak dihitung sebagai aset
            'total_assets' => $liquid - $held + $investment + $receivables + $assets,
            'liquid' => $liquid,
            'spendable' => $liquid - ($flagged->isNotEmpty() ? $emergency : 0) - $pockets - $held,
            'pockets' => $pockets,
            'held' => $held,
            'investment' => $investment,
            'receivables' => $receivables,
            'other_assets' => $assets,
            'invested' => $investment + $investedAssets,
            'emergency_fund' => $emergency,
            'emergency_fund_flagged' => $flagged->isNotEmpty(),
            'total_debt' => $totalDebt,
            'monthly_debt_payment' => (int) $debts->where('remaining_amount', '>', 0)->sum('monthly_payment'),
            'net_worth' => $liquid - $held + $investment + $receivables + $assets - $totalDebt,
        ];
    }

    /**
     * Kekayaan bersih di akhir tiap bulan, N bulan terakhir (bulan ini = posisi hari ini).
     * Saldo rekening, nilai aset & sisa pokok piutang dihitung mundur per tanggal; utang berjadwal dari cicilan
     * yang belum lunas pada tanggal itu, utang tanpa jadwal memakai sisa saat ini (tidak punya riwayat).
     *
     * @return list<array{month: string, label: string, assets: int, debt: int, net_worth: int}>
     */
    public function netWorthHistory(int $months = 12): array
    {
        $debts = $this->user->debts()->with('installments')->get();
        $receivables = $this->user->receivables()->with('schedules')->get();
        $assets = $this->user->assets()->with('valuations')->get();
        $principalTx = $this->user->transactions()
            ->whereNotNull('receivable_schedule_id')
            ->whereHas('category', fn ($q) => $q->where('system_key', 'receivable_principal'))
            ->get(['receivable_schedule_id', 'amount', 'date']);

        $history = [];
        $start = CarbonImmutable::now()->startOfMonth()->subMonths($months - 1);
        for ($i = 0; $i < $months; $i++) {
            $m = $start->addMonths($i);
            $asOf = ($i === $months - 1 ? CarbonImmutable::today() : $m->endOfMonth())->toDateString();
            $p = $this->position($asOf);

            $assetValue = (int) $assets->sum(fn ($a) => $a->valuations->first(fn ($v) => $v->date->toDateString() <= $asOf)?->value ?? 0);
            $receivable = (int) $receivables->sum(function ($r) use ($principalTx, $asOf) {
                $ids = $r->schedules->pluck('id');

                return max(0, $r->principal + (int) $r->topupsByMonth($asOf)->sum() - (int) $principalTx->whereIn('receivable_schedule_id', $ids)->filter(fn ($t) => $t->date->toDateString() <= $asOf)->sum('amount'));
            });
            $debt = (int) $debts->sum(fn ($d) => $d->hasSchedule()
                ? $d->installments->filter(fn ($x) => ! $x->paid_at || $x->paid_at->toDateString() > $asOf)->sum('amount')
                : $d->remaining_amount);

            $total = $p['liquid'] - $p['held'] + $p['investment'] + $assetValue + $receivable;
            $history[] = [
                'month' => $m->format('Y-m'),
                'label' => $m->locale(app()->getLocale())->translatedFormat('M y'),
                'assets' => $total,
                'debt' => $debt,
                'net_worth' => $total - $debt,
            ];
        }

        return $history;
    }

    /**
     * Target keuangan. Target yang ditautkan ke rekening/Dompet Tujuan atau aset memakai saldo/nilainya
     * sebagai dana terkumpul, sehingga uang yang sama tidak dicatat dua kali.
     */
    public function goals(): Collection
    {
        $goals = $this->user->goals()->with(['account:id,name', 'asset'])->orderBy('priority')->orderBy('target_date')->get();
        $balances = $goals->contains(fn (Goal $g) => $g->account_id) ? $this->accounts()->pluck('balance', 'id') : collect();

        return $goals->map(function (Goal $g) use ($balances) {
            $g->linked = null;
            if ($g->account) {
                $g->current_amount = max(0, (int) ($balances[$g->account_id] ?? 0));
                $g->linked = ['type' => 'account', 'name' => $g->account->name];
            } elseif ($g->asset) {
                $g->current_amount = $g->asset->currentValue();
                $g->linked = ['type' => 'asset', 'name' => $g->asset->name];
            }
            $g->unsetRelation('asset');

            return $g;
        });
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
            'label' => __('Dana darurat'),
            'value' => $efMonths === null ? '-' : __(':n bln', ['n' => number_format($efMonths, 1, ',', '.')]),
            'status' => $efMonths === null ? 'unknown' : ($efMonths >= 6 ? 'good' : ($efMonths >= 3 ? 'warning' : 'bad')),
            'hint' => __('Idealnya 3–6x pengeluaran bulanan (6–12x jika sudah berkeluarga / pekerja lepas).'),
        ];

        $savingRate = $avg['income'] > 0 ? ($avg['income'] - $avg['expense']) / $avg['income'] * 100 : null;
        $checks[] = [
            'key' => 'saving_rate',
            'label' => __('Rasio tabungan'),
            'value' => $savingRate === null ? '-' : number_format($savingRate, 0, ',', '.').'%',
            'status' => $savingRate === null ? 'unknown' : ($savingRate >= 20 ? 'good' : ($savingRate >= 10 ? 'warning' : 'bad')),
            'hint' => __('Sisihkan minimal 20% pemasukan untuk tabungan & investasi.'),
        ];

        $debtRatio = $avg['income'] > 0 ? $position['monthly_debt_payment'] / $avg['income'] * 100 : null;
        $checks[] = [
            'key' => 'debt_ratio',
            'label' => __('Rasio cicilan'),
            'value' => $debtRatio === null ? '-' : number_format($debtRatio, 0, ',', '.').'%',
            'status' => $debtRatio === null ? 'unknown' : ($debtRatio <= 30 ? 'good' : ($debtRatio <= 40 ? 'warning' : 'bad')),
            'hint' => __('Total cicilan sebaiknya maksimal 30% dari pemasukan.'),
        ];

        $investRatio = $position['total_assets'] > 0 ? $position['invested'] / $position['total_assets'] * 100 : null;
        $checks[] = [
            'key' => 'investment_ratio',
            'label' => __('Porsi investasi'),
            'value' => $investRatio === null ? '-' : number_format($investRatio, 0, ',', '.').'%',
            'status' => $investRatio === null ? 'unknown' : ($investRatio >= 50 ? 'good' : ($investRatio >= 20 ? 'warning' : 'bad')),
            'hint' => __('Setelah dana darurat aman, kembangkan aset lewat investasi agar tidak tergerus inflasi.'),
        ];

        $budgetOver = $thisMonth['expense'] > $thisMonth['income'] && $thisMonth['income'] > 0;
        $checks[] = [
            'key' => 'cashflow',
            'label' => __('Arus kas bulan ini'),
            'value' => $thisMonth['income'] - $thisMonth['expense'] >= 0 ? __('Surplus') : __('Defisit'),
            'status' => $thisMonth['income'] === 0 && $thisMonth['expense'] === 0 ? 'unknown' : ($budgetOver ? 'bad' : 'good'),
            'hint' => __('Pastikan pengeluaran bulanan tidak melebihi pemasukan.'),
        ];

        $known = collect($checks)->where('status', '!=', 'unknown');
        $score = $known->isEmpty() ? null : (int) round($known->avg(fn ($c) => ['good' => 100, 'warning' => 60, 'bad' => 20][$c['status']]));

        return ['score' => $score, 'checks' => $checks];
    }
}
