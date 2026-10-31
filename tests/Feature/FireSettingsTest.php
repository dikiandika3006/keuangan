<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Variabel kalkulator FIRE tersimpan di akun, jadi sama di semua perangkat. */
class FireSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_fire_settings_are_saved_to_account_and_returned_on_any_device()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->get('/calculator/fire')->assertInertia(fn ($p) => $p->where('settings', null));

        $settings = [
            'simulation' => ['initial' => 0, 'monthlySaving' => 5_000_000, 'monthlyExpense' => 7_500_000, 'rate' => 8.5, 'tax' => 20, 'withdrawalRate' => 5],
            'actual' => ['initial' => 1_500_000, 'monthlySaving' => 2_000_000, 'monthlyExpense' => 7_500_000, 'rate' => 1.5, 'tax' => 20, 'withdrawalRate' => 4, 'extra' => 'abaikan'],
        ];
        $this->putJson('/calculator/fire/settings', $settings)->assertOk()->assertJson(['saved' => true]);

        $this->get('/calculator/fire')->assertInertia(fn ($p) => $p
            ->where('settings.actual.rate', 1.5)
            ->where('settings.actual.initial', 1_500_000)
            ->where('settings.simulation.monthlySaving', 5_000_000)
            ->missing('settings.actual.extra'));

        $this->putJson('/calculator/fire/settings', ['simulation' => ['rate' => 'x'], 'actual' => []])->assertUnprocessable();
    }
}
