<?php

namespace App\Models\Concerns;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Catat dibuat/diubah/dihapus ke log aktivitas. Perubahan kolom hitungan otomatis (mis. sisa utang
 * yang disinkronkan dari cicilan) tidak dicatat supaya log hanya berisi tindakan pengguna.
 */
trait LogsActivity
{
    protected static function bootLogsActivity(): void
    {
        static::created(fn (Model $m) => ActivityLog::record('created', $m->activitySummary(), $m));
        static::deleted(fn (Model $m) => ActivityLog::record('deleted', $m->activitySummary(), $m));
        static::updated(function (Model $m) {
            $changed = array_diff(array_keys($m->getChanges()), [...$m->activityIgnored(), 'updated_at']);
            if ($changed) {
                ActivityLog::record('updated', $m->activitySummary(), $m);
            }
        });
    }

    public function activitySummary(): string
    {
        return (string) ($this->name ?? $this->counterparty ?? '#'.$this->getKey());
    }

    /** @return list<string> */
    public function activityIgnored(): array
    {
        return ['remaining_amount', 'last_reconciled_at', 'last_reconciled_balance', 'paid_at', 'system_key', 'end_confirmed_at'];
    }
}
