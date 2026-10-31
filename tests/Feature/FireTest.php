<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FinanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FireTest extends TestCase
{
    use RefreshDatabase;

    public function test_actual_tab_follows_fire_account_transfers_and_reconciled_value()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bank = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 20_000_000, 'color' => '#000']);
        $this->post('/accounts', ['name' => 'Reksa Dana FIRE', 'type' => 'investment', 'initial_balance' => 0, 'color' => '#111', 'is_fire' => true])
            ->assertSessionHasNoErrors();
        $fire = $user->accounts()->where('is_fire', true)->sole();

        // Setor 5 jt lewat transfer, lalu nilainya naik jadi 5,1 jt
        $today = now()->toDateString();
        $this->post('/transactions', ['type' => 'transfer', 'account_id' => $bank->id, 'to_account_id' => $fire->id, 'amount' => 5_000_000, 'date' => $today])
            ->assertSessionHasNoErrors();
        $this->post("/accounts/{$fire->id}/reconcile", ['actual_balance' => 5_100_000, 'date' => $today])->assertSessionHasNoErrors();

        $this->get('/calculator/fire')->assertInertia(fn (Assert $page) => $page
            ->where('fireAccount.name', 'Reksa Dana FIRE')
            ->where('fireAccount.opening', 0)
            ->has('entries', 1)
            ->where('entries.0.month', now()->format('Y-m'))
            ->where('entries.0.deposit', 5_000_000)
            ->where('entries.0.balance', 5_100_000));

        // Setoran FIRE mengurangi uang siap pakai, bukan pengeluaran
        $position = (new FinanceService($user))->position();
        $this->assertSame(15_000_000, $position['liquid']);
        $this->assertSame(0, $user->transactions()->where('type', 'expense')->count());

        // Hanya satu Rekening FIRE
        $this->post('/accounts', ['name' => 'Saham', 'type' => 'investment', 'initial_balance' => 0, 'color' => '#222', 'is_fire' => true]);
        $this->assertSame(['Saham'], $user->accounts()->where('is_fire', true)->pluck('name')->all());
    }

    public function test_monthly_fire_progress_is_entered_manually_one_per_month()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->post('/calculator/fire/entries', ['month' => '2026-10', 'deposit' => 5_000_000, 'balance' => 5_040_000])->assertSessionHasNoErrors();
        // Bulan yang sama diisi ulang: menimpa, bukan menambah catatan
        $this->post('/calculator/fire/entries', ['month' => '2026-10', 'deposit' => 5_000_000, 'balance' => 5_050_000])->assertSessionHasNoErrors();
        $this->post('/calculator/fire/entries', ['month' => '2026-9', 'deposit' => 1, 'balance' => 1])->assertSessionHasErrors('month');

        $this->get('/calculator/fire')->assertInertia(fn (Assert $page) => $page
            ->component('calculator/fire')
            ->has('entries', 1)
            ->where('entries.0.balance', 5_050_000));
        // Terpisah dari data keuangan
        $this->assertSame(0, $user->transactions()->count());

        $entry = $user->fireEntries()->first();
        $this->actingAs(User::factory()->create())->delete("/calculator/fire/entries/{$entry->id}")->assertForbidden();
        $this->actingAs($user)->delete("/calculator/fire/entries/{$entry->id}")->assertRedirect();
        $this->assertSame(0, $user->fireEntries()->count());
    }
}
