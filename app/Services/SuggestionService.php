<?php

namespace App\Services;

use App\Models\Rule;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Tebakan untuk catat cepat & impor: kategori/rekening dari aturan otomatis, lalu dari riwayat transaksi
 * dengan catatan serupa; plus daftar transaksi yang sering dicatat.
 */
class SuggestionService
{
    public function __construct(private User $user) {}

    /** @return array{category_id: ?int, account_id: ?int, type: ?string, source: ?string} */
    public function suggest(string $note, ?string $type = null): array
    {
        $note = trim($note);
        $result = ['category_id' => null, 'account_id' => null, 'type' => null, 'source' => null];

        if ($rule = Rule::match($this->user->rules()->with('category:id,type')->get(), $note)) {
            $result = [
                'category_id' => $rule->category_id,
                'account_id' => $rule->account_id,
                'type' => $rule->category?->type,
                'source' => 'rule',
            ];
        } elseif ($note !== '') {
            // Kata terpanjang (≥ 3 huruf) dari catatan dicari di riwayat 1 tahun terakhir
            $word = collect(preg_split('/[^\pL\pN]+/u', Str::lower($note)))->filter(fn ($w) => mb_strlen($w) >= 3)->sortByDesc(fn ($w) => mb_strlen($w))->first();
            if ($word) {
                $hit = $this->user->transactions()
                    ->whereIn('type', $type ? [$type] : ['income', 'expense'])
                    ->whereNotNull('category_id')
                    ->where('note', 'like', "%{$word}%")
                    ->where('date', '>=', now()->subYear()->toDateString())
                    ->select('category_id', 'type', DB::raw('COUNT(*) as n'), DB::raw('MAX(account_id) as account_id'))
                    ->groupBy('category_id', 'type')
                    ->orderByDesc('n')
                    ->first();
                if ($hit) {
                    $result = ['category_id' => (int) $hit->category_id, 'account_id' => (int) $hit->account_id, 'type' => $hit->type, 'source' => 'history'];
                }
            }
        }

        // Rekening default: yang paling sering dipakai 60 hari terakhir
        $result['account_id'] ??= $this->user->transactions()
            ->where('date', '>=', now()->subDays(60)->toDateString())
            ->whereIn('account_id', $this->user->accounts()->where('is_archived', false)->select('id'))
            ->select('account_id', DB::raw('COUNT(*) as n'))->groupBy('account_id')->orderByDesc('n')->value('account_id');

        return $result;
    }

    /** Kombinasi (jenis, rekening, kategori, catatan, nominal) yang muncul ≥ 2 kali dalam 90 hari. */
    public function frequent(int $limit = 8): array
    {
        return $this->user->transactions()
            ->whereIn('type', ['income', 'expense'])
            ->whereNotNull('category_id')
            ->whereNull('recurring_item_id')
            ->whereNull('debt_installment_id')
            ->whereNull('receivable_schedule_id')
            ->where('source', 'manual')
            ->where('date', '>=', now()->subDays(90)->toDateString())
            ->whereIn('account_id', $this->user->accounts()->where('is_archived', false)->select('id'))
            ->select('type', 'account_id', 'category_id', 'note', 'amount', DB::raw('COUNT(*) as n'), DB::raw('MAX(date) as last_date'))
            ->groupBy('type', 'account_id', 'category_id', 'note', 'amount')
            ->having('n', '>=', 2)
            ->orderByDesc('n')->orderByDesc('last_date')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'type' => $r->type,
                'account_id' => (int) $r->account_id,
                'category_id' => (int) $r->category_id,
                'note' => $r->note,
                'amount' => (int) $r->amount,
                'count' => (int) $r->n,
            ])
            ->all();
    }
}
