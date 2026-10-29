<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_places_bills_income_and_installments_on_due_dates()
    {
        $this->travelTo('2026-11-12 09:00:00');
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 50_000_000, 'color' => '#000']);
        $salary = $user->categories()->where('name', 'Gaji')->first();
        $user->recurringItems()->create(['name' => 'Listrik', 'type' => 'expense', 'amount' => 500_000, 'due_day' => 10]);
        $user->recurringItems()->create(['name' => 'Internet', 'type' => 'expense', 'amount' => 400_000, 'due_day' => 15]);
        $user->recurringItems()->create(['name' => 'Gaji', 'type' => 'income', 'amount' => 13_000_000, 'due_day' => 25, 'category_id' => $salary->id]);
        $user->recurringItems()->create(['name' => 'Arisan', 'type' => 'expense', 'amount' => 200_000]);
        $this->post('/setup/starter')->assertSessionHasNoErrors();

        $this->get('/calendar?month=2026-11')->assertOk()->assertInertia(fn ($page) => $page
            ->component('calendar/index')
            ->where('events', function ($events) {
                $e = collect($events)->keyBy('title');

                return $e['Listrik']['date'] === '2026-11-10' && $e['Listrik']['status'] === 'late'
                    && $e['Internet']['status'] === 'pending'
                    && $e['Gaji']['direction'] === 'in' && $e['Gaji']['date'] === '2026-11-25'
                    && $e['Cicilan Mobil']['source'] === 'debt'
                    && $e['Arisan']['has_day'] === false
                    && $e->has('Terima dari Investasi di teman');
            }));

        // Gaji dicatat lewat transaksi biasa berkategori Gaji → dianggap diterima
        $this->post('/transactions', ['type' => 'income', 'account_id' => $account->id, 'category_id' => $salary->id, 'amount' => 13_000_000, 'date' => '2026-11-12']);
        $this->get('/calendar?month=2026-11')->assertInertia(fn ($page) => $page
            ->where('events', fn ($events) => collect($events)->firstWhere('title', 'Gaji')['status'] === 'paid'));
    }

    public function test_dashboard_agenda_reminds_unpaid_fixed_bills()
    {
        $this->travelTo('2026-11-12 09:00:00');
        $user = User::factory()->create();
        $this->actingAs($user);
        $user->recurringItems()->create(['name' => 'Internet', 'type' => 'expense', 'amount' => 400_000, 'due_day' => 15]);
        $user->recurringItems()->create(['name' => 'Listrik', 'type' => 'expense', 'amount' => 500_000, 'due_day' => 10]);
        $user->recurringItems()->create(['name' => 'Asuransi', 'type' => 'expense', 'amount' => 900_000, 'due_day' => 28]);

        $this->get('/dashboard')->assertOk()->assertInertia(fn ($page) => $page
            ->where('trace.agenda', function ($agenda) {
                $a = collect($agenda)->keyBy('title');

                // Asuransi tgl 28 di luar 7 hari ke depan
                return $a->has('Internet') && $a['Listrik']['status'] === 'late' && ! $a->has('Asuransi');
            }));
    }
}
