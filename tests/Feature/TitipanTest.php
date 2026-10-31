<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use App\Services\FinanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TitipanTest extends TestCase
{
    use RefreshDatabase;

    public function test_titipan_is_recorded_without_account_and_only_on_titipan_page()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bca = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 1_000_000, 'color' => '#000']);

        $this->post('/categories', ['name' => 'Titipan Ibu', 'type' => Category::TITIPAN, 'color' => '#000'])->assertSessionHasNoErrors();
        $titipan = $user->categories()->where('type', Category::TITIPAN)->first();
        $makan = $user->categories()->create(['name' => 'Makan', 'type' => 'expense', 'color' => '#111']);

        $tx = fn (string $type, int $amount, int $category) => $this->post('/transactions', [
            'type' => $type, 'account_id' => $bca->id, 'category_id' => $category, 'amount' => $amount, 'date' => now()->toDateString(),
        ])->assertSessionHasNoErrors();
        $tx('income', 5_000_000, $titipan->id);
        $tx('expense', 2_000_000, $titipan->id);
        $tx('expense', 100_000, $makan->id);

        // Rekening yang terkirim diabaikan: titipan tidak memakai rekening, saldo BCA hanya berkurang belanja makan
        $this->assertSame(2, $user->transactions()->whereNull('account_id')->count());
        $finance = new FinanceService($user);
        $this->assertSame(900_000, (int) $finance->accounts()->firstWhere('id', $bca->id)->balance);

        $fund = $finance->heldFunds()->first();
        $this->assertSame([5_000_000, 2_000_000, 3_000_000], [$fund['in'], $fund['out'], $fund['balance']]);

        $position = $finance->position();
        $this->assertSame(0, $position['held']);
        $this->assertSame(900_000, $position['spendable']);
        $this->assertSame(900_000, $position['net_worth']);

        $month = collect($finance->monthlySeries(1))->last();
        $this->assertSame([0, 100_000], [$month['income'], $month['expense']]);

        $this->get('/recap')->assertOk()->assertInertia(fn ($p) => $p
            ->where('groups.income', [])
            ->where('groups.expense.0.name', 'Makan')
            ->count('groups.expense', 1));

        $this->get('/titipan')->assertOk()->assertInertia(fn ($p) => $p
            ->component('titipan/index')
            ->where('funds.0.balance', 3_000_000)
            ->count('transactions', 2));

        // Daftar Transaksi & pilihan kategorinya tanpa titipan
        $this->get('/transactions')->assertInertia(fn ($p) => $p
            ->where('transactions.total', 1)
            ->where('categories', fn ($c) => collect($c)->where('type', Category::TITIPAN)->isEmpty()));

        // Titipan lama yang masih tercatat di rekening tetap dikurangkan dari uang siap pakai
        $user->transactions()->create(['type' => 'income', 'account_id' => $bca->id, 'category_id' => $titipan->id, 'amount' => 400_000, 'date' => now()->toDateString()]);
        $position = (new FinanceService($user))->position();
        $this->assertSame(400_000, $position['held']);
        $this->assertSame(900_000, $position['spendable']);
    }

    public function test_titipan_with_transactions_cannot_be_deleted()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bca = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $titipan = $user->categories()->create(['name' => 'Dana Usaha', 'type' => Category::TITIPAN, 'color' => '#000']);

        $this->delete("/categories/{$titipan->id}")->assertSessionHasNoErrors();
        $this->assertModelMissing($titipan);

        $titipan = $user->categories()->create(['name' => 'Dana Usaha', 'type' => Category::TITIPAN, 'color' => '#000']);
        $user->transactions()->create(['type' => 'income', 'account_id' => $bca->id, 'category_id' => $titipan->id, 'amount' => 1000, 'date' => now()->toDateString()]);
        $this->delete("/categories/{$titipan->id}")->assertSessionHasErrors('category');
        $this->assertModelExists($titipan);
    }
}
