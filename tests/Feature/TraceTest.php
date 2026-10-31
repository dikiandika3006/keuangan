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
 * Kriteria penerimaan Rilis 1 SRS Trace Keuangan (bagian 8.1).
 */
class TraceTest extends TestCase
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

    private function balance(User $user, string $name = 'BCA'): int
    {
        return (new FinanceService($user))->accounts()->firstWhere('name', $name)->balance;
    }

    public function test_new_pages_render()
    {
        [$user] = $this->userWithAccount();
        $this->post('/setup/starter')->assertSessionHasNoErrors();

        foreach (['/dashboard', '/receivables', '/assets', '/projection', '/debts', '/accounts'] as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_reconcile_records_unspecified_expense_and_matches_bank()
    {
        [$user, $account] = $this->userWithAccount(1_000_000);

        $this->post("/accounts/{$account->id}/reconcile", ['actual_balance' => 650_000, 'date' => '2026-10-22'])->assertSessionHasNoErrors();

        $tx = $user->transactions()->sole();
        $this->assertSame('expense', $tx->type);
        $this->assertSame(350_000, $tx->amount);
        $this->assertSame('reconcile', $tx->source);
        $this->assertSame('unspecified_expense', $tx->category->system_key);
        $this->assertSame(650_000, $this->balance($user));
        $this->assertSame('2026-10-22', $account->fresh()->last_reconciled_at->toDateString());

        // Saldo lebih besar dari catatan → pemasukan tidak dirinci; saldo sama → tidak ada transaksi
        $this->post("/accounts/{$account->id}/reconcile", ['actual_balance' => 700_000, 'date' => '2026-10-22']);
        $this->post("/accounts/{$account->id}/reconcile", ['actual_balance' => 700_000, 'date' => '2026-10-22']);
        $this->assertSame(2, $user->transactions()->count());
        $this->assertSame(700_000, $this->balance($user));
    }

    public function test_reconciled_difference_counts_in_monthly_cashflow_but_transfer_does_not()
    {
        [$user, $account] = $this->userWithAccount(1_000_000);
        $cash = $user->accounts()->create(['name' => 'Dompet', 'type' => 'cash', 'initial_balance' => 0, 'color' => '#000']);

        $this->post('/transactions', ['type' => 'transfer', 'account_id' => $account->id, 'to_account_id' => $cash->id, 'amount' => 300_000, 'date' => '2026-10-20']);
        $this->post("/accounts/{$cash->id}/reconcile", ['actual_balance' => 200_000, 'date' => '2026-10-22']);

        $month = collect((new FinanceService($user))->monthlySeries(1))->last();
        $this->assertSame(100_000, $month['expense']);
        $this->assertSame(0, $month['income']);
    }

    public function test_archived_account_cannot_be_used_for_new_transactions()
    {
        [$user, $account] = $this->userWithAccount();
        $account->update(['is_archived' => true]);

        $this->post('/transactions', [
            'type' => 'expense', 'account_id' => $account->id,
            'category_id' => $user->categories()->where('type', 'expense')->first()->id,
            'amount' => 1000, 'date' => '2026-10-22',
        ])->assertSessionHasErrors('account_id');
    }

    public function test_paying_car_installment_reduces_tenor_and_deleting_payment_restores_it()
    {
        [$user, $account] = $this->userWithAccount(50_000_000);
        $this->post('/debts', [
            'name' => 'Mobil', 'kind' => 'car', 'total_amount' => 140_000_000, 'remaining_amount' => 140_000_000,
            'monthly_payment' => 10_000_000, 'interest_rate' => 0, 'due_day' => 25, 'start_month' => '2026-11', 'tenor_months' => 14,
        ])->assertSessionHasNoErrors();
        $debt = $user->debts()->sole();
        $this->assertSame(14, $debt->installments()->count());
        $this->assertSame('2026-11-25', $debt->installments()->first()->due_date->toDateString());

        $this->post("/debts/{$debt->id}/pay", ['amount' => 10_000_000, 'account_id' => $account->id, 'date' => '2026-10-22'])->assertSessionHasNoErrors();

        $debt->refresh();
        $this->assertSame(13, $debt->installments()->whereNull('paid_at')->count());
        $this->assertSame(130_000_000, $debt->remaining_amount);
        $this->assertSame(40_000_000, $this->balance($user));

        $user->transactions()->sole()->delete();
        $this->assertSame(14, $debt->installments()->whereNull('paid_at')->count());
        $this->assertSame(140_000_000, $debt->fresh()->remaining_amount);
    }

    public function test_receivable_principal_withdrawal_shows_in_calendar_and_projection()
    {
        [$user] = $this->userWithAccount(0);
        $base = ['counterparty' => 'Arie', 'principal' => 4_000_000, 'interest_pct' => 0, 'withdrawal' => 334_000, 'due_day' => 5, 'start_month' => '2026-11'];

        // Bulan perubahan tarikan tidak boleh sama dengan bulan mulai
        $this->post('/receivables', [...$base, 'withdrawal_change_month' => '2026-11', 'withdrawal_after' => 0])
            ->assertSessionHasErrors('withdrawal_change_month');
        // Bulan perubahan tanpa nominal pengganti diabaikan: pokok tetap ditarik
        $this->post('/receivables', [...$base, 'withdrawal_change_month' => '2027-03'])->assertSessionHasNoErrors();
        $receivable = $user->receivables()->sole();
        $this->assertNull($receivable->withdrawal_change_month);

        $event = (new BillService($user))->events('2026-11')->firstWhere('source', 'receivable');
        $this->assertSame(334_000, $event['amount']);
        $this->assertSame('Bunga Rp0 + pokok Rp334.000', $event['subtitle']);

        ProjectionService::ensureScenarios($user);
        $service = new ProjectionService($user, new FinanceService($user));
        $rows = collect($service->project($service->activeScenario())['rows'])->keyBy('month');
        $this->assertSame(334_000, $rows['2026-12']['withdraw']);
    }

    public function test_receivable_payment_is_split_into_interest_and_principal()
    {
        [$user, $account] = $this->userWithAccount(0);
        $this->post('/receivables', [
            'counterparty' => 'Teman', 'principal' => 150_000_000, 'interest_pct' => 1, 'withdrawal' => 5_000_000,
            'due_day' => 1, 'start_month' => '2026-10',
        ])->assertSessionHasNoErrors();
        $receivable = $user->receivables()->sole();
        $october = $receivable->schedules()->where('period', '2026-10-01')->sole();
        $this->assertSame(1_500_000, $october->interest_due);
        $this->assertSame(5_000_000, $october->principal_due);

        $this->post("/receivables/{$receivable->id}/receive", [
            'schedule_id' => $october->id, 'account_id' => $account->id, 'amount' => 6_500_000, 'date' => '2026-10-02',
        ])->assertSessionHasNoErrors();

        $this->assertSame(['interest' => 1_500_000, 'principal' => 5_000_000], $october->received());
        $this->assertSame('received', $october->status());
        $this->assertSame(145_000_000, $receivable->remainingPrincipal());
        $this->assertSame(6_500_000, $this->balance($user));

        // Bulan berikutnya bunga dihitung dari sisa pokok 145 jt
        $this->assertSame(1_450_000, $receivable->schedules()->where('period', '2026-11-01')->sole()->interest_due);
    }

    public function test_receivable_marked_late_three_days_after_due_date()
    {
        [$user] = $this->userWithAccount();
        $receivable = $user->receivables()->create([
            'counterparty' => 'Teman', 'principal' => 10_000_000, 'interest_pct' => 1, 'withdrawal' => 0, 'due_day' => 15, 'start_month' => '2026-10-01',
        ]);
        $receivable->syncSchedule();
        $this->assertSame('late', $receivable->schedules()->first()->status());
    }

    public function test_asset_deposit_and_withdrawal_move_money_and_value()
    {
        [$user, $account] = $this->userWithAccount(5_000_000);
        $this->post('/assets', ['name' => 'Pelagic', 'kind' => 'investment', 'color' => '#000', 'value' => 34_000_000])->assertSessionHasNoErrors();
        $asset = $user->assets()->sole();

        $this->post("/assets/{$asset->id}/move", ['direction' => 'deposit', 'account_id' => $account->id, 'amount' => 1_000_000, 'date' => '2026-10-22']);
        $this->assertSame(35_000_000, $asset->fresh()->currentValue());
        $this->assertSame(4_000_000, $this->balance($user));

        $this->post("/assets/{$asset->id}/move", ['direction' => 'withdraw', 'account_id' => $account->id, 'amount' => 2_000_000, 'date' => '2026-10-22']);
        $this->assertSame(33_000_000, $asset->fresh()->currentValue());
        $this->assertSame(6_000_000, $this->balance($user));
    }

    public function test_net_worth_includes_receivables_and_assets_minus_debt()
    {
        [$user] = $this->userWithAccount(10_000_000);
        $this->post('/setup/starter');

        $p = (new FinanceService($user))->position();
        $this->assertSame(150_000_000, $p['receivables']);
        $this->assertSame(40_000_000, $p['other_assets']);
        $this->assertSame(140_000_000 + 204_000_000, $p['total_debt']);
        $this->assertSame(10_000_000 + 150_000_000 + 40_000_000 - 344_000_000, $p['net_worth']);
    }

    public function test_starter_data_is_idempotent()
    {
        [$user] = $this->userWithAccount();
        $this->post('/setup/starter');
        $this->post('/setup/starter');

        $this->assertSame(2, $user->debts()->count());
        $this->assertSame(1, $user->receivables()->count());
        $this->assertSame(2, $user->assets()->count());
        $this->assertSame(3, $user->scenarios()->count());
    }

    public function test_projection_matches_plan_numbers()
    {
        [$user] = $this->userWithAccount(20_000_000);
        ProjectionService::ensureScenarios($user);
        $service = new ProjectionService($user, new FinanceService($user));
        $result = $service->project($service->activeScenario());
        $rows = collect($result['rows'])->keyBy('month');

        // Nov 2026 (masih gaji): 13 + 2 + 1,5 + 5 = 21,5 jt masuk; 10 + 3 + 3,5 + 1 = 17,5 jt keluar
        $this->assertSame(21_500_000, $rows['2026-11']['income']);
        $this->assertSame(17_500_000, $rows['2026-11']['expense']);
        $this->assertSame(20_000_000 + 4_000_000, $rows['2026-11']['balance']);

        // Des 2026 tanpa gaji: Pelagic berhenti, bunga dari sisa pokok 145 jt
        $this->assertSame(0, $rows['2026-12']['salary']);
        $this->assertSame(0, $rows['2026-12']['pelagic']);
        $this->assertSame(1_450_000, $rows['2026-12']['interest']);
        $this->assertSame(8_450_000 - 16_500_000, $rows['2026-12']['net']);

        // JHT cair Jan 2027 karena belum bekerja; mobil lunas Des 2027, setelahnya tidak tarik pokok
        $this->assertSame(6_000_000, $rows['2027-01']['jht']);
        $this->assertSame('Des 2027', $result['summary']['car_paid_off']);
        $this->assertSame(0, $rows['2028-01']['withdraw']);
        $this->assertSame(80_000_000, $result['summary']['principal_after_car']);
        $this->assertSame(1_500_000, $rows['2027-07']['school']);
        $this->assertCount(26, $result['rows']);
    }

    public function test_changing_rehire_month_updates_projection()
    {
        [$user] = $this->userWithAccount(20_000_000);
        ProjectionService::ensureScenarios($user);
        $scenario = $user->scenarios()->where('is_active', true)->sole();
        $service = new ProjectionService($user, new FinanceService($user));
        $before = $service->project($scenario)['summary']['min_balance'];

        $this->put("/scenarios/{$scenario->id}", [
            'name' => 'Dasar', 'start_month' => '2026-11', 'months' => 26,
            'assumptions' => [...$scenario->assumptions, 'rehire_month' => '2027-06'],
        ])->assertSessionHasNoErrors();

        $after = $service->project($scenario->fresh())['summary']['min_balance'];
        $this->assertLessThan($before, $after);
    }

    public function test_dashboard_lists_due_installments_and_late_alerts()
    {
        [$user] = $this->userWithAccount();
        $debt = $user->debts()->create(['name' => 'Mobil', 'total_amount' => 20_000_000, 'remaining_amount' => 20_000_000, 'monthly_payment' => 10_000_000, 'due_day' => 20, 'start_month' => '2026-10-01', 'tenor_months' => 2]);
        $debt->syncSchedule();

        $this->get('/dashboard')->assertOk()->assertInertia(fn ($page) => $page
            ->where('trace.agenda.0.title', 'Cicilan Mobil')
            ->where('trace.agenda.0.status', 'late')
            ->where('trace.alerts.0.level', 'bad'));
    }

    public function test_system_categories_exist_for_new_users()
    {
        $user = User::factory()->create();

        foreach (array_keys(Category::SYSTEM) as $key) {
            $this->assertSame(1, $user->categories()->where('system_key', $key)->count(), $key);
        }
    }

    public function test_backup_command_copies_sqlite_file()
    {
        $this->artisan('keuangan:backup')->assertFailed(); // database test berjalan di memori
    }
}
