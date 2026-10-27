<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Rekening / dompet: bank, tunai, e-wallet, investasi
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type')->default('bank'); // bank, cash, ewallet, investment
            $table->bigInteger('initial_balance')->default(0);
            $table->string('color')->default('#3b82f6');
            $table->boolean('is_emergency_fund')->default(false);
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type'); // income, expense
            $table->string('color')->default('#64748b');
            $table->timestamps();
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('to_account_id')->nullable()->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // income, expense, transfer
            $table->bigInteger('amount');
            $table->date('date');
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'date']);
        });

        // Batas pengeluaran bulanan per kategori
        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->bigInteger('amount');
            $table->timestamps();

            $table->unique(['user_id', 'category_id']);
        });

        // Target keuangan: dana darurat, rumah, nikah, pensiun, dll
        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->bigInteger('target_amount');
            $table->bigInteger('current_amount')->default(0);
            $table->date('target_date')->nullable();
            $table->unsignedTinyInteger('priority')->default(2); // 1 tinggi, 2 sedang, 3 rendah
            $table->string('color')->default('#10b981');
            $table->timestamps();
        });

        // Utang & cicilan
        Schema::create('debts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->bigInteger('total_amount');
            $table->bigInteger('remaining_amount');
            $table->bigInteger('monthly_payment')->default(0);
            $table->decimal('interest_rate', 5, 2)->default(0); // % per tahun
            $table->unsignedTinyInteger('due_day')->nullable();
            $table->timestamps();
        });

        // Pemasukan/pengeluaran rutin yang dipakai untuk proyeksi rencana
        Schema::create('recurring_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type'); // income, expense
            $table->bigInteger('amount'); // per bulan
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_items');
        Schema::dropIfExists('debts');
        Schema::dropIfExists('goals');
        Schema::dropIfExists('budgets');
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('accounts');
    }
};
