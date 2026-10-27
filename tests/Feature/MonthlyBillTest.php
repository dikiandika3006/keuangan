<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MonthlyBillTest extends TestCase
{
    use RefreshDatabase;

    private function setUpUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        return $user;
    }

    public function test_bill_appears_every_active_month_and_payment_is_tracked()
    {
        $user = $this->setUpUser();
        $account = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 5_000_000, 'color' => '#000']);
        $health = $user->categories()->where('name', 'Kesehatan')->first();
        $item = $user->recurringItems()->create(['name' => 'BPJS', 'type' => 'expense', 'amount' => 150_000, 'category_id' => $health->id, 'due_day' => 10]);

        $this->get('/monthly')->assertOk()->assertInertia(fn ($page) => $page->component('monthly/index')->has('bills', 1)->where('bills.0.paid', 0));
        $nextMonth = now()->addMonthNoOverflow()->format('Y-m');
        $this->get("/monthly?month={$nextMonth}")->assertInertia(fn ($page) => $page->has('bills', 1));

        $this->post("/monthly/{$item->id}/pay", ['amount' => 150_000, 'account_id' => $account->id, 'date' => now()->toDateString()])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('transactions', ['recurring_item_id' => $item->id, 'type' => 'expense', 'amount' => 150_000, 'category_id' => $health->id]);
        $this->get('/monthly')->assertInertia(fn ($page) => $page->where('bills.0.paid', 150_000));
        // Pembayaran bulan ini tidak terhitung di bulan depan
        $this->get("/monthly?month={$nextMonth}")->assertInertia(fn ($page) => $page->where('bills.0.paid', 0));
    }

    public function test_scheduled_debt_installments_appear_as_fixed_monthly_bills()
    {
        $this->travelTo('2026-11-05 09:00:00');
        $user = $this->setUpUser();
        $account = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 50_000_000, 'color' => '#000']);
        $this->post('/setup/starter')->assertSessionHasNoErrors();
        $car = $user->debts()->where('kind', 'car')->sole();
        $carInstallment = $car->installments()->where('period', '2026-11-01')->sole();

        $this->get('/monthly?month=2026-11')->assertOk()->assertInertia(fn ($page) => $page
            ->where('bills', fn ($bills) => collect($bills)->where('source', 'debt')->pluck('name')->sort()->values()->all() === ['Cicilan Mobil', 'Cicilan Rumah'])
            // Mobil & rumah sudah jadi tagihan, jadi tidak diulang di baris skenario
            ->where('scenarioLines', fn ($lines) => collect($lines)->whereIn('key', ['car', 'house'])->isEmpty()));

        $this->post("/debts/{$car->id}/pay", [
            'amount' => 10_000_000, 'account_id' => $account->id, 'date' => '2026-11-05', 'installment_id' => $carInstallment->id,
        ])->assertSessionHasNoErrors();

        $this->assertNotNull($carInstallment->fresh()->paid_at);
        $this->get('/monthly?month=2026-11')->assertInertia(fn ($page) => $page
            ->where('bills', fn ($bills) => collect($bills)->firstWhere('name', 'Cicilan Mobil')['paid'] === 10_000_000));
        // Bulan depan cicilan mobil muncul lagi, belum dibayar
        $this->get('/monthly?month=2026-12')->assertInertia(fn ($page) => $page
            ->where('bills', fn ($bills) => collect($bills)->firstWhere('name', 'Cicilan Mobil')['paid'] === 0));
    }

    public function test_item_is_hidden_outside_its_period()
    {
        $user = $this->setUpUser();
        $user->recurringItems()->create(['name' => 'Kursus', 'type' => 'expense', 'amount' => 300_000, 'end_date' => now()->endOfMonth()->toDateString()]);

        $this->get('/monthly')->assertInertia(fn ($page) => $page->has('bills', 1));
        $this->get('/monthly?month='.now()->addMonthNoOverflow()->format('Y-m'))->assertInertia(fn ($page) => $page->has('bills', 0));
    }

    public function test_ending_item_asks_confirmation_and_can_be_renewed_or_closed()
    {
        $user = $this->setUpUser();
        $soon = $user->recurringItems()->create(['name' => 'Les', 'type' => 'expense', 'amount' => 200_000, 'end_date' => now()->addMonthNoOverflow()->endOfMonth()->toDateString()]);
        $other = $user->recurringItems()->create(['name' => 'Asuransi', 'type' => 'expense', 'amount' => 400_000, 'end_date' => now()->endOfMonth()->toDateString()]);
        $user->recurringItems()->create(['name' => 'Lama', 'type' => 'expense', 'amount' => 100_000, 'end_date' => now()->addMonthsNoOverflow(6)->endOfMonth()->toDateString()]);

        $this->get('/monthly')->assertInertia(fn ($page) => $page->has('endingSoon', 2));
        $this->get('/dashboard')->assertOk();

        $this->post("/monthly/{$soon->id}/renew", ['months' => 6])->assertSessionHasNoErrors();
        $this->assertSame(now()->addMonthsNoOverflow(7)->endOfMonth()->toDateString(), $soon->fresh()->end_date->toDateString());

        $this->post("/monthly/{$other->id}/confirm-end")->assertSessionHasNoErrors();
        $this->assertNotNull($other->fresh()->end_confirmed_at);

        $this->get('/monthly')->assertInertia(fn ($page) => $page->has('endingSoon', 0));

        // Mengubah tanggal selesai lagi → perlu konfirmasi ulang
        $other->fresh()->update(['end_date' => now()->addMonthNoOverflow()->endOfMonth()->toDateString()]);
        $this->assertNull($other->fresh()->end_confirmed_at);
    }

    public function test_cannot_pay_other_users_item()
    {
        $owner = User::factory()->create();
        $item = $owner->recurringItems()->create(['name' => 'X', 'type' => 'expense', 'amount' => 1000]);
        $user = $this->setUpUser();
        $account = $user->accounts()->create(['name' => 'A', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);

        $this->post("/monthly/{$item->id}/pay", ['amount' => 1000, 'account_id' => $account->id, 'date' => now()->toDateString()])->assertForbidden();
    }
}
