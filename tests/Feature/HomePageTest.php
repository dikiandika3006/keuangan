<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HomePageTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

    private const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    public function test_phone_lands_on_monthly_recap_and_desktop_on_dashboard()
    {
        $user = User::factory()->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'password'], ['User-Agent' => self::PHONE])
            ->assertRedirect('/recap');
        $this->get('/', ['User-Agent' => self::PHONE])->assertRedirect('/recap');
        $this->get('/login', ['User-Agent' => self::PHONE])->assertRedirect('/recap');
        $this->get('/', ['User-Agent' => self::DESKTOP])->assertRedirect('/dashboard');
    }
}
