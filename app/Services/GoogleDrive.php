<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Backup database ke Google Drive milik pengguna (OAuth, scope drive.file: aplikasi hanya bisa melihat
 * file yang ia buat sendiri). Butuh GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di .env.
 */
class GoogleDrive
{
    private const KEEP = 30;

    private const FOLDER = 'Keuangan Backup';

    public function __construct(private User $user) {}

    public static function configured(): bool
    {
        return filled(config('services.google.client_id')) && filled(config('services.google.client_secret'));
    }

    public static function authUrl(string $state): string
    {
        return 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => route('backup.google.callback'),
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ]);
    }

    /** Tukar kode OAuth → token, simpan (terenkripsi) di akun pengguna. */
    public function connect(string $code): void
    {
        $token = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => route('backup.google.callback'),
            'grant_type' => 'authorization_code',
        ])->throw()->json();

        if (empty($token['refresh_token'])) {
            throw new RuntimeException('Google tidak memberi refresh token.');
        }

        $this->user->forceFill([
            'google_drive_token' => ['refresh_token' => $token['refresh_token'], 'access_token' => $token['access_token'], 'expires_at' => time() + (int) $token['expires_in'] - 60],
            'google_drive_folder_id' => null,
        ])->save();
    }

    public function disconnect(): void
    {
        $token = $this->user->google_drive_token['refresh_token'] ?? null;
        if ($token) {
            Http::asForm()->post('https://oauth2.googleapis.com/revoke', ['token' => $token]);
        }
        $this->user->forceFill(['google_drive_token' => null, 'google_drive_folder_id' => null, 'google_drive_backup_at' => null])->save();
    }

    /** Unggah salinan database terbaru, lalu hapus backup lama (simpan 30 terakhir). */
    public function backup(): string
    {
        $source = config('database.connections.sqlite.database');
        if (config('database.default') !== 'sqlite' || ! is_file($source)) {
            throw new RuntimeException('Backup Google Drive hanya untuk database SQLite.');
        }

        // Salin dulu supaya file yang diunggah konsisten walau ada transaksi baru
        $copy = tempnam(sys_get_temp_dir(), 'kdb');
        copy($source, $copy);
        $name = 'keuangan-'.now('Asia/Jakarta')->format('Ymd-His').'.sqlite';

        try {
            $folder = $this->folder();
            $boundary = 'kb'.bin2hex(random_bytes(8));
            $body = "--{$boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                .json_encode(['name' => $name, 'parents' => [$folder]])
                ."\r\n--{$boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
                .file_get_contents($copy)
                ."\r\n--{$boundary}--";

            $file = $this->api()->withBody($body, "multipart/related; boundary={$boundary}")
                ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id')->throw()->json();
        } finally {
            @unlink($copy);
        }

        $this->prune($folder);
        $this->user->forceFill(['google_drive_backup_at' => now()])->save();

        return $file['id'];
    }

    /** @return list<array{id: string, name: string, size: int, created: string}> */
    public function files(): array
    {
        $folder = $this->folder();

        return collect($this->api()->get('https://www.googleapis.com/drive/v3/files', [
            'q' => "'{$folder}' in parents and trashed = false",
            'orderBy' => 'createdTime desc',
            'fields' => 'files(id,name,size,createdTime)',
            'pageSize' => 100,
        ])->throw()->json('files', []))->map(fn ($f) => [
            'id' => $f['id'], 'name' => $f['name'], 'size' => (int) ($f['size'] ?? 0), 'created' => $f['createdTime'],
        ])->all();
    }

    private function prune(string $folder): void
    {
        foreach (array_slice($this->files(), self::KEEP) as $old) {
            $this->api()->delete('https://www.googleapis.com/drive/v3/files/'.$old['id']);
        }
    }

    private function folder(): string
    {
        if ($id = $this->user->google_drive_folder_id) {
            return $id;
        }
        $found = $this->api()->get('https://www.googleapis.com/drive/v3/files', [
            'q' => "mimeType = 'application/vnd.google-apps.folder' and name = '".self::FOLDER."' and trashed = false",
            'fields' => 'files(id)',
        ])->throw()->json('files.0.id');
        $id = $found ?: $this->api()->post('https://www.googleapis.com/drive/v3/files?fields=id', [
            'name' => self::FOLDER,
            'mimeType' => 'application/vnd.google-apps.folder',
        ])->throw()->json('id');

        $this->user->forceFill(['google_drive_folder_id' => $id])->save();

        return $id;
    }

    private function api(): PendingRequest
    {
        $token = $this->user->google_drive_token ?? throw new RuntimeException('Google Drive belum dihubungkan.');
        if (($token['expires_at'] ?? 0) < time()) {
            $fresh = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'client_id' => config('services.google.client_id'),
                'client_secret' => config('services.google.client_secret'),
                'refresh_token' => $token['refresh_token'],
                'grant_type' => 'refresh_token',
            ])->throw()->json();
            $token = [...$token, 'access_token' => $fresh['access_token'], 'expires_at' => time() + (int) $fresh['expires_in'] - 60];
            $this->user->forceFill(['google_drive_token' => $token])->save();
        }

        return Http::withToken($token['access_token'])->timeout(60);
    }
}
