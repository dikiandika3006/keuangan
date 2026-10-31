<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Passkey;
use App\Services\WebAuthn;
use App\Services\WebPush;
use App\Support\HomePage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Login biometrik: daftarkan perangkat (sidik jari / Face ID / PIN HP) lalu masuk tanpa kata sandi.
 */
class PasskeyController extends Controller
{
    /** Opsi pendaftaran perangkat baru (user sudah login). */
    public function options(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'challenge' => WebAuthn::challenge($request, 'register'),
            'rp' => ['id' => WebAuthn::rpId($request), 'name' => config('app.name')],
            'user' => ['id' => WebPush::b64('user-'.$user->id), 'name' => $user->email, 'displayName' => $user->name],
            'pubKeyCredParams' => array_map(fn ($alg) => ['type' => 'public-key', 'alg' => $alg], WebAuthn::ALGORITHMS),
            'authenticatorSelection' => ['residentKey' => 'preferred', 'userVerification' => 'required', 'authenticatorAttachment' => 'platform'],
            'excludeCredentials' => $user->passkeys()->pluck('credential_id')->map(fn ($id) => ['type' => 'public-key', 'id' => $id])->all(),
            'timeout' => 60000,
            'attestation' => 'none',
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:100'],
            'id' => ['required', 'string', 'max:512'],
            'clientDataJSON' => ['required', 'string'],
            'authenticatorData' => ['required', 'string'],
            'publicKey' => ['required', 'string'],
            'publicKeyAlgorithm' => ['required', 'integer'],
        ]);

        $verified = WebAuthn::verifyRegistration($request, $data);
        if (Passkey::where('credential_id', $verified['credential_id'])->exists()) {
            throw ValidationException::withMessages(['passkey' => __('Perangkat ini sudah terdaftar.')]);
        }
        $request->user()->passkeys()->create([...$verified, 'name' => $data['name'] ?: self::deviceName($request)]);

        return back()->with('success', __('Login biometrik aktif di perangkat ini.'));
    }

    public function destroy(Request $request, Passkey $passkey): RedirectResponse
    {
        abort_unless($passkey->user_id === $request->user()->id, 403);
        $passkey->delete();

        return back()->with('success', __('Perangkat dihapus dari login biometrik.'));
    }

    /** Opsi login (tamu). Tanpa daftar kredensial: perangkat menampilkan passkey yang tersimpan untuk situs ini. */
    public function loginOptions(Request $request): JsonResponse
    {
        return response()->json([
            'challenge' => WebAuthn::challenge($request, 'login'),
            'rpId' => WebAuthn::rpId($request),
            'userVerification' => 'required',
            'timeout' => 60000,
        ]);
    }

    public function login(Request $request): RedirectResponse
    {
        $key = 'passkey-login:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 10)) {
            throw ValidationException::withMessages(['passkey' => __('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.')]);
        }
        RateLimiter::hit($key, 300);

        $data = $request->validate([
            'id' => ['required', 'string', 'max:512'],
            'clientDataJSON' => ['required', 'string'],
            'authenticatorData' => ['required', 'string'],
            'signature' => ['required', 'string'],
        ]);

        $passkey = Passkey::where('credential_id', $data['id'])->first();
        if (! $passkey) {
            throw ValidationException::withMessages(['passkey' => __('Perangkat belum didaftarkan. Masuk dengan kata sandi lalu aktifkan di Pengaturan → Keamanan.')]);
        }

        $count = WebAuthn::verifyAssertion($request, $data, $passkey->public_key, $passkey->sign_count);
        $passkey->update(['sign_count' => $count, 'last_used_at' => now()]);

        Auth::login($passkey->user, true);
        $request->session()->regenerate();
        RateLimiter::clear($key);
        ActivityLog::record('login', 'passkey: '.$passkey->name, $passkey, $passkey->user_id);

        return redirect()->intended(HomePage::url($request));
    }

    private static function deviceName(Request $request): string
    {
        $ua = (string) $request->userAgent();

        return match (true) {
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Mac OS') => 'Mac',
            str_contains($ua, 'Windows') => 'Windows',
            default => __('Perangkat'),
        };
    }
}
