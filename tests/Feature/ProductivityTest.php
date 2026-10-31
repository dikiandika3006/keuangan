<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\BankCsvParser;
use App\Services\FinanceService;
use App\Services\ReminderService;
use App\Services\TaskRunner;
use App\Services\WebPush;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Catat cepat, aturan otomatis, tag, pecah transaksi, impor mutasi, ekspor, tinjauan, pengingat, keamanan.
 */
class ProductivityTest extends TestCase
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

    public function test_rule_fills_category_and_links_monthly_bill()
    {
        [$user, $account] = $this->userWithAccount();
        $transport = $user->categories()->where('name', 'Transportasi')->first();
        $bills = $user->categories()->where('name', 'Tagihan & Utilitas')->first();
        $pln = $user->recurringItems()->create(['name' => 'Listrik', 'type' => 'expense', 'category_id' => $bills->id, 'amount' => 500_000, 'due_day' => 5]);

        $this->post('/settings/rules', ['keyword' => 'grab', 'category_id' => $transport->id])->assertSessionHasNoErrors();
        $this->post('/settings/rules', ['keyword' => 'pln', 'category_id' => $bills->id, 'recurring_item_id' => $pln->id])->assertSessionHasNoErrors();

        // Tanpa kategori: diisi dari aturan
        $this->post('/transactions', ['type' => 'expense', 'account_id' => $account->id, 'amount' => 25_000, 'date' => '2026-10-21', 'note' => 'GrabCar ke kantor'])
            ->assertSessionHasNoErrors();
        $this->assertSame($transport->id, $user->transactions()->latest('id')->first()->category_id);

        // Bayar PLN → tertaut ke Biaya Bulanan bulan itu
        $this->post('/transactions', ['type' => 'expense', 'account_id' => $account->id, 'amount' => 480_000, 'date' => '2026-10-05', 'note' => 'Token PLN'])
            ->assertSessionHasNoErrors();
        $this->assertSame($pln->id, $user->transactions()->latest('id')->first()->recurring_item_id);

        // Tidak ada aturan cocok & kategori kosong → ditolak
        $this->post('/transactions', ['type' => 'expense', 'account_id' => $account->id, 'amount' => 1, 'date' => '2026-10-05', 'note' => 'misteri'])
            ->assertSessionHasErrors('category_id');

        // Saran catat cepat
        $this->getJson('/transactions/suggest?note=grab+pulang')->assertJson(['category_id' => $transport->id, 'source' => 'rule', 'account_id' => $account->id]);
    }

    public function test_suggestion_learns_from_history_and_frequent_list()
    {
        [$user, $account] = $this->userWithAccount();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();
        foreach (['2026-10-01', '2026-10-08', '2026-10-15'] as $date) {
            $user->transactions()->create(['type' => 'expense', 'account_id' => $account->id, 'category_id' => $food->id, 'amount' => 20_000, 'date' => $date, 'note' => 'Kopi kenangan']);
        }

        $this->getJson('/transactions/suggest?note=kenangan')->assertJson(['category_id' => $food->id, 'source' => 'history']);
        $this->getJson('/transactions/frequent')->assertJsonCount(1)->assertJsonPath('0.note', 'Kopi kenangan')->assertJsonPath('0.count', 3);
    }

    public function test_split_transaction_and_tags()
    {
        [$user, $account] = $this->userWithAccount();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();
        $home = $user->categories()->where('name', 'Belanja Bulanan')->first();

        $this->post('/transactions', [
            'type' => 'expense', 'account_id' => $account->id, 'date' => '2026-10-20', 'note' => 'Superindo',
            'splits' => [['category_id' => $food->id, 'amount' => 300_000], ['category_id' => $home->id, 'amount' => 200_000]],
            'tags' => ['Renovasi', 'renovasi', 'Dapur'],
        ])->assertSessionHasNoErrors();

        $rows = $user->transactions()->with('tags')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(1, $rows->pluck('split_group')->unique()->count());
        $this->assertNotNull($rows[0]->split_group);
        $this->assertSame(500_000, (int) $rows->sum('amount'));
        $this->assertSame(['Dapur', 'Renovasi'], $rows[0]->tags->pluck('name')->sort()->values()->all());
        $this->assertSame(2, $user->tags()->count());

        $tag = $user->tags()->where('name', 'Renovasi')->first();
        $this->get("/transactions?month=all&tag_id={$tag->id}")->assertInertia(fn ($p) => $p->where('transactions.total', 2)->where('totals.expense', 500_000));

        // Hapus semua tag saat ubah
        $this->put("/transactions/{$rows[0]->id}", ['type' => 'expense', 'account_id' => $account->id, 'category_id' => $food->id, 'amount' => 300_000, 'date' => '2026-10-20', 'tags_present' => 1]);
        $this->assertCount(0, $rows[0]->fresh()->tags);
    }

    public function test_bank_csv_parser_handles_common_formats()
    {
        $parser = new BankCsvParser;

        // Debet/Kredit terpisah, angka gaya Indonesia, ada baris info di atas judul
        $mandiri = "Rekening;1234567890\nPeriode;01/10/2026 - 31/10/2026\nTanggal;Keterangan;Debet;Kredit;Saldo\n"
            ."05/10/2026;TRANSFER GAJI;0,00;13.000.000,00;20.000.000,00\n06/10/2026;INDOMARET;125.500,00;0,00;19.874.500,00\nSaldo Akhir;;;;19.874.500,00\n";
        $rows = $parser->parse($mandiri)['rows'];
        $this->assertSame([
            ['date' => '2026-10-05', 'note' => 'TRANSFER GAJI', 'amount' => 13_000_000, 'type' => 'income'],
            ['date' => '2026-10-06', 'note' => 'INDOMARET', 'amount' => 125_500, 'type' => 'expense'],
        ], $rows);

        // BCA: tanggal tanpa tahun, jumlah dengan akhiran DB/CR, koma ribuan
        $bca = "Tanggal Transaksi,Keterangan,Cabang,Jumlah,Saldo\n'01/10,TRSF E-BANKING DB GRAB,0000,\"50,000.00 DB\",\"1,000,000.00\"\n'02/10,BUNGA,0000,\"1,234.56 CR\",\"1,001,234.56\"\n";
        $rows = $parser->parse(str_replace("'", '', $bca))['rows'];
        $this->assertSame('2026-10-01', $rows[0]['date']);
        $this->assertSame(['amount' => 50_000, 'type' => 'expense'], ['amount' => $rows[0]['amount'], 'type' => $rows[0]['type']]);
        $this->assertSame(['amount' => 1_235, 'type' => 'income'], ['amount' => $rows[1]['amount'], 'type' => $rows[1]['type']]);

        // Jumlah bertanda, tanggal ISO
        $rows = $parser->parse("date,description,amount\n2026-10-03,Netflix,-186000\n2026-10-04,Refund,50000\n")['rows'];
        $this->assertSame(['expense', 'income'], array_column($rows, 'type'));
    }

    public function test_import_preview_flags_duplicates_and_saves_selected_rows()
    {
        [$user, $account] = $this->userWithAccount();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();
        $user->transactions()->create(['type' => 'expense', 'account_id' => $account->id, 'category_id' => $food->id, 'amount' => 125_500, 'date' => '2026-10-06', 'note' => 'belanja']);

        $csv = "Tanggal;Keterangan;Debet;Kredit\n05/10/2026;TRANSFER GAJI;0;13.000.000\n06/10/2026;INDOMARET;125.500;0\n07/10/2026;KOPI;20.000;0\n07/10/2026;KOPI;20.000;0\n";
        $file = UploadedFile::fake()->createWithContent('mutasi.csv', $csv);
        $this->post('/import/preview', ['account_id' => $account->id, 'file' => $file])->assertRedirect('/import');

        $preview = session('import.preview');
        $this->assertCount(4, $preview['rows']);
        $this->assertSame([false, true, false, false], array_column($preview['rows'], 'duplicate'));
        $this->assertNotSame($preview['rows'][2]['hash'], $preview['rows'][3]['hash']);

        $this->post('/import', ['rows' => [
            ['include' => true, 'category_id' => null],
            ['include' => false],
            ['include' => true, 'category_id' => $food->id],
            ['include' => true, 'category_id' => $food->id],
        ]])->assertRedirect();

        $this->assertSame(3, $user->transactions()->where('source', 'import')->count());
        $this->assertSame(10_000_000 - 125_500 + 13_000_000 - 40_000, (new FinanceService($user))->accounts()->first()->balance);
    }

    public function test_export_xlsx_and_review_and_net_worth()
    {
        [$user, $account] = $this->userWithAccount();
        $food = $user->categories()->where('name', 'Makan & Minum')->first();
        $user->transactions()->create(['type' => 'expense', 'account_id' => $account->id, 'category_id' => $food->id, 'amount' => 500_000, 'date' => '2026-09-10', 'note' => 'Makan']);
        $user->transactions()->create(['type' => 'income', 'account_id' => $account->id, 'category_id' => $user->categories()->where('name', 'Gaji')->first()->id, 'amount' => 3_000_000, 'date' => '2026-09-25']);

        $response = $this->get('/export?from=2026-09&to=2026-10');
        $response->assertOk()->assertDownload('keuangan-2026-09-sd-2026-10.xlsx');
        $zip = new \ZipArchive;
        $zip->open($response->baseResponse->getFile()->getPathname());
        $this->assertStringContainsString('Makan &amp; Minum', $zip->getFromName('xl/worksheets/sheet1.xml'));
        $zip->close();

        $this->get('/review?month=2026-09')->assertInertia(fn ($p) => $p
            ->component('review/index')
            ->where('review.income', 3_000_000)
            ->where('review.expense', 500_000)
            ->where('review.saving_rate', 83));

        $history = (new FinanceService($user))->netWorthHistory(3);
        $this->assertSame(['2026-08', '2026-09', '2026-10'], array_column($history, 'month'));
        $this->assertSame(10_000_000, $history[0]['net_worth']);
        $this->assertSame(12_500_000, $history[2]['net_worth']);

        $this->put('/settings/emergency', ['emergency_months' => 9])->assertSessionHasNoErrors();
        $this->get('/dashboard')->assertInertia(fn ($p) => $p->where('emergencyTarget.months', 9)->has('netWorth', 12));
    }

    public function test_reminders_and_push_delivery()
    {
        [$user, $account] = $this->userWithAccount();
        $bills = $user->categories()->where('name', 'Tagihan & Utilitas')->first();
        $user->recurringItems()->create(['name' => 'Internet', 'type' => 'expense', 'category_id' => $bills->id, 'amount' => 350_000, 'due_day' => 23]);
        $user->transactions()->create(['type' => 'expense', 'account_id' => $account->id, 'category_id' => $bills->id, 'amount' => 1, 'date' => '2026-09-15']);

        $reminders = new ReminderService($user);
        $created = $reminders->generate();
        $this->assertGreaterThanOrEqual(2, $created);
        $this->assertSame(0, $reminders->generate()); // tidak dobel
        $keys = $user->appNotifications()->pluck('key');
        $this->assertTrue($keys->contains(fn ($k) => str_starts_with($k, 'bill:recurring-')));
        $this->assertTrue($keys->contains('review:2026-09'));

        Http::fake(['push.example.com/*' => Http::sequence()->push('', 201)->push('', 410)]);
        $this->post('/settings/notifications/subscribe', ['endpoint' => 'https://push.example.com/abc'])->assertSessionHasNoErrors();
        $this->assertSame(1, $reminders->push());
        Http::assertSent(fn ($r) => str_starts_with($r->header('Authorization')[0], 'vapid t=') && $r->url() === 'https://push.example.com/abc');
        $this->assertSame(87, strlen(WebPush::publicKey()));

        $pending = $this->getJson('/notifications/pending')->assertOk()->json();
        $this->assertNotEmpty($pending);
        $this->assertSame([], $this->getJson('/notifications/pending')->json());

        $user->appNotifications()->create(['key' => 'x', 'title' => 'x', 'body' => 'x']);
        $reminders->push();
        $this->assertSame(0, $user->pushSubscriptions()->count());
    }

    public function test_cron_url_requires_token()
    {
        $this->get('/cron/wrong')->assertNotFound();
        $this->get('/cron/'.TaskRunner::cronToken())->assertOk();
    }

    public function test_activity_log_records_logins_and_changes()
    {
        $user = User::factory()->create(['password' => 'secret-pass']);
        $this->post('/login', ['email' => $user->email, 'password' => 'wrong']);
        $this->post('/login', ['email' => $user->email, 'password' => 'secret-pass']);
        $account = $user->accounts()->create(['name' => 'BCA', 'type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);
        $account->update(['name' => 'BCA Utama']);

        $actions = ActivityLog::where('user_id', $user->id)->orderBy('id')->pluck('action')->all();
        $this->assertSame(['login_failed', 'login', 'created', 'updated'], $actions);

        $this->get('/settings/security')->assertInertia(fn ($p) => $p->component('settings/security')->has('logs.data', 4));
    }

    public function test_passkey_registration_and_login()
    {
        [$user] = $this->userWithAccount();
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1', ...WebPush::opensslConfig()]);
        $spki = base64_decode(preg_replace('/-----[^-]+-----|\s/', '', openssl_pkey_get_details($key)['key']));
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        // Request tes memakai APP_URL sebagai alamat situs
        $url = parse_url(config('app.url'));
        $origin = $url['scheme'].'://'.$url['host'].(isset($url['port']) ? ':'.$url['port'] : '');
        $rpHash = hash('sha256', $url['host'], true);

        $options = $this->postJson('/settings/passkeys/options')->assertOk()->json();
        $client = json_encode(['type' => 'webauthn.create', 'challenge' => $options['challenge'], 'origin' => $origin]);
        $this->post('/settings/passkeys', [
            'id' => 'cred-1', 'clientDataJSON' => $b64($client), 'authenticatorData' => $b64($rpHash."\x45".pack('N', 0)),
            'publicKey' => $b64($spki), 'publicKeyAlgorithm' => -7, 'name' => 'HP Tes',
        ])->assertSessionHasNoErrors();
        $this->assertSame(1, $user->passkeys()->count());

        auth()->logout();
        $options = $this->postJson('/login/passkey/options')->assertOk()->json();
        $client = json_encode(['type' => 'webauthn.get', 'challenge' => $options['challenge'], 'origin' => $origin]);
        $authData = $rpHash."\x05".pack('N', 1);
        openssl_sign($authData.hash('sha256', $client, true), $signature, $key, OPENSSL_ALGO_SHA256);

        $this->post('/login/passkey', ['id' => 'cred-1', 'clientDataJSON' => $b64($client), 'authenticatorData' => $b64($authData), 'signature' => $b64($signature)])
            ->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);

        // Tanda tangan dipakai ulang (tantangan sudah habis) → ditolak
        auth()->logout();
        $this->post('/login/passkey', ['id' => 'cred-1', 'clientDataJSON' => $b64($client), 'authenticatorData' => $b64($authData), 'signature' => $b64($signature)])
            ->assertSessionHasErrors('passkey');
        $this->assertGuest();
    }

    public function test_settings_pages_render()
    {
        $this->userWithAccount();
        foreach (['/settings/security', '/settings/notifications', '/settings/backup', '/settings/rules', '/import', '/review', '/settings/appearance'] as $url) {
            $this->get($url)->assertOk();
        }
    }
}
