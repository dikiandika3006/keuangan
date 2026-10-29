<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_locale_is_indonesian()
    {
        $this->actingAs(User::factory()->create())
            ->get('/dashboard')
            ->assertInertia(fn ($p) => $p->where('locale', 'id'));
    }

    public function test_user_can_switch_to_english_and_server_messages_follow()
    {
        $user = User::factory()->create();
        $this->actingAs($user)->put('/locale', ['locale' => 'en'])->assertCookie('locale', 'en', false);
        $this->assertSame('en', $user->fresh()->locale);

        $this->get('/dashboard')->assertInertia(fn ($p) => $p->where('locale', 'en'));
        $this->post('/categories', ['name' => 'Kopi', 'type' => 'expense', 'color' => '#000'])->assertSessionHas('success', 'Category added.');
        $this->post('/categories', [])->assertSessionHasErrors(['name' => 'The name field is required.']);

        $this->put('/locale', ['locale' => 'id']);
        $this->post('/categories', [])->assertSessionHasErrors(['name' => 'Nama wajib diisi.']);
    }

    public function test_guest_choice_is_kept_in_cookie_and_invalid_locale_rejected()
    {
        $this->put('/locale', ['locale' => 'en'])->assertCookie('locale', 'en', false);
        $this->withUnencryptedCookie('locale', 'en')->get('/login')->assertInertia(fn ($p) => $p->where('locale', 'en'));
        $this->put('/locale', ['locale' => 'fr'])->assertSessionHasErrors('locale');
    }
}
