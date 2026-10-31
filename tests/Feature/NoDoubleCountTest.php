<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use App\Services\BillService;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Uang yang sama tidak boleh tercatat dua kali, dan riwayat tidak boleh hilang diam-diam.
 */
class NoDoubleCountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-22 09:00:00');
    }

    private function userWithAccount(int $balance = 10_000_000): array
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => $balance, 'color' => '#000']);

        return [$user, $account];
    }

    public function test_moving_money_to_assets_and_receiving_principal_is_not_income_or_expense()
    {
        [$user, $account] = $this->userWithAccount();
        $food = $user->categories()->create(['name' => 'Makan', 'type' => 'expense', 'color' => '#000']);
        $user->transactions()->create(['type' => 'expense', 'account_id' => $account->id, 'category_id' => $food->id, 'amount' => 500_000, 'date' => '2026-10-05']);

        $asset = $user->assets()->create(['name' => 'Pelagic', 'kind' => 'investment', 'color' => '#000']);
        $this->post("/assets/{$asset->id}/move", ['direction' => 'deposit', 'account_id' => $account->id, 'amount' => 1_000_000, 'date' => '2026-10-10']);

        $receivable = $user->receivables()->create([
            'counterparty' => 'Teman', 'principal' => 10_000_000, 'interest_pct' => 1, 'withdrawal' => 2_000_000, 'due_day' => 15, 'start_month' => '2026-10-01',
        ]);
        $receivable->syncSchedule();
        $schedule = $receivable->schedules()->where('period', '2026-10-01')->sole();
        $this->post("/receivables/{$receivable->id}/receive", ['schedule_id' => $schedule->id, 'account_id' => $account->id, 'amount' => 2_100_000, 'date' => '2026-10-15']);

        // Saldo rekening tetap ikut berubah
        $this->assertSame(10_000_000 - 500_000 - 1_000_000 + 2_100_000, (new FinanceService($user))->accounts()->first()->balance);

        // Tapi yang dihitung pemasukan hanya bunga 100rb, pengeluaran hanya makan 500rb
        $this->get('/recap?month=2026-10')->assertInertia(fn ($p) => $p
            ->where('groups.income.0.total', 100_000)
            ->has('groups.income', 1)
            ->where('groups.expense.0.total', 500_000)
            ->has('groups.expense', 1)
            ->where('moves.asset_deposit', 1_000_000)
            ->where('moves.receivable_principal', 2_000_000));

        $this->get('/transactions?month=2026-10')->assertInertia(fn ($p) => $p
            ->where('totals.income', 100_000)
            ->where('totals.expense', 500_000));
    }

    public function test_account_with_transactions_cannot_be_deleted_but_empty_one_can()
    {
        [$user, $account] = $this->userWithAccount();
        $other = $user->accounts()->create(['name' => 'Cash', 'type' => 'cash', 'initial_balance' => 0, 'color' => '#000']);
        $user->transactions()->create(['type' => 'transfer', 'account_id' => $account->id, 'to_account_id' => $other->id, 'amount' => 100_000, 'date' => '2026-10-05']);

        $this->delete("/accounts/{$other->id}")->assertSessionHas('error');
        $this->assertModelExists($other);
        $this->assertSame(1, $user->transactions()->count());

        $empty = $user->accounts()->create(['name' => 'Kosong', 'type' => 'cash', 'initial_balance' => 0, 'color' => '#000']);
        $this->delete("/accounts/{$empty->id}")->assertSessionHas('success');
        $this->assertModelMissing($empty);
    }

    public function test_registration_is_closed_once_an_account_exists()
    {
        $this->get('/register')->assertOk();
        $this->get('/login')->assertInertia(fn ($p) => $p->where('canRegister', true));

        User::factory()->create();
        $this->get('/register')->assertNotFound();
        $this->post('/register', ['name' => 'X', 'email' => 'x@example.com', 'password' => 'password', 'password_confirmation' => 'password'])->assertNotFound();
        $this->get('/login')->assertInertia(fn ($p) => $p->where('canRegister', false));
    }

    public function test_projection_uses_debt_and_receivable_menus_instead_of_scenario_assumptions()
    {
        [$user] = $this->userWithAccount(20_000_000);
        ProjectionService::ensureScenarios($user);

        // Cicilan mobil tercatat di menu Utang: 7 jt × 3 bulan mulai Nov 2026 (asumsi skenario 10 jt s/d Des 2027)
        $this->post('/debts', [
            'name' => 'Mobil', 'kind' => 'car', 'total_amount' => 21_000_000, 'remaining_amount' => 21_000_000, 'monthly_payment' => 7_000_000,
            'interest_rate' => 0, 'due_day' => 5, 'start_month' => '2026-11', 'tenor_months' => 3,
        ]);
        $this->post('/debts', [
            'name' => 'Paylater', 'kind' => 'paylater', 'total_amount' => 1_500_000, 'remaining_amount' => 1_500_000, 'monthly_payment' => 1_000_000, 'interest_rate' => 0,
        ]);
        // Dana di teman tercatat di menu Piutang: 50 jt, bunga 1%, tidak ditarik
        $user->receivables()->create(['counterparty' => 'Teman', 'principal' => 50_000_000, 'interest_pct' => 1, 'withdrawal' => 0, 'due_day' => 1, 'start_month' => '2026-11-01']);

        $service = new ProjectionService($user, new FinanceService($user));
        $result = $service->project($service->activeScenario());
        $rows = collect($result['rows'])->keyBy('month');

        $this->assertSame(['car' => true, 'house' => false, 'friend' => true], $result['sources']);
        $this->assertSame(7_000_000, $rows['2026-11']['car']);
        $this->assertSame(7_000_000, $rows['2027-01']['car']);
        $this->assertSame(0, $rows['2027-02']['car']);
        $this->assertSame(3_000_000, $rows['2026-11']['house']); // belum ada utang rumah → asumsi skenario
        // Paylater tanpa jadwal: 1 jt/bln mulai bulan ini (Okt) dari sisa 1,5 jt → Nov tinggal 500rb
        $this->assertSame(500_000, $rows['2026-11']['debt']);
        $this->assertSame(0, $rows['2026-12']['debt']);
        $this->assertSame(500_000, $rows['2026-11']['interest']);
        $this->assertSame(0, $rows['2026-11']['withdraw']);
        $this->assertSame(50_000_000, $rows['2027-06']['principal_start']);
    }

    public function test_goal_linked_to_pocket_follows_its_balance()
    {
        [$user, $account] = $this->userWithAccount();
        $pocket = $user->accounts()->create(['name' => 'Dana Liburan', 'type' => 'pocket', 'initial_balance' => 0, 'color' => '#000']);
        $user->transactions()->create(['type' => 'transfer', 'account_id' => $account->id, 'to_account_id' => $pocket->id, 'amount' => 3_000_000, 'date' => '2026-10-05']);

        $this->post('/goals', ['name' => 'Liburan', 'target_amount' => 10_000_000, 'current_amount' => 0, 'account_id' => $pocket->id, 'priority' => 2, 'color' => '#000']);
        $goal = $user->goals()->sole();

        $this->get('/goals')->assertInertia(fn ($p) => $p
            ->where('goals.0.current_amount', 3_000_000)
            ->where('goals.0.linked.name', 'Dana Liburan'));
        $this->post("/goals/{$goal->id}/deposit", ['amount' => 1_000_000])->assertStatus(422);

        $asset = $user->assets()->create(['name' => 'Pelagic', 'kind' => 'investment', 'color' => '#000']);
        $this->post('/goals', ['name' => 'X', 'target_amount' => 1, 'current_amount' => 0, 'account_id' => $pocket->id, 'asset_id' => $asset->id, 'priority' => 2, 'color' => '#000'])
            ->assertSessionHasErrors('asset_id');
    }

    public function test_emergency_fund_without_flag_excludes_pockets_and_held_money()
    {
        [$user, $account] = $this->userWithAccount(10_000_000);
        $pocket = $user->accounts()->create(['name' => 'Sekolah', 'type' => 'pocket', 'initial_balance' => 2_000_000, 'color' => '#000']);
        $titipan = $user->categories()->create(['name' => 'Arisan', 'type' => Category::TITIPAN, 'color' => '#000']);
        $user->transactions()->create(['type' => 'income', 'account_id' => $account->id, 'category_id' => $titipan->id, 'amount' => 1_000_000, 'date' => '2026-10-05']);

        $position = (new FinanceService($user))->position();
        $this->assertSame(10_000_000, $position['emergency_fund']);
        $this->assertSame(12_000_000, $position['total_assets']);
        $this->assertSame($position['total_assets'] - $position['total_debt'], $position['net_worth']);
    }

    public function test_debt_payment_splits_interest_expense_from_principal_repayment()
    {
        [$user, $account] = $this->userWithAccount();
        // Kartu kredit tanpa jadwal: sisa 10 jt, bunga 24%/thn → perkiraan bunga 200rb/bln
        $this->post('/debts', [
            'name' => 'Kartu Kredit', 'kind' => 'credit_card', 'total_amount' => 10_000_000, 'remaining_amount' => 10_000_000,
            'monthly_payment' => 1_000_000, 'interest_rate' => 24,
        ]);
        $card = $user->debts()->sole();
        $this->assertSame(200_000, $card->interestEstimate());

        $this->post("/debts/{$card->id}/pay", ['amount' => 1_000_000, 'account_id' => $account->id, 'date' => '2026-10-10']);
        $this->assertSame(9_200_000, $card->fresh()->remaining_amount);
        $this->assertSame(9_000_000, (new FinanceService($user))->accounts()->first()->balance);

        // Hanya bunga yang jadi pengeluaran; pokok tampil sebagai pelunasan
        $this->get('/recap?month=2026-10')->assertInertia(fn ($p) => $p
            ->where('groups.expense.0.total', 200_000)
            ->has('groups.expense', 1)
            ->where('moves.debt_principal', 800_000));

        // Bunga diisi manual menggantikan perkiraan; utang berbunga 0% dicatat utuh seperti biasa
        $this->post("/debts/{$card->id}/pay", ['amount' => 1_000_000, 'interest' => 150_000, 'account_id' => $account->id, 'date' => '2026-10-20']);
        $this->assertSame(8_350_000, $card->fresh()->remaining_amount);

        $this->post('/debts', ['name' => 'Pinjam Adik', 'kind' => 'personal', 'total_amount' => 500_000, 'remaining_amount' => 500_000, 'monthly_payment' => 0, 'interest_rate' => 0]);
        $loan = $user->debts()->where('kind', 'personal')->sole();
        $this->post("/debts/{$loan->id}/pay", ['amount' => 500_000, 'account_id' => $account->id, 'date' => '2026-10-21']);
        $this->assertSame('debt_installment', $user->transactions()->latest('id')->first()->category->system_key);
    }

    public function test_budget_uses_fixed_costs_as_minimum_and_hides_internal_categories()
    {
        [$user, $account] = $this->userWithAccount();
        $power = $user->categories()->create(['name' => 'Listrik', 'type' => 'expense', 'color' => '#000']);
        $user->recurringItems()->create(['name' => 'PLN', 'type' => 'expense', 'category_id' => $power->id, 'amount' => 500_000, 'due_day' => 5]);
        $user->budgets()->create(['category_id' => $power->id, 'amount' => 300_000]);
        Category::system($user, 'asset_deposit');

        $this->get('/budgets?month=2026-11')->assertInertia(fn ($p) => $p
            ->where('month', '2026-11')
            ->where('categories', fn ($c) => collect($c)->firstWhere('id', $power->id)['fixed'] === 500_000
                && collect($c)->firstWhere('name', 'Setoran Investasi') === null));
    }

    public function test_receivable_withdrawal_is_recorded_directly_into_chosen_account()
    {
        [$user, $account] = $this->userWithAccount(0);
        $cash = $user->accounts()->create(['name' => 'Mandiri', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $receivable = $user->receivables()->create([
            'counterparty' => 'Teman', 'principal' => 100_000_000, 'interest_pct' => 1, 'withdrawal' => 0, 'due_day' => 5, 'start_month' => '2026-09-01',
        ]);

        // Tarik pokok 20 jt di luar jadwal, tanpa memilih jadwal: masuk Mandiri, pokok langsung berkurang
        $this->post("/receivables/{$receivable->id}/receive", ['mode' => 'principal', 'account_id' => $cash->id, 'amount' => 20_000_000, 'date' => '2026-10-15'])
            ->assertSessionHasNoErrors();
        $this->assertSame(80_000_000, $receivable->remainingPrincipal());
        $this->assertSame(20_000_000, (new FinanceService($user))->accounts()->firstWhere('name', 'Mandiri')->balance);

        $october = $receivable->schedules()->where('period', '2026-10-01')->sole();
        $this->assertSame(['interest' => 0, 'principal' => 20_000_000], $october->received());
        $this->assertSame('late', $october->status()); // bunga Okt (1 jt) tetap tercatat belum diterima

        // Bunga November dihitung dari sisa pokok baru 80 jt
        $this->assertSame(800_000, $receivable->schedules()->where('period', '2026-11-01')->sole()->interest_due);

        // Mode bunga + pokok: bunga Okt dulu, sisanya pokok
        $this->post("/receivables/{$receivable->id}/receive", ['mode' => 'auto', 'account_id' => $account->id, 'amount' => 3_000_000, 'date' => '2026-10-20']);
        $this->assertSame(['interest' => 1_000_000, 'principal' => 22_000_000], $october->received());

        $this->get('/receivables')->assertInertia(fn ($p) => $p->has('receivables.0.history', 3));

        // Melebihi sisa pokok / sebelum piutang dimulai / tanggal depan ditolak
        $this->post("/receivables/{$receivable->id}/receive", ['mode' => 'principal', 'account_id' => $cash->id, 'amount' => 90_000_000, 'date' => '2026-10-21'])
            ->assertSessionHasErrors('amount');
        $this->post("/receivables/{$receivable->id}/receive", ['mode' => 'principal', 'account_id' => $cash->id, 'amount' => 1_000, 'date' => '2026-08-01'])
            ->assertSessionHasErrors('date');
        $this->post("/receivables/{$receivable->id}/receive", ['mode' => 'principal', 'account_id' => $cash->id, 'amount' => 1_000, 'date' => '2026-11-01'])
            ->assertSessionHasErrors('date');
    }

    public function test_calendar_does_not_count_one_income_for_two_items_sharing_a_category()
    {
        [$user, $account] = $this->userWithAccount();
        $business = $user->categories()->create(['name' => 'Usaha', 'type' => 'income', 'color' => '#000']);
        $user->recurringItems()->create(['name' => 'Toko', 'type' => 'income', 'category_id' => $business->id, 'amount' => 2_000_000, 'due_day' => 10]);
        $user->recurringItems()->create(['name' => 'Online', 'type' => 'income', 'category_id' => $business->id, 'amount' => 1_000_000, 'due_day' => 20]);
        $user->transactions()->create(['type' => 'income', 'account_id' => $account->id, 'category_id' => $business->id, 'amount' => 2_000_000, 'date' => '2026-10-10']);

        $done = (new BillService($user))->events('2026-10')->where('source', 'income')->sum('done');
        $this->assertSame(0, $done);
    }
}
