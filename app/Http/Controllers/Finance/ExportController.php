<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Transaction;
use App\Services\FinanceService;
use App\Support\SimpleXlsx;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Ekspor laporan ke Excel: transaksi, ringkasan per kategori, per tag, dan posisi rekening untuk rentang bulan.
 */
class ExportController extends Controller
{
    public function __invoke(Request $request): BinaryFileResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m'],
            'to' => ['required', 'date_format:Y-m', 'after_or_equal:from'],
        ]);
        $user = $request->user();
        $from = CarbonImmutable::createFromFormat('Y-m-d', $data['from'].'-01')->startOfDay();
        $to = CarbonImmutable::createFromFormat('Y-m-d', $data['to'].'-01')->endOfMonth();
        $range = [$from->toDateString(), $to->toDateString()];

        $transactions = $user->transactions()->whereBetween('date', $range)
            ->with(['account:id,name', 'toAccount:id,name', 'category:id,name,type,system_key', 'tags:id,name'])
            ->orderBy('date')->orderBy('id')->get();

        $types = ['income' => __('Pemasukan'), 'expense' => __('Pengeluaran'), 'transfer' => __('Transfer')];
        $rows = [[__('Tanggal'), __('Jenis'), __('Rekening'), __('Ke rekening'), __('Kategori'), __('Catatan'), __('Tag'), __('Nominal')]];
        foreach ($transactions as $t) {
            $rows[] = [
                $t->date->toDateString(), $types[$t->type] ?? $t->type, $t->account?->name, $t->toAccount?->name,
                $t->category?->name, $t->note, $t->tags->pluck('name')->join(', '),
                $t->type === 'expense' ? -$t->amount : $t->amount,
            ];
        }

        // Ringkasan memakai aturan yang sama dengan Rekap: tanpa titipan & pindahan antar kantong
        $reportableIds = $user->transactions()->whereBetween('date', $range)->reportable()->pluck('id')->flip();
        $summary = [[__('Jenis'), __('Kategori'), __('Jumlah transaksi'), __('Total')]];
        $transactions->filter(fn (Transaction $t) => $t->type !== 'transfer' && isset($reportableIds[$t->id]))
            ->groupBy(fn (Transaction $t) => $t->type.'|'.($t->category?->name ?? __('Tanpa kategori')))
            ->sortKeys()
            ->each(function ($group, $key) use (&$summary, $types) {
                [$type, $name] = explode('|', $key, 2);
                $summary[] = [$types[$type], $name, $group->count(), (int) $group->sum('amount')];
            });

        $tagRows = [[__('Tag'), __('Pemasukan'), __('Pengeluaran')]];
        $transactions->flatMap(fn (Transaction $t) => $t->tags->map(fn ($tag) => [$tag->name, $t]))
            ->groupBy(0)->each(function ($items, $name) use (&$tagRows) {
                $tagRows[] = [$name, (int) collect($items)->where('1.type', 'income')->sum('1.amount'), (int) collect($items)->where('1.type', 'expense')->sum('1.amount')];
            });

        $finance = new FinanceService($user);
        $accounts = [[__('Rekening'), __('Saldo per :date', ['date' => $to->min(CarbonImmutable::today())->toDateString()])]];
        foreach ($finance->accounts(min($to, CarbonImmutable::today())->toDateString()) as $a) {
            $accounts[] = [$a->name, (int) $a->balance];
        }

        $xlsx = (new SimpleXlsx)
            ->sheet(__('Ringkasan'), $summary)
            ->sheet(__('Transaksi'), $rows)
            ->sheet(__('Per Tag'), $tagRows)
            ->sheet(__('Saldo Rekening'), $accounts);

        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $xlsx->save($path);
        ActivityLog::record('export', $data['from'].' – '.$data['to']);

        $name = 'keuangan-'.$data['from'].($data['to'] !== $data['from'] ? '-sd-'.$data['to'] : '').'.xlsx';

        return response()->download($path, $name, ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend();
    }
}
