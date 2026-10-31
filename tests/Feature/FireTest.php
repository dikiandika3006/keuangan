<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FireTest extends TestCase
{
    use RefreshDatabase;

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
