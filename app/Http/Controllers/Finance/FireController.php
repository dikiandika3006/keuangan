<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\FinanceService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Kalkulator FIRE. Tab Realisasi memakai kekayaan bersih akhir tiap bulan sejak transaksi pertama (maks. 5 tahun),
 * dirinci jadi tabungan (pemasukan − pengeluaran) dan hasil investasi.
 */
class FireController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $first = $user->transactions()->min('date');
        $months = $first
            ? min(60, max(2, (int) CarbonImmutable::parse($first)->startOfMonth()->diffInMonths(CarbonImmutable::now()->startOfMonth()) + 1))
            : 2;

        return Inertia::render('calculator/fire', [
            'history' => Inertia::defer(fn () => $this->history($user, $months)),
        ]);
    }

    /**
     * Hasil invest = pemasukan − pengeluaran di rekening investasi (dividen, rekonsiliasi naik/turun)
     * + perubahan nilai aset investasi/JHT di luar setoran & pencairan.
     * Tabungan = pemasukan − pengeluaran pribadi di rekening lain (pindahan internal tidak dihitung).
     */
    private function history(User $user, int $months): array
    {
        // Satu bulan ekstra di depan sebagai pembanding kenaikan bulan pertama
        $history = (new FinanceService($user))->netWorthHistory($months + 1);
        $from = $history[1]['month'].'-01';

        $investAccounts = $user->accounts()->where('type', 'investment')->pluck('id')->all();
        $assets = $user->assets()->whereIn('kind', ['investment', 'jht'])->with('valuations')->get();
        $valueAt = fn (string $date) => (int) $assets->sum(fn ($a) => $a->valuations->first(fn ($v) => $v->date->toDateString() <= $date)?->value ?? 0);

        $flows = $user->transactions()->reportable()->whereIn('type', ['income', 'expense'])->where('date', '>=', $from)
            ->get(['type', 'account_id', 'amount', 'date'])
            ->groupBy(fn ($t) => $t->date->format('Y-m'));
        $moves = $user->transactions()->whereIn('asset_id', $assets->pluck('id'))->where('date', '>=', $from)
            ->get(['type', 'amount', 'date'])
            ->groupBy(fn ($t) => $t->date->format('Y-m'));
        $net = fn ($rows) => (int) collect($rows)->sum(fn ($t) => $t->type === 'income' ? $t->amount : -$t->amount);

        $rows = [];
        $today = CarbonImmutable::today()->toDateString();
        for ($i = 1; $i < count($history); $i++) {
            $m = $history[$i]['month'];
            $end = min($today, CarbonImmutable::parse($m.'-01')->endOfMonth()->toDateString());
            $prevEnd = CarbonImmutable::parse($m.'-01')->subDay()->toDateString();
            $monthFlows = $flows[$m] ?? collect();
            [$invest, $own] = $monthFlows->partition(fn ($t) => in_array($t->account_id, $investAccounts, true));
            // Setoran ke aset tercatat sebagai pengeluaran (nilai naik), pencairan sebagai pemasukan (nilai turun)
            $assetGain = $valueAt($end) - $valueAt($prevEnd) + $net($moves[$m] ?? []);

            $rows[] = [
                'month' => $m,
                'label' => $history[$i]['label'],
                'net_worth' => $history[$i]['net_worth'],
                'change' => $history[$i]['net_worth'] - $history[$i - 1]['net_worth'],
                'saving' => $net($own),
                'investment_return' => $net($invest) + $assetGain,
            ];
        }

        return $rows;
    }
}
