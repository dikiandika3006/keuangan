<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\User;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PocketTest extends TestCase
{
    use RefreshDatabase;

    public function test_pocket_with_monthly_allocation_flows_to_monthly_bills_and_projection()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bca = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 5_000_000, 'color' => '#000']);

        $this->post('/accounts', [
            'name' => 'Kesehatan', 'type' => 'pocket', 'initial_balance' => 0, 'color' => '#10b981',
            'monthly_allocation' => 500_000, 'funding_account_id' => $bca->id, 'allocation_day' => 1,
        ])->assertSessionHasNoErrors();

        $pocket = Account::where('name', 'Kesehatan')->first();
        $allocation = $pocket->allocation()->first();
        $this->assertSame(500_000, $allocation->amount);
        $this->assertSame('Isi Kesehatan', $allocation->name);
        $this->assertSame($bca->id, $allocation->account_id);

        // Muncul di Biaya Bulanan sebagai isi dompet, tidak muncul di editor biaya tetap
        $this->get('/monthly')->assertInertia(fn ($page) => $page
            ->where('bills.0.source', 'pocket')
            ->where('bills.0.amount', 500_000)
            ->has('items', 0));

        // Isi dompet = transfer, bukan pengeluaran
        $this->post("/monthly/{$allocation->id}/pay", ['amount' => 500_000, 'account_id' => $bca->id, 'date' => now()->toDateString()])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('transactions', ['type' => 'transfer', 'account_id' => $bca->id, 'to_account_id' => $pocket->id, 'recurring_item_id' => $allocation->id]);

        $position = (new FinanceService($user))->position();
        $this->assertSame(5_000_000, $position['liquid']);
        $this->assertSame(500_000, $position['pockets']);
        $this->assertSame(4_500_000, $position['spendable']);

        // Proyeksi menghitung isi dompet sebagai uang keluar tiap bulan
        ProjectionService::ensureScenarios($user);
        $rows = (new ProjectionService($user, new FinanceService($user)))->project($user->scenarios()->first())['rows'];
        $this->assertTrue(collect($rows)->every(fn ($r) => $r['pocket'] === 500_000));

        // Isi rutin dikosongkan → item rutin terhapus
        $this->put("/accounts/{$pocket->id}", ['name' => 'Kesehatan', 'type' => 'pocket', 'initial_balance' => 0, 'color' => '#10b981', 'monthly_allocation' => null])->assertSessionHasNoErrors();
        $this->assertNull($pocket->allocation()->first());
    }

    public function test_cannot_fill_pocket_from_itself()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $pocket = $user->accounts()->create(['name' => 'Jaxon', 'type' => 'pocket', 'initial_balance' => 0, 'color' => '#000']);
        $item = $user->recurringItems()->create(['name' => 'Isi Jaxon', 'type' => 'transfer', 'amount' => 100_000, 'to_account_id' => $pocket->id]);

        $this->post("/monthly/{$item->id}/pay", ['amount' => 100_000, 'account_id' => $pocket->id, 'date' => now()->toDateString()])->assertStatus(422);
    }
}
