<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Verifikasi WebAuthn (passkey / sidik jari / Face ID) tanpa library.
 * Pendaftaran memakai kunci publik SPKI dari browser (AuthenticatorAttestationResponse.getPublicKey()),
 * jadi tidak perlu membaca CBOR; login memverifikasi tanda tangan authenticatorData || SHA-256(clientDataJSON).
 */
class WebAuthn
{
    public const ALGORITHMS = [-7, -257]; // ES256, RS256

    public static function challenge(Request $request, string $purpose): string
    {
        $challenge = WebPush::b64(random_bytes(32));
        $request->session()->put("webauthn.$purpose", $challenge);

        return $challenge;
    }

    public static function rpId(Request $request): string
    {
        return $request->getHost();
    }

    /**
     * @return array{credential_id: string, public_key: string, algorithm: int, sign_count: int}
     */
    public static function verifyRegistration(Request $request, array $data): array
    {
        $client = self::clientData($request, $data['clientDataJSON'], 'webauthn.create', 'register');
        $auth = self::authData($request, self::decode($data['authenticatorData']));

        $algorithm = (int) $data['publicKeyAlgorithm'];
        if (! in_array($algorithm, self::ALGORITHMS, true)) {
            self::fail(__('Perangkat ini memakai jenis kunci yang belum didukung.'));
        }
        $der = self::decode($data['publicKey']);
        $pem = "-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($der), 64, "\n")."-----END PUBLIC KEY-----\n";
        if (! openssl_pkey_get_public($pem)) {
            self::fail(__('Kunci publik dari perangkat tidak valid.'));
        }
        unset($client);

        return [
            'credential_id' => $data['id'],
            'public_key' => $pem,
            'algorithm' => $algorithm,
            'sign_count' => $auth['sign_count'],
        ];
    }

    /** @return int sign count baru */
    public static function verifyAssertion(Request $request, array $data, string $publicKey, int $storedCount): int
    {
        self::clientData($request, $data['clientDataJSON'], 'webauthn.get', 'login');
        $authBytes = self::decode($data['authenticatorData']);
        $auth = self::authData($request, $authBytes);

        $signed = $authBytes.hash('sha256', self::decode($data['clientDataJSON']), true);
        if (openssl_verify($signed, self::decode($data['signature']), $publicKey, OPENSSL_ALGO_SHA256) !== 1) {
            self::fail(__('Verifikasi biometrik gagal.'));
        }
        // Penghitung yang mundur menandakan kunci disalin; 0 berarti perangkat tidak memakai penghitung
        if ($auth['sign_count'] > 0 && $auth['sign_count'] <= $storedCount) {
            self::fail(__('Verifikasi biometrik gagal.'));
        }

        return $auth['sign_count'];
    }

    private static function clientData(Request $request, string $encoded, string $type, string $purpose): array
    {
        $client = json_decode(self::decode($encoded), true) ?: [];
        $expected = $request->session()->pull("webauthn.$purpose");

        if (($client['type'] ?? null) !== $type
            || ! $expected || ! hash_equals($expected, (string) ($client['challenge'] ?? ''))
            || ! in_array($client['origin'] ?? null, self::origins($request), true)) {
            self::fail(__('Permintaan biometrik kedaluwarsa. Coba lagi.'));
        }

        return $client;
    }

    /** Alamat situs yang sah: dari request, dan dari APP_URL (bila HTTPS diterminasi di proxy hosting). */
    private static function origins(Request $request): array
    {
        $app = parse_url((string) config('app.url'));
        $fromConfig = isset($app['scheme'], $app['host']) ? $app['scheme'].'://'.$app['host'].(isset($app['port']) ? ':'.$app['port'] : '') : null;

        return array_values(array_filter([$request->getSchemeAndHttpHost(), $fromConfig]));
    }

    /** @return array{sign_count: int} */
    private static function authData(Request $request, string $bytes): array
    {
        if (strlen($bytes) < 37 || ! hash_equals(hash('sha256', self::rpId($request), true), substr($bytes, 0, 32))) {
            self::fail(__('Verifikasi biometrik gagal.'));
        }
        $flags = ord($bytes[32]);
        if (! ($flags & 0x01)) { // user present
            self::fail(__('Verifikasi biometrik gagal.'));
        }

        return ['sign_count' => unpack('N', substr($bytes, 33, 4))[1]];
    }

    public static function decode(string $b64url): string
    {
        return base64_decode(strtr($b64url, '-_', '+/').str_repeat('=', (4 - strlen($b64url) % 4) % 4), true) ?: '';
    }

    private static function fail(string $message): never
    {
        throw ValidationException::withMessages(['passkey' => $message]);
    }
}
