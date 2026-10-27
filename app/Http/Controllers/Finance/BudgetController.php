<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
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
        $start = now()->startOfMonth()->toDateString();

        $spent = $user->transactions()
            ->where('type', 'expense')
            ->where('date', '>=', $start)
            ->selectRaw('category_id, SUM(amount) as total')
            ->groupBy('category_id')
            ->pluck('total', 'category_id');

        $budgets = $user->budgets()->pluck('amount', 'category_id');

        $categories = $user->categories()->orderBy('type')->orderBy('name')->get()->map(fn (Category $c) => [
            ...$c->only(['id', 'name', 'type', 'color']),
            'budget' => $budgets[$c->id] ?? null,
            'spent' => (int) ($spent[$c->id] ?? 0),
        ]);

        return Inertia::render('budgets/index', [
            'categories' => $categories,
            'monthLabel' => now()->locale('id')->translatedFormat('F Y'),
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

        return back()->with('success', 'Anggaran disimpan.');
    }

    public function storeCategory(Request $request): RedirectResponse
    {
        $request->user()->categories()->create($this->validatedCategory($request));

        return back()->with('success', 'Kategori ditambahkan.');
    }

    public function updateCategory(Request $request, Category $category): RedirectResponse
    {
        $this->ensureOwner($category);
        $category->update($this->validatedCategory($request));

        return back()->with('success', 'Kategori diperbarui.');
    }

    public function destroyCategory(Category $category): RedirectResponse
    {
        $this->ensureOwner($category);
        $category->delete();

        return back()->with('success', 'Kategori dihapus.');
    }

    private function validatedCategory(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:income,expense'],
            'color' => ['required', 'string', 'max:20'],
        ]);
    }
}
