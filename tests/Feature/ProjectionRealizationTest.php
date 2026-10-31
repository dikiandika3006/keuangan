<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectionRealizationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function project(User $user): array
    {
        $service = new ProjectionService($user, new FinanceService($user));
        $result = $service->project($service->activeScenario());

        return [collect($result['rows'])->keyBy('month')['2026-11'], collect($result['realization'])->keyBy('key')];
    }

    public function test_realized_income_replaces_its_plan_instead_of_adding_to_it()
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $user = User::factory()->create();
        $this->actingAs($user);
        $bca = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $gaji = $user->categories()->create(['name' => 'Gaji', 'type' => 'income', 'color' => '#111']);
        ProjectionService::ensureScenarios($user);

        [$before, $lines] = $this->project($user);
        $this->assertSame(13_000_000, $lines['salary']['remaining']);

        // Gaji cair 11 jt, dicatat lewat form transaksi biasa: belum tertaut → rencana 13 jt masih ditambahkan
        $this->post('/transactions', ['type' => 'income', 'account_id' => $bca->id, 'category_id' => $gaji->id, 'amount' => 11_000_000, 'date' => '2026-11-05'])
            ->assertSessionHasNoErrors();
        [$unlinked] = $this->project($user);
        $this->assertSame($before['balance'] + 11_000_000, $unlinked['balance']);

        // Tautkan ke baris Gaji: yang dipakai 11 jt aktual, rencana 13 jt tidak dihitung lagi
        $tx = $user->transactions()->sole();
        $this->post('/projection/realize', ['key' => 'salary', 'transaction_id' => $tx->id])->assertSessionHasNoErrors();
        [$linked, $lines] = $this->project($user);
        $this->assertSame(11_000_000, $lines['salary']['realized']);
        $this->assertSame(0, $lines['salary']['remaining']);
        $this->assertSame($before['balance'] - 2_000_000, $linked['balance']);

        // Realisasi baru langsung dari Proyeksi
        $this->post('/projection/realize', ['key' => 'plastic', 'amount' => 2_500_000, 'date' => '2026-11-08', 'account_id' => $bca->id])
            ->assertSessionHasNoErrors();
        [, $lines] = $this->project($user);
        $this->assertSame(2_500_000, $lines['plastic']['realized']);
        $this->assertSame(0, $lines['plastic']['remaining']);

        // Lepas tautan: rencana gaji kembali dihitung, transaksinya tetap ada
        $this->post('/projection/unrealize', ['key' => 'salary'])->assertSessionHasNoErrors();
        [, $lines] = $this->project($user);
        $this->assertSame(13_000_000, $lines['salary']['remaining']);
        $this->assertSame(2, $user->transactions()->count());
    }
}
