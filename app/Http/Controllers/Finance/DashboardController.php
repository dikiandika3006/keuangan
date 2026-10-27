<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\AlertService;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $finance = new FinanceService($user);

        $series = $finance->monthlySeries(12);
        $thisMonth = end($series);
        $avg = $finance->averages();
        $position = $finance->position();

        $monthStart = now()->startOfMonth()->toDateString();

        $spentByCategory = $user->transactions()
            ->where('type', 'expense')
            ->where('date', '>=', $monthStart)
            ->selectRaw('category_id, SUM(amount) as total')
            ->groupBy('category_id')
            ->pluck('total', 'category_id');

        $categories = $user->categories()->where('type', 'expense')->get()->keyBy('id');

        $expenseByCategory = $spentByCategory->map(fn ($total, $id) => [
            'name' => $categories[$id]->name ?? 'Tanpa kategori',
            'color' => $categories[$id]->color ?? '#94a3b8',
            'total' => (int) $total,
        ])->sortByDesc('total')->values();

        $budgets = $user->budgets()->with('category')->get()->map(fn ($b) => [
            'id' => $b->id,
            'name' => $b->category->name,
            'color' => $b->category->color,
            'amount' => $b->amount,
            'spent' => (int) ($spentByCategory[$b->category_id] ?? 0),
        ])->sortByDesc(fn ($b) => $b['amount'] ? $b['spent'] / $b['amount'] : 0)->values();

        $projection = new ProjectionService($user, $finance);
        $scenario = $projection->activeScenario();
        $summary = $scenario ? $projection->project($scenario)['summary'] : null;
        $alerts = new AlertService($user);
        $agenda = $alerts->agenda();
        $employment = $user->currentEmployment();

        return Inertia::render('dashboard', [
            'trace' => [
                'scenario' => $scenario?->only(['id', 'name']),
                'summary' => $summary,
                'agenda' => $agenda,
                'alerts' => $alerts->alerts($agenda, $summary),
                'employment' => $employment,
                'debts' => $user->debts()->where('remaining_amount', '>', 0)->withCount([
                    'installments as paid_count' => fn ($q) => $q->whereNotNull('paid_at'),
                    'installments as unpaid_count' => fn ($q) => $q->whereNull('paid_at'),
                ])->withMax('installments as last_period', 'period')->orderBy('remaining_amount')->get(),
                'hasStarterData' => $user->receivables()->exists() || $user->assets()->exists(),
            ],
            'position' => $position,
            'averages' => $avg,
            'thisMonth' => $thisMonth,
            'series' => $series,
            'health' => $finance->health($position, $avg, $thisMonth),
            'accounts' => $finance->accounts(),
            'expenseByCategory' => $expenseByCategory,
            'budgets' => $budgets,
            'goals' => $user->goals()->orderBy('priority')->orderBy('target_date')->get(),
            'recentTransactions' => $user->transactions()
                ->with(['account:id,name', 'toAccount:id,name', 'category:id,name,color'])
                ->latest('date')->latest('id')->limit(6)->get(),
        ]);
    }
}
