<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FireTest extends TestCase
{
    use RefreshDatabase;

    public function test_actual_tab_splits_monthly_growth_into_saving_and_investment_return()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $bca = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 1_000_000, 'color' => '#000']);
        $gaji = $user->categories()->create(['name' => 'Gaji', 'type' => 'income', 'color' => '#111']);
        $makan = $user->categories()->create(['name' => 'Makan', 'type' => 'expense', 'color' => '#222']);
        $user->transactions()->create([
            'type' => 'income', 'account_id' => $bca->id, 'category_id' => $gaji->id, 'amount' => 500_000, 'date' => now()->subMonths(2)->toDateString(),
        ]);

        // Bulan ini: gaji 3 jt, makan 1 jt, setor 1 jt ke reksa dana yang nilainya lalu naik jadi 1,2 jt
        $today = now()->toDateString();
        $user->transactions()->create(['type' => 'income', 'account_id' => $bca->id, 'category_id' => $gaji->id, 'amount' => 3_000_000, 'date' => $today]);
        $user->transactions()->create(['type' => 'expense', 'account_id' => $bca->id, 'category_id' => $makan->id, 'amount' => 1_000_000, 'date' => $today]);
        $rd = $user->assets()->create(['name' => 'Reksa Dana', 'kind' => 'investment', 'color' => '#333']);
        $this->post("/assets/{$rd->id}/move", ['direction' => 'deposit', 'account_id' => $bca->id, 'amount' => 1_000_000, 'date' => $today])
            ->assertSessionHasNoErrors();
        $rd->valuations()->create(['date' => $today, 'value' => 1_200_000]);

        $this->get('/calculator/fire')->assertInertia(fn (Assert $page) => $page
            ->component('calculator/fire')
            ->missing('history')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('history', 3)
                ->where('history.0.change', 500_000)
                ->where('history.2.net_worth', 3_700_000)
                ->where('history.2.saving', 2_000_000)
                ->where('history.2.investment_return', 200_000)
                ->where('history.2.change', 2_200_000)));
    }
}
