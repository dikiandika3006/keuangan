<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use App\Services\FinanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_user_gets_default_categories()
    {
        $user = User::factory()->create();

        // Kategori sistem yang namanya sama dengan kategori bawaan (Cicilan / Utang) tidak dibuat dua kali
        $this->assertSame(count(User::DEFAULT_CATEGORIES) + count(Category::SYSTEM) - 1, $user->categories()->count());
    }

    public function test_all_finance_pages_render()
    {
        $this->actingAs(User::factory()->create());

        foreach (['/dashboard', '/transactions', '/accounts', '/budgets', '/goals', '/debts', '/plan', '/calculator/fire', '/calculator/kpr'] as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_account_balance_follows_transactions_and_transfers()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->post('/accounts', ['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 1_000_000, 'color' => '#000'])->assertSessionHasNoErrors();
        $this->post('/accounts', ['name' => 'Dompet', 'type' => 'cash', 'initial_balance' => 0, 'color' => '#000'])->assertSessionHasNoErrors();
        [$bank, $cash] = $user->accounts()->orderBy('id')->get();
        $salary = $user->categories()->where('name', 'Gaji')->first();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();

        $this->post('/transactions', ['type' => 'income', 'account_id' => $bank->id, 'category_id' => $salary->id, 'amount' => 5_000_000, 'date' => now()->toDateString()])->assertSessionHasNoErrors();
        $this->post('/transactions', ['type' => 'transfer', 'account_id' => $bank->id, 'to_account_id' => $cash->id, 'amount' => 500_000, 'date' => now()->toDateString()])->assertSessionHasNoErrors();
        $this->post('/transactions', ['type' => 'expense', 'account_id' => $cash->id, 'category_id' => $food->id, 'amount' => 200_000, 'date' => now()->toDateString()])->assertSessionHasNoErrors();

        $balances = (new FinanceService($user))->accounts()->pluck('balance', 'name');

        $this->assertSame(5_500_000, $balances['BCA']);
        $this->assertSame(300_000, $balances['Dompet']);
    }

    public function test_cannot_touch_other_users_data()
    {
        $owner = User::factory()->create();
        $account = $owner->accounts()->create(['name' => 'Rahasia', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);

        $this->actingAs(User::factory()->create());

        $this->delete("/accounts/{$account->id}")->assertForbidden();
        $this->assertDatabaseHas('accounts', ['id' => $account->id]);
    }

    public function test_transaction_rejects_foreign_account()
    {
        $other = User::factory()->create();
        $foreign = $other->accounts()->create(['name' => 'X', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->post('/transactions', [
            'type' => 'expense',
            'account_id' => $foreign->id,
            'category_id' => $user->categories()->where('type', 'expense')->first()->id,
            'amount' => 1000,
            'date' => now()->toDateString(),
        ])->assertSessionHasErrors('account_id');
    }

    public function test_goal_deposit_and_debt_payment()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $goal = $user->goals()->create(['name' => 'Dana darurat', 'target_amount' => 10_000_000, 'current_amount' => 0]);
        $debt = $user->debts()->create(['name' => 'Motor', 'total_amount' => 6_000_000, 'remaining_amount' => 6_000_000, 'monthly_payment' => 500_000]);

        $this->post("/goals/{$goal->id}/deposit", ['amount' => 2_000_000]);
        $this->post("/debts/{$debt->id}/pay", ['amount' => 500_000]);

        $this->assertSame(2_000_000, $goal->fresh()->current_amount);
        $this->assertSame(5_500_000, $debt->fresh()->remaining_amount);
    }
}
