<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecapTest extends TestCase
{
    use RefreshDatabase;

    public function test_recap_groups_by_category_and_compares_previous_month()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bank = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $cash = $user->accounts()->create(['name' => 'Dompet', 'type' => 'cash', 'initial_balance' => 0, 'color' => '#000']);
        $salary = $user->categories()->where('name', 'Gaji')->first();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();
        $month = now()->startOfMonth();
        $prev = $month->copy()->subMonth();

        $tx = fn ($type, $cat, $amount, $date) => $user->transactions()->create(['type' => $type, 'account_id' => $bank->id, 'category_id' => $cat, 'amount' => $amount, 'date' => $date->toDateString()]);
        $tx('income', $salary->id, 10_000_000, $month);
        $tx('expense', $food->id, 100_000, $month);
        $tx('expense', $food->id, 50_000, $month->copy()->addDay());
        $tx('expense', $food->id, 300_000, $prev);
        // Transfer tidak ikut dihitung
        $user->transactions()->create(['type' => 'transfer', 'account_id' => $bank->id, 'to_account_id' => $cash->id, 'amount' => 999_000, 'date' => $month->toDateString()]);

        $this->get('/recap?month='.$month->format('Y-m'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('recap/index')
                ->where('groups.income.0.name', 'Gaji')
                ->where('groups.income.0.total', 10_000_000)
                ->where('groups.expense.0.name', 'Makan & Minum')
                ->where('groups.expense.0.total', 150_000)
                ->where('groups.expense.0.count', 2)
                ->where('groups.expense.0.previous', 300_000)
                ->has('transactions', 3)
                ->has('trend.months', 12));
    }
}
