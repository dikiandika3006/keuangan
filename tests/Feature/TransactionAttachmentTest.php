<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TransactionAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private function payload(User $user, array $extra = []): array
    {
        $account = $user->accounts()->firstOrCreate(['name' => 'BCA'], ['type' => 'bank', 'initial_balance' => 0, 'color' => '#000']);

        return [
            'type' => 'expense',
            'account_id' => $account->id,
            'category_id' => $user->categories()->where('type', 'expense')->first()->id,
            'amount' => 50_000,
            'date' => now()->toDateString(),
            ...$extra,
        ];
    }

    public function test_attachment_is_optional_and_can_be_uploaded_viewed_replaced_and_removed()
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $this->actingAs($user);

        // Tanpa bukti tetap bisa disimpan
        $this->post('/transactions', $this->payload($user))->assertSessionHasNoErrors();
        $this->assertNull($user->transactions()->first()->attachment_path);

        $this->post('/transactions', $this->payload($user, ['attachment' => UploadedFile::fake()->image('struk.jpg')]))->assertSessionHasNoErrors();
        $tx = $user->transactions()->latest('id')->first();
        Storage::disk('local')->assertExists($tx->attachment_path);
        $this->assertSame('struk.jpg', $tx->attachment_name);
        $this->assertArrayNotHasKey('attachment_path', $tx->toArray());
        $this->get($tx->attachment_url)->assertOk();

        // Ganti dengan PDF lewat method spoofing (form multipart)
        $old = $tx->attachment_path;
        $this->post("/transactions/{$tx->id}", $this->payload($user, ['_method' => 'put', 'attachment' => UploadedFile::fake()->create('nota.pdf', 100, 'application/pdf')]))->assertSessionHasNoErrors();
        $tx->refresh();
        Storage::disk('local')->assertMissing($old);
        Storage::disk('local')->assertExists($tx->attachment_path);

        $this->post("/transactions/{$tx->id}", $this->payload($user, ['_method' => 'put', 'remove_attachment' => 1]))->assertSessionHasNoErrors();
        $tx->refresh();
        $this->assertNull($tx->attachment_path);
    }

    public function test_attachment_deleted_with_transaction_and_hidden_from_other_users()
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $this->actingAs($user);
        $this->post('/transactions', $this->payload($user, ['attachment' => UploadedFile::fake()->image('a.png')]));
        $tx = $user->transactions()->first();
        $path = $tx->attachment_path;

        $this->actingAs(User::factory()->create())->get("/transactions/{$tx->id}/attachment")->assertForbidden();

        $this->actingAs($user)->delete("/transactions/{$tx->id}");
        Storage::disk('local')->assertMissing($path);
    }

    public function test_rejects_non_image_files()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->post('/transactions', $this->payload($user, ['attachment' => UploadedFile::fake()->create('virus.exe', 10)]))->assertSessionHasErrors('attachment');
    }
}
