<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Tinjauan bulanan: ringkasan satu bulan dibanding bulan sebelumnya, kategori yang naik paling banyak,
 * anggaran yang jebol, perubahan kekayaan bersih, dan saran singkat.
 */
class ReviewService
{
    public function __construct(private User $user) {}

    public function build(string $month): array
    {
        $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $prev = $start->subMonth();
        $finance = new FinanceService($this->user);

        $now = $this->byCategory($start);
        $before = $this->byCategory($prev);
        $sum = fn ($rows, $type) => (int) $rows->where('type', $type)->sum('total');
        $income = $sum($now, 'income');
        $expense = $sum($now, 'expense');
        $savingRate = $income > 0 ? (int) round(($income - $expense) / $income * 100) : null;

        $categories = $this->user->categories()->get(['id', 'name', 'color', 'icon'])->keyBy('id');
        $label = fn ($id) => [
            'id' => $id,
            'name' => $categories[$id]->name ?? __('Tanpa kategori'),
            'color' => $categories[$id]->color ?? '#94a3b8',
            'icon' => $categories[$id]->icon ?? null,
        ];

        $expenseNow = $now->where('type', 'expense')->pluck('total', 'category_id');
        $expenseBefore = $before->where('type', 'expense')->pluck('total', 'category_id');
        $changes = $expenseNow->keys()->merge($expenseBefore->keys())->unique()->map(fn ($id) => [
            ...$label($id),
            'total' => (int) ($expenseNow[$id] ?? 0),
            'previous' => (int) ($expenseBefore[$id] ?? 0),
            'diff' => (int) ($expenseNow[$id] ?? 0) - (int) ($expenseBefore[$id] ?? 0),
        ]);

        // Anggaran jebol: terpakai melebihi batas (minimal sebesar biaya tetap kategori itu)
        $budgets = $this->user->budgets()->pluck('amount', 'category_id');
        $fixed = (new BillService($this->user))->bills($month)->where('source', '!=', 'pocket')
            ->groupBy(fn ($b) => $b['category']['id'] ?? 0)->map(fn ($b) => (int) $b->sum('amount'));
        $overBudget = $budgets->keys()->merge($fixed->keys())->unique()->filter(fn ($id) => $id)->map(function ($id) use ($budgets, $fixed, $expenseNow, $label) {
            $limit = max((int) ($budgets[$id] ?? 0), (int) ($fixed[$id] ?? 0));

            return [...$label($id), 'limit' => $limit, 'spent' => (int) ($expenseNow[$id] ?? 0)];
        })->filter(fn ($b) => $b['limit'] > 0 && $b['spent'] > $b['limit'])->sortByDesc(fn ($b) => $b['spent'] - $b['limit'])->values();

        $history = collect($finance->netWorthHistory(max(2, (int) $start->diffInMonths(CarbonImmutable::now()->startOfMonth()) + 2)))->keyBy('month');
        $netEnd = $history[$month]['net_worth'] ?? null;
        $netStart = $history[$prev->format('Y-m')]['net_worth'] ?? null;

        $late = (new BillService($this->user))->events($month)->where('status', 'late')->count();
        $uncategorized = $this->user->transactions()->whereIn('type', ['income', 'expense'])->whereNull('category_id')
            ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])->count();

        $increases = $changes->filter(fn ($c) => $c['diff'] > 0)->sortByDesc('diff')->take(3)->values();

        $tips = [];
        if ($savingRate !== null && $savingRate < 10) {
            $tips[] = $increases->isNotEmpty()
                ? __('Rasio tabungan hanya :pct%. Pengeluaran :name naik :amount dibanding bulan lalu, coba cek lagi.', [
                    'pct' => $savingRate, 'name' => $increases[0]['name'], 'amount' => self::rp($increases[0]['diff']),
                ])
                : __('Rasio tabungan hanya :pct%. Usahakan sisihkan minimal 20% pemasukan.', ['pct' => $savingRate]);
        } elseif ($savingRate !== null && $savingRate >= 20) {
            $tips[] = __('Rasio tabungan :pct%, sudah sesuai target ≥ 20%. Pertahankan!', ['pct' => $savingRate]);
        }
        foreach ($overBudget->take(2) as $b) {
            $tips[] = __(':name melebihi anggaran :amount. Naikkan batasnya bila memang perlu, atau kurangi bulan depan.', ['name' => $b['name'], 'amount' => self::rp($b['spent'] - $b['limit'])]);
        }
        if ($late > 0) {
            $tips[] = __(':n tagihan/penerimaan terlambat di bulan ini. Cek Kalender.', ['n' => $late]);
        }
        if ($uncategorized > 0) {
            $tips[] = __(':n transaksi belum berkategori. Buat aturan otomatis supaya berikutnya terisi sendiri.', ['n' => $uncategorized]);
        }
        $position = $finance->position();
        $avg = $finance->averages();
        if ($avg['expense'] > 0 && $position['emergency_fund'] < $avg['expense'] * $this->user->emergency_months) {
            $tips[] = __('Dana darurat baru :n bln pengeluaran dari target :target bln.', [
                'n' => number_format($position['emergency_fund'] / $avg['expense'], 1, ',', '.'),
                'target' => $this->user->emergency_months,
            ]);
        }

        return [
            'month' => $month,
            'label' => $start->locale(app()->getLocale())->translatedFormat('F Y'),
            'income' => $income,
            'expense' => $expense,
            'previous' => ['income' => $sum($before, 'income'), 'expense' => $sum($before, 'expense')],
            'saving_rate' => $savingRate,
            'net_worth' => ['start' => $netStart, 'end' => $netEnd],
            'top' => $changes->sortByDesc('total')->take(5)->values(),
            'increases' => $increases,
            'over_budget' => $overBudget,
            'largest' => $this->user->transactions()->where('type', 'expense')->reportable()
                ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
                ->with('category:id,name,color,icon')->orderByDesc('amount')->limit(5)
                ->get(['id', 'category_id', 'amount', 'date', 'note']),
            'late' => $late,
            'uncategorized' => $uncategorized,
            'tips' => $tips,
        ];
    }

    private function byCategory(CarbonImmutable $start)
    {
        return $this->user->transactions()->whereIn('type', ['income', 'expense'])->reportable()
            ->whereBetween('date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
            ->selectRaw('type, category_id, SUM(amount) as total')->groupBy('type', 'category_id')->get();
    }

    private static function rp(int $amount): string
    {
        return 'Rp'.number_format($amount, 0, ',', '.');
    }
}
