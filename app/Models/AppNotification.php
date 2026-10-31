<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Pengingat yang dikirim lewat notifikasi push; isinya diambil service worker setelah push masuk. */
class AppNotification extends Model
{
    protected $fillable = ['key', 'title', 'body', 'url', 'delivered_at', 'read_at'];

    protected function casts(): array
    {
        return ['delivered_at' => 'datetime', 'read_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
