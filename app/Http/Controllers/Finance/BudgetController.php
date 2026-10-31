<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\BillService;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Halaman anggaran sekaligus pengelolaan kategori.
 */
class BudgetController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) ? $request->query('month') : now()->format('Y-m');
        $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay();

        $spent = $user->transactions()
            ->where('type', 'expense')
            ->reportable()
            ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
            ->selectRaw('category_id, SUM(amount) as total')
            ->groupBy('category_id')
            ->pluck('total', 'category_id');

        $budgets = $user->budgets()->pluck('amount', 'category_id');

        // Biaya tetap bulan ini (item rutin + cicilan utang) per kategori: sudah pasti keluar, jadi anggaran
        // kategori itu minimal sebesar biaya tetapnya; tidak perlu dicatat dua kali sebagai anggaran terpisah
        $fixed = (new BillService($user))->bills($month)
            ->where('source', '!=', 'pocket')
            ->groupBy(fn ($b) => $b['category']['id'] ?? 0)
            ->map(fn ($bills) => (int) $bills->sum('amount'));

        $categories = $user->categories()
            ->whereIn('type', ['income', 'expense'])
            // Kategori pindahan (setor aset, pokok utang, dll.) bukan pengeluaran, jadi tidak dianggarkan
            ->where(fn ($q) => $q->whereNull('system_key')->orWhereNotIn('system_key', Category::INTERNAL_MOVES))
            ->orderBy('type')->orderBy('name')->get()
            ->map(fn (Category $c) => [
                ...$c->only(['id', 'name', 'type', 'color']),
                'budget' => $budgets[$c->id] ?? null,
                'fixed' => (int) ($fixed[$c->id] ?? 0),
                'spent' => (int) ($spent[$c->id] ?? 0),
            ]);

        return Inertia::render('budgets/index', [
            'month' => $month,
            'categories' => $categories,
            'monthLabel' => $start->locale(app()->getLocale())->translatedFormat('F Y'),
        ]);
    }

    public function setBudget(Request $request, Category $category): RedirectResponse
    {
        $this->ensureOwner($category);
        $data = $request->validate(['amount' => ['nullable', 'integer', 'min:0']]);

        if (empty($data['amount'])) {
            $request->user()->budgets()->where('category_id', $category->id)->delete();
        } else {
            $request->user()->budgets()->updateOrCreate(
                ['category_id' => $category->id],
                ['amount' => $data['amount']],
            );
        }

        return back()->with('success', __('Anggaran disimpan.'));
    }

    public function storeCategory(Request $request): RedirectResponse
    {
        $request->user()->categories()->create($this->validatedCategory($request));

        return back()->with('success', __('Kategori ditambahkan.'));
    }

    public function updateCategory(Request $request, Category $category): RedirectResponse
    {
        $this->ensureOwner($category);
        $category->update($this->validatedCategory($request));

        return back()->with('success', __('Kategori diperbarui.'));
    }

    public function destroyCategory(Category $category): RedirectResponse
    {
        $this->ensureOwner($category);
        // Titipan yang sudah punya transaksi tidak boleh dihapus: transaksinya akan terhitung sebagai pemasukan/pengeluaran pribadi
        if ($category->type === Category::TITIPAN && $category->user->transactions()->where('category_id', $category->id)->exists()) {
            return back()->withErrors(['category' => __('Titipan ini masih punya transaksi. Hapus atau pindahkan transaksinya dulu.')]);
        }
        $category->delete();

        return back()->with('success', __('Kategori dihapus.'));
    }

    private function validatedCategory(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:income,expense,'.Category::TITIPAN],
            'color' => ['required', 'string', 'max:20'],
        ]);
    }
}
