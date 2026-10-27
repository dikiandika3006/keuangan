<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Rekap pemasukan & pengeluaran per kategori untuk satu bulan, dibanding bulan lalu,
 * plus tren 12 bulan per kategori. Transfer antar rekening tidak dihitung.
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
            ->whereIn('type', ['income', 'expense'])
            ->whereBetween('date', [$trendStart->toDateString(), $start->endOfMonth()->toDateString()])
            ->selectRaw("$monthExpr as month, type, category_id, SUM(amount) as total, COUNT(*) as count")
            ->groupBy('month', 'type', 'category_id')
            ->get();

        $categories = $user->categories()->get(['id', 'name', 'color'])->keyBy('id');
        $category = fn ($id) => [
            'id' => $id,
            'name' => $categories[$id]->name ?? 'Tanpa kategori',
            'color' => $categories[$id]->color ?? '#94a3b8',
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

        return Inertia::render('recap/index', [
            'month' => $month,
            'groups' => $groups,
            'transactions' => $user->transactions()
                ->whereIn('type', ['income', 'expense'])
                ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
                ->with('account:id,name')
                ->orderByDesc('date')->orderByDesc('id')
                ->get(['id', 'type', 'category_id', 'account_id', 'amount', 'date', 'note']),
            'trend' => [
                'months' => $months->map(fn ($m) => ['key' => $m->format('Y-m'), 'label' => $m->locale('id')->translatedFormat('M y')])->values(),
                ...$trend,
            ],
        ]);
    }
}
