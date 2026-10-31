<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Web Push tanpa library: kunci VAPID (P-256) dibuat otomatis sekali dan disimpan di storage.
 * Pesan dikirim TANPA isi (tidak perlu enkripsi); service worker lalu mengambil isi notifikasi dari server.
 */
class WebPush
{
    private static function keyPath(): string
    {
        return storage_path('app/private/vapid.pem');
    }

    private static function privateKey(): \OpenSSLAsymmetricKey
    {
        $path = self::keyPath();
        if (! File::exists($path)) {
            File::ensureDirectoryExists(dirname($path));
            $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1', ...self::opensslConfig()]);
            openssl_pkey_export($key, $pem, null, self::opensslConfig());
            File::put($path, $pem);
            @chmod($path, 0600);
        }

        return openssl_pkey_get_private(File::get($path));
    }

    /**
     * PHP di Windows (Laragon) sering tidak menemukan openssl.cnf sehingga pembuatan kunci gagal;
     * pakai berkas bawaan PHP bila ada. Di server Linux biasanya tidak perlu.
     *
     * @return array{config?: string}
     */
    public static function opensslConfig(): array
    {
        if (getenv('OPENSSL_CONF') || PHP_OS_FAMILY !== 'Windows') {
            return [];
        }
        $cnf = dirname(PHP_BINARY).'/extras/ssl/openssl.cnf';

        return is_file($cnf) ? ['config' => $cnf] : [];
    }

    /** Kunci publik (65 byte, tanpa kompresi) dalam base64url untuk PushManager.subscribe(). */
    public static function publicKey(): string
    {
        $ec = openssl_pkey_get_details(self::privateKey())['ec'];

        return self::b64("\x04".str_pad($ec['x'], 32, "\0", STR_PAD_LEFT).str_pad($ec['y'], 32, "\0", STR_PAD_LEFT));
    }

    /** Kirim "ketukan" ke satu perangkat. Langganan yang sudah tidak berlaku (404/410) dihapus. */
    public static function send(PushSubscription $subscription): bool
    {
        $endpoint = $subscription->endpoint;
        $url = parse_url($endpoint);
        $audience = $url['scheme'].'://'.$url['host'];

        $header = self::b64(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $claims = self::b64(json_encode([
            'aud' => $audience,
            'exp' => time() + 12 * 3600,
            'sub' => 'mailto:'.($subscription->user?->email ?? 'admin@localhost'),
        ]));
        openssl_sign("$header.$claims", $der, self::privateKey(), OPENSSL_ALGO_SHA256);
        $jwt = "$header.$claims.".self::b64(self::derToRaw($der));

        try {
            $response = Http::timeout(10)->withHeaders([
                'TTL' => '86400',
                'Urgency' => 'normal',
                'Authorization' => 'vapid t='.$jwt.', k='.self::publicKey(),
            ])->withBody('', 'application/octet-stream')->post($endpoint);
        } catch (\Throwable $e) {
            Log::warning('Push gagal: '.$e->getMessage());

            return false;
        }

        if (in_array($response->status(), [404, 410], true)) {
            $subscription->delete();
        }

        return $response->successful();
    }

    /** Tanda tangan ECDSA dari OpenSSL (DER) → 64 byte r||s yang diminta JWT. */
    private static function derToRaw(string $der): string
    {
        $offset = 3;
        $rLen = ord($der[$offset]);
        $r = substr($der, $offset + 1, $rLen);
        $offset += 1 + $rLen + 1;
        $sLen = ord($der[$offset]);
        $s = substr($der, $offset + 1, $sLen);

        $fix = fn ($v) => str_pad(ltrim($v, "\0"), 32, "\0", STR_PAD_LEFT);

        return $fix($r).$fix($s);
    }

    public static function b64(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }
}
