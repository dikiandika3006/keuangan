<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Rule as AutoRule;
use App\Services\BankCsvParser;
use App\Services\SuggestionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Impor mutasi rekening (CSV): unggah → pratinjau dengan tebakan kategori & tanda duplikat → simpan.
 */
class ImportController extends Controller
{
    public function index(Request $request): Response
    {
        return Inertia::render('import/index', ['preview' => $request->session()->get('import.preview')]);
    }

    public function preview(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
        ]);

        try {
            $parsed = (new BankCsvParser)->parse(file_get_contents($request->file('file')->getRealPath()));
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages(['file' => __('Kolom tanggal & nominal tidak ditemukan. Pastikan file CSV mutasi punya baris judul (Tanggal, Keterangan, Debet/Kredit atau Jumlah).')]);
        }
        if (! $parsed['rows']) {
            throw ValidationException::withMessages(['file' => __('Tidak ada transaksi yang bisa dibaca dari file ini.')]);
        }

        $accountId = (int) $data['account_id'];
        $suggest = new SuggestionService($user);
        $rules = $user->rules()->get();
        $seen = [];
        $rows = collect($parsed['rows'])->take(500)->map(function (array $r) use ($user, $accountId, $suggest, $rules, &$seen) {
            // Baris kembar di file yang sama (mis. dua kopi 20rb sehari) dibedakan dengan urutan kemunculannya
            $key = self::hash($accountId, $r);
            $seen[$key] = ($seen[$key] ?? 0) + 1;
            $hash = $seen[$key] > 1 ? hash('sha256', $key.'#'.$seen[$key]) : $key;
            // Sudah pernah diimpor, atau sudah dicatat manual dengan tanggal, nominal & jenis yang sama
            $duplicate = $user->transactions()->where('import_hash', $hash)->exists()
                || $user->transactions()->where('account_id', $accountId)->where('type', $r['type'])->where('amount', $r['amount'])->whereDate('date', $r['date'])->exists();
            $rule = AutoRule::match($rules, $r['note']);
            $guess = $rule ? ['category_id' => $rule->category_id] : $suggest->suggest($r['note'], $r['type']);

            return [...$r, 'hash' => $hash, 'duplicate' => $duplicate, 'category_id' => $guess['category_id']];
        })->values()->all();

        $request->session()->put('import.preview', ['account_id' => $accountId, 'rows' => $rows, 'skipped' => $parsed['skipped']]);

        return redirect()->route('import.index');
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $preview = $request->session()->get('import.preview');
        abort_unless($preview, 410);

        $data = $request->validate([
            'rows' => ['required', 'array'],
            'rows.*.include' => ['boolean'],
            'rows.*.category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $user->id)],
        ]);

        $count = 0;
        DB::transaction(function () use ($user, $preview, $data, &$count) {
            foreach ($preview['rows'] as $i => $row) {
                $choice = $data['rows'][$i] ?? null;
                if (! ($choice['include'] ?? false) || $user->transactions()->where('import_hash', $row['hash'])->exists()) {
                    continue;
                }
                $user->transactions()->create([
                    'type' => $row['type'],
                    'account_id' => $preview['account_id'],
                    'category_id' => $choice['category_id'] ?? null,
                    'amount' => $row['amount'],
                    'date' => $row['date'],
                    'note' => $row['note'] ?: null,
                    'source' => 'import',
                    'import_hash' => $row['hash'],
                ]);
                $count++;
            }
        });

        $request->session()->forget('import.preview');

        return redirect()->route('transactions.index', ['month' => 'all'])->with('success', __(':n transaksi diimpor.', ['n' => $count]));
    }

    public function cancel(Request $request): RedirectResponse
    {
        $request->session()->forget('import.preview');

        return redirect()->route('import.index');
    }

    private static function hash(int $accountId, array $r): string
    {
        return hash('sha256', implode('|', [$accountId, $r['date'], $r['type'], $r['amount'], mb_strtolower($r['note'])]));
    }
}
