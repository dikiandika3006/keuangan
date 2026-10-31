<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Rekap pemasukan & pengeluaran per kategori untuk satu bulan, dibanding bulan lalu,
 * plus tren 12 bulan per kategori. Transfer antar rekening, dana titipan, dan pindahan ke/dari aset & pokok piutang tidak dihitung.
 */
class RecapController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) ? $request->query('month') : now()->format('Y-m');
        $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $trendStart = $start->subMonths(11);

        $monthExpr = DB::connection()->getDriverName() === 'sqlite' ? "strftime('%Y-%m', date)" : "DATE_FORMAT(date, '%Y-%m')";
        $rows = $user->transactions()
            ->whereIn('type', ['income', 'expense'])->reportable()
            ->whereBetween('date', [$trendStart->toDateString(), $start->endOfMonth()->toDateString()])
            ->selectRaw("$monthExpr as month, type, category_id, SUM(amount) as total, COUNT(*) as count")
            ->groupBy('month', 'type', 'category_id')
            ->get();

        $categories = $user->categories()->get(['id', 'name', 'color', 'icon'])->keyBy('id');
        $category = fn ($id) => [
            'id' => $id,
            'name' => $categories[$id]->name ?? __('Tanpa kategori'),
            'color' => $categories[$id]->color ?? '#94a3b8',
            'icon' => $categories[$id]->icon ?? null,
        ];

        $prevMonth = $start->subMonth()->format('Y-m');
        $groups = [];
        foreach (['income', 'expense'] as $type) {
            $current = $rows->where('month', $month)->where('type', $type);
            $previous = $rows->where('month', $prevMonth)->where('type', $type)->pluck('total', 'category_id');
            $ids = $current->pluck('category_id')->merge($previous->keys())->unique();

            $groups[$type] = $ids->map(fn ($id) => [
                ...$category($id),
                'total' => (int) ($current->firstWhere('category_id', $id)->total ?? 0),
                'count' => (int) ($current->firstWhere('category_id', $id)->count ?? 0),
                'previous' => (int) ($previous[$id] ?? 0),
            ])->sortByDesc('total')->values();
        }

        $months = collect(range(0, 11))->map(fn ($i) => $trendStart->addMonths($i));
        $trend = [];
        foreach (['income', 'expense'] as $type) {
            $typeRows = $rows->where('type', $type);
            $trend[$type] = $typeRows->pluck('category_id')->unique()->map(fn ($id) => [
                ...$category($id),
                'values' => $months->map(fn ($m) => (int) ($typeRows->where('category_id', $id)->firstWhere('month', $m->format('Y-m'))->total ?? 0))->values(),
            ])->sortByDesc(fn ($c) => array_sum($c['values']->all()))->values();
        }

        // Uang yang cuma pindah kantong (setor/cair aset, pokok piutang kembali): ditampilkan terpisah, tidak ikut total
        $moves = $user->transactions()
            ->join('categories', 'categories.id', '=', 'transactions.category_id')
            ->whereIn('categories.system_key', Category::INTERNAL_MOVES)
            ->whereBetween('transactions.date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
            ->selectRaw('categories.system_key as k, SUM(transactions.amount) as total')
            ->groupBy('categories.system_key')
            ->pluck('total', 'k')
            ->map(fn ($v) => (int) $v);

        return Inertia::render('recap/index', [
            'month' => $month,
            'groups' => $groups,
            'moves' => $moves,
            'transactions' => $user->transactions()
                ->whereIn('type', ['income', 'expense'])->reportable()
                ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
                ->with('account:id,name')
                ->orderByDesc('date')->orderByDesc('id')
                ->get(['id', 'type', 'category_id', 'account_id', 'amount', 'date', 'note']),
            'trend' => [
                'months' => $months->map(fn ($m) => ['key' => $m->format('Y-m'), 'label' => $m->locale(app()->getLocale())->translatedFormat('M y')])->values(),
                ...$trend,
            ],
        ]);
    }
}
