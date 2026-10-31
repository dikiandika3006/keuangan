<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Perubahan tarikan pokok yang tidak masuk akal (bulan perubahan ≤ bulan mulai, atau tanpa nominal pengganti)
     * membuat pokok tidak pernah ditarik. Hapus perubahannya supaya "Tarik pokok per bulan" berlaku lagi;
     * jadwal yang belum menerima pembayaran dihitung ulang otomatis.
     */
    public function up(): void
    {
        DB::table('receivables')
            ->whereNotNull('withdrawal_change_month')
            ->where(fn ($q) => $q->whereNull('withdrawal_after')->orWhereColumn('withdrawal_change_month', '<=', 'start_month'))
            ->update(['withdrawal_change_month' => null, 'withdrawal_after' => null]);
    }

    public function down(): void
    {
        //
    }
};
