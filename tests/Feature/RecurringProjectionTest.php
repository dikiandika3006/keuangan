<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecurringProjectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_fixed_items_follow_their_active_months_in_projection()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        ProjectionService::ensureScenarios($user);
        $scenario = $user->scenarios()->first();
        $start = $scenario->start_month->format('Y-m');
        $second = $scenario->start_month->copy()->addMonth();

        $this->post('/plan/recurring', ['name' => 'Listrik', 'type' => 'expense', 'amount' => 500_000])->assertSessionHasNoErrors();
        // Hanya tanggal selesai, tanpa tanggal mulai
        $this->post('/plan/recurring', ['name' => 'Kursus', 'type' => 'expense', 'amount' => 300_000, 'end_date' => $scenario->start_month->copy()->endOfMonth()->toDateString()])->assertSessionHasNoErrors();
        $this->post('/plan/recurring', ['name' => 'Sewa kamar', 'type' => 'income', 'amount' => 1_000_000, 'start_date' => $second->toDateString()])->assertSessionHasNoErrors();

        $rows = collect((new ProjectionService($user, new FinanceService($user)))->project($scenario->fresh())['rows'])->keyBy('month');

        $this->assertSame(800_000, $rows[$start]['recurring_out']);
        $this->assertSame(0, $rows[$start]['recurring_in']);
        $this->assertSame(500_000, $rows[$second->format('Y-m')]['recurring_out']);
        $this->assertSame(1_000_000, $rows[$second->format('Y-m')]['recurring_in']);

        $this->get('/projection')->assertOk();
    }
}
