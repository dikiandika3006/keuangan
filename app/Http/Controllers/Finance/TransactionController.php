<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Rule as AutoRule;
use App\Models\Transaction;
use App\Services\SuggestionService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TransactionController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $filters = $request->only(['month', 'type', 'account_id', 'category_id', 'tag_id', 'search']);
        $month = $filters['month'] ?? now()->format('Y-m');

        $query = $user->transactions()
            ->ownMoney()
            ->with(['account:id,name,color', 'toAccount:id,name', 'category:id,name,color,system_key', 'tags:id,name,color'])
            ->when($month !== 'all', function ($q) use ($month) {
                $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01');
                $q->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()]);
            })
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($filters['account_id'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('account_id', $v)->orWhere('to_account_id', $v)))
            ->when($filters['category_id'] ?? null, fn ($q, $v) => $q->where('category_id', $v))
            ->when($filters['tag_id'] ?? null, fn ($q, $v) => $q->whereHas('tags', fn ($t) => $t->where('tags.id', $v)))
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where('note', 'like', "%{$v}%"));

        $totals = (clone $query)->reorder()->reportable()->selectRaw('type, SUM(amount) as total')->groupBy('type')->pluck('total', 'type');

        return Inertia::render('transactions/index', [
            'transactions' => $query->latest('date')->latest('id')->paginate(25)->withQueryString(),
            'totals' => [
                'income' => (int) ($totals['income'] ?? 0),
                'expense' => (int) ($totals['expense'] ?? 0),
            ],
            'filters' => [...$filters, 'month' => $month],
            'accounts' => $user->accounts()->orderBy('name')->get(['id', 'name']),
            'categories' => $user->categories()->where('type', '!=', Category::TITIPAN)->orderBy('name')->get(['id', 'name', 'type', 'color']),
            'tags' => $user->tags()->orderBy('name')->get(['id', 'name', 'color']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $this->validated($request);
        $splits = $request->validate([
            'splits' => ['nullable', 'array', 'min:2', 'max:10'],
            'splits.*.category_id' => ['required', Rule::exists('categories', 'id')->where('user_id', $user->id)],
            'splits.*.amount' => ['required', 'integer', 'min:1'],
            'splits.*.note' => ['nullable', 'string', 'max:255'],
        ])['splits'] ?? null;
        abort_if($splits && $data['type'] === 'transfer', 422, 'Transfer tidak bisa dipecah.');

        DB::transaction(function () use ($request, $user, $data, $splits) {
            // Pecah transaksi: satu struk → beberapa transaksi berkategori berbeda dengan kode grup sama
            $rows = $splits
                ? collect($splits)->map(fn ($s) => [...$data, 'category_id' => $s['category_id'], 'amount' => $s['amount'], 'note' => ($s['note'] ?? null) ?: ($data['note'] ?? null)])->all()
                : [$data];
            $group = $splits ? (string) Str::uuid() : null;

            foreach ($rows as $i => $row) {
                $transaction = $user->transactions()->create([...$this->applyRules($user, $row), 'split_group' => $group]);
                $this->syncTags($request, $transaction);
                if ($i === 0) {
                    $this->syncAttachment($request, $transaction);
                }
            }
        });

        return back()->with('success', $splits ? __('Transaksi dipecah jadi :n.', ['n' => count($splits)]) : __('Transaksi disimpan.'));
    }

    public function update(Request $request, Transaction $transaction): RedirectResponse
    {
        $this->ensureOwner($transaction);
        $transaction->update($this->validated($request, $transaction));
        $this->syncTags($request, $transaction);
        $this->syncAttachment($request, $transaction);

        return back()->with('success', __('Transaksi diperbarui.'));
    }

    /** Tebakan kategori & rekening dari aturan dan riwayat untuk catatan yang diketik (catat cepat). */
    public function suggest(Request $request): JsonResponse
    {
        return response()->json((new SuggestionService($request->user()))->suggest((string) $request->query('note'), $request->query('type')));
    }

    /** Transaksi yang sering dicatat (90 hari terakhir) untuk tombol satu-ketuk. */
    public function frequent(Request $request): JsonResponse
    {
        return response()->json((new SuggestionService($request->user()))->frequent());
    }

    /** Tampilkan bukti transaksi (hanya pemiliknya). */
    public function attachment(Transaction $transaction): StreamedResponse
    {
        $this->ensureOwner($transaction);
        abort_unless($transaction->attachment_path && Storage::disk('local')->exists($transaction->attachment_path), 404);

        return Storage::disk('local')->response(
            $transaction->attachment_path,
            $transaction->attachment_name,
            ['Cache-Control' => 'private, max-age=86400'],
        );
    }

    public function destroy(Transaction $transaction): RedirectResponse
    {
        $this->ensureOwner($transaction);
        $transaction->delete();

        return back()->with('success', __('Transaksi dihapus.'));
    }

    /**
     * Aturan otomatis: catatan cocok kata kunci → kategori (bila belum dipilih) dan tautan ke Biaya Bulanan,
     * supaya mis. "PLN" langsung tercatat sebagai pembayaran tagihan listrik bulan itu.
     */
    private function applyRules($user, array $row): array
    {
        if ($row['type'] === 'transfer') {
            return $row;
        }
        $rule = AutoRule::match($user->rules()->get(), $row['note'] ?? null);
        if (! $rule) {
            return $row;
        }
        if (empty($row['category_id']) && $rule->category_id) {
            $row['category_id'] = $rule->category_id;
        }
        if ($row['type'] === 'expense' && $rule->recurringItem?->activeIn(substr($row['date'], 0, 7))) {
            $row['recurring_item_id'] = $rule->recurring_item_id;
        }

        return $row;
    }

    private function syncTags(Request $request, Transaction $transaction): void
    {
        if (! $request->has('tags') && ! $request->boolean('tags_present')) {
            return;
        }
        $names = collect($request->input('tags', []))->map(fn ($n) => trim(mb_substr((string) $n, 0, 50)))->filter()->unique(fn ($n) => mb_strtolower($n));
        $user = $request->user();
        $existing = $user->tags()->get();
        $ids = $names->map(fn ($name) => ($existing->first(fn ($t) => mb_strtolower($t->name) === mb_strtolower($name))
            ?? $user->tags()->create(['name' => $name, 'color' => self::TAG_COLORS[$existing->count() % count(self::TAG_COLORS)]]))->id);
        $transaction->tags()->sync($ids->all());
    }

    private const TAG_COLORS = ['#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#eab308', '#64748b'];

    private function syncAttachment(Request $request, Transaction $transaction): void
    {
        if ($request->hasFile('attachment')) {
            $transaction->attachFile($request->file('attachment'));
        } elseif ($request->boolean('remove_attachment')) {
            $transaction->deleteAttachment();
        }
    }

    private function validated(Request $request, ?Transaction $existing = null): array
    {
        $userId = $request->user()->id;
        // Rekening diarsipkan tidak bisa dipakai transaksi baru (ACC-06), kecuali transaksi lama yang sudah memakainya
        $keep = array_filter([$existing?->account_id, $existing?->to_account_id]);
        $ownAccount = Rule::exists('accounts', 'id')->where('user_id', $userId)
            ->where(fn ($q) => $q->where('is_archived', false)->orWhereIn('id', $keep ?: [0]));
        $splitting = ! $existing && $request->filled('splits');

        // Titipan dicatat tanpa rekening: hanya muncul di halaman Titipan, tidak mengubah saldo rekening
        $titipan = $request->filled('category_id') && $request->user()->categories()
            ->whereKey($request->input('category_id'))->where('type', Category::TITIPAN)->exists();

        $data = $request->validate([
            'type' => ['required', $titipan ? 'in:income,expense' : 'in:income,expense,transfer'],
            'account_id' => [$titipan ? 'nullable' : 'required', $ownAccount],
            'to_account_id' => ['nullable', 'required_if:type,transfer', 'different:account_id', $ownAccount],
            // Kategori boleh kosong bila nanti diisi aturan otomatis; dicek lagi setelah aturan diterapkan
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $userId)],
            'amount' => [$splitting ? 'nullable' : 'required', 'integer', 'min:1'],
            'date' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
            'tags' => ['nullable', 'array', 'max:10'],
            'tags.*' => ['string', 'max:50'],
            // Bukti opsional: foto kamera / gambar / PDF, maks 10 MB
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf', 'max:10240'],
            'remove_attachment' => ['nullable', 'boolean'],
        ]);
        unset($data['attachment'], $data['remove_attachment'], $data['tags']);

        if ($titipan) {
            $data['account_id'] = null;
            $data['to_account_id'] = null;
        } elseif ($data['type'] === 'transfer') {
            $data['category_id'] = null;
        } else {
            $data['to_account_id'] = null;
            if (! $splitting && empty($data['category_id'])) {
                $matched = AutoRule::match($request->user()->rules()->get(), $data['note'] ?? null)?->category_id;
                if (! $matched) {
                    throw ValidationException::withMessages(['category_id' => __('validation.required', ['attribute' => __('validation.attributes.category_id')])]);
                }
            }
        }

        return $data;
    }
}
