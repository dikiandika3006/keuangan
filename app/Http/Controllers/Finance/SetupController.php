<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\ProjectionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Isi data awal dari Ringkasan Rencana Keuangan 21 Okt 2026 (bagian 2.2 SRS).
 * Hanya membuat data yang belum ada (dicek dari nama), jadi aman ditekan dua kali.
 */
class SetupController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $user = $request->user();

        DB::transaction(function () use ($user) {
            $debts = [
                ['name' => 'Cicilan Mobil', 'kind' => 'car', 'monthly_payment' => 10_000_000, 'tenor_months' => 14],
                ['name' => 'Cicilan Rumah', 'kind' => 'house', 'monthly_payment' => 3_000_000, 'tenor_months' => 68],
            ];
            foreach ($debts as $d) {
                if ($user->debts()->where('name', $d['name'])->exists()) {
                    continue;
                }
                $total = $d['monthly_payment'] * $d['tenor_months'];
                $user->debts()->create([...$d, 'total_amount' => $total, 'remaining_amount' => $total, 'interest_rate' => 0, 'start_month' => '2026-11-01'])->syncSchedule();
            }

            if (! $user->receivables()->where('counterparty', 'Investasi di teman')->exists()) {
                $user->receivables()->create([
                    'counterparty' => 'Investasi di teman',
                    'principal' => 150_000_000,
                    'interest_pct' => 1,
                    'withdrawal' => 5_000_000,
                    'withdrawal_change_month' => '2028-01-01', // setelah mobil lunas: ambil bunganya saja
                    'withdrawal_after' => 0,
                    'due_day' => 1,
                    'start_month' => '2026-11-01',
                    'note' => 'Pastikan perjanjian tertulis',
                ])->syncSchedule();
            }

            $assets = [
                ['name' => 'Pelagic Capital', 'kind' => 'investment', 'target_value' => 1_000_000_000, 'color' => '#8b5cf6', 'value' => 34_000_000],
                ['name' => 'JHT BPJS Ketenagakerjaan', 'kind' => 'jht', 'target_value' => null, 'color' => '#10b981', 'value' => 6_000_000],
            ];
            foreach ($assets as $a) {
                if ($user->assets()->where('name', $a['name'])->exists()) {
                    continue;
                }
                $value = $a['value'];
                unset($a['value']);
                $user->assets()->create($a)->valuations()->create(['date' => now()->toDateString(), 'value' => $value, 'note' => 'Nilai awal']);
            }

            ProjectionService::ensureScenarios($user);
        });

        return back()->with('success', 'Data awal dari rencana 21 Okt 2026 ditambahkan. Cek tanggal jatuh tempo di Utang & Piutang.');
    }
}
