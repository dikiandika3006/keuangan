<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Kunci login biometrik (WebAuthn): sidik jari / Face ID / PIN perangkat. */
class Passkey extends Model
{
    use LogsActivity;

    protected $fillable = ['name', 'credential_id', 'public_key', 'algorithm', 'sign_count', 'last_used_at'];

    protected $hidden = ['public_key'];

    protected function casts(): array
    {
        return ['sign_count' => 'integer', 'algorithm' => 'integer', 'last_used_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** sign_count & waktu pakai berubah tiap login; itu bukan tindakan yang perlu dicatat. */
    public function activityIgnored(): array
    {
        return ['sign_count', 'last_used_at'];
    }
}
