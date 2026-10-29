<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Inertia\Inertia;
use Inertia\Response;

class TransactionController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $filters = $request->only(['month', 'type', 'account_id', 'category_id', 'search']);
        $month = $filters['month'] ?? now()->format('Y-m');

        $query = $user->transactions()
            ->with(['account:id,name,color', 'toAccount:id,name', 'category:id,name,color,system_key'])
            ->when($month !== 'all', function ($q) use ($month) {
                $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01');
                $q->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()]);
            })
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($filters['account_id'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('account_id', $v)->orWhere('to_account_id', $v)))
            ->when($filters['category_id'] ?? null, fn ($q, $v) => $q->where('category_id', $v))
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where('note', 'like', "%{$v}%"));

        $totals = (clone $query)->reorder()->ownMoney()->selectRaw('type, SUM(amount) as total')->groupBy('type')->pluck('total', 'type');

        return Inertia::render('transactions/index', [
            'transactions' => $query->latest('date')->latest('id')->paginate(25)->withQueryString(),
            'totals' => [
                'income' => (int) ($totals['income'] ?? 0),
                'expense' => (int) ($totals['expense'] ?? 0),
            ],
            'filters' => [...$filters, 'month' => $month],
            'accounts' => $user->accounts()->orderBy('name')->get(['id', 'name']),
            'categories' => $user->categories()->orderBy('name')->get(['id', 'name', 'type', 'color']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $transaction = $request->user()->transactions()->create($this->validated($request));
        $this->syncAttachment($request, $transaction);

        return back()->with('success', __('Transaksi disimpan.'));
    }

    public function update(Request $request, Transaction $transaction): RedirectResponse
    {
        $this->ensureOwner($transaction);
        $transaction->update($this->validated($request, $transaction));
        $this->syncAttachment($request, $transaction);

        return back()->with('success', __('Transaksi diperbarui.'));
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

    private function syncAttachment(Request $request, Transaction $transaction): void
    {
        if ($request->hasFile('attachment')) {
            $transaction->attachFile($request->file('attachment'));
        } elseif ($request->boolean('remove_attachment')) {
            $transaction->deleteAttachment();
        }
    }

    public function destroy(Transaction $transaction): RedirectResponse
    {
        $this->ensureOwner($transaction);
        $transaction->delete();

        return back()->with('success', __('Transaksi dihapus.'));
    }

    private function validated(Request $request, ?Transaction $existing = null): array
    {
        $userId = $request->user()->id;
        // Rekening diarsipkan tidak bisa dipakai transaksi baru (ACC-06), kecuali transaksi lama yang sudah memakainya
        $keep = array_filter([$existing?->account_id, $existing?->to_account_id]);
        $ownAccount = Rule::exists('accounts', 'id')->where('user_id', $userId)
            ->where(fn ($q) => $q->where('is_archived', false)->orWhereIn('id', $keep ?: [0]));

        $data = $request->validate([
            'type' => ['required', 'in:income,expense,transfer'],
            'account_id' => ['required', $ownAccount],
            'to_account_id' => ['nullable', 'required_if:type,transfer', 'different:account_id', $ownAccount],
            'category_id' => ['nullable', 'required_unless:type,transfer', Rule::exists('categories', 'id')->where('user_id', $userId)],
            'amount' => ['required', 'integer', 'min:1'],
            'date' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
            // Bukti opsional: foto kamera / gambar / PDF, maks 10 MB
            'attachment' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf', 'max:10240'],
            'remove_attachment' => ['nullable', 'boolean'],
        ]);
        unset($data['attachment'], $data['remove_attachment']);

        if ($data['type'] === 'transfer') {
            $data['category_id'] = null;
        } else {
            $data['to_account_id'] = null;
        }

        return $data;
    }
}
