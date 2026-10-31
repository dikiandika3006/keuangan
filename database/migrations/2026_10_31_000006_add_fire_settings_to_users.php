<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Variabel kalkulator FIRE (tab Simulasi & Realisasi) disimpan di akun supaya sama di semua perangkat. */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('fire_settings')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('fire_settings'));
    }
};
