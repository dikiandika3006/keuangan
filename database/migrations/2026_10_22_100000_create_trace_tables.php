<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rilis 1 SRS Trace Keuangan: rekonsiliasi, jadwal cicilan, piutang, aset, skenario, status kerja.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->boolean('is_archived')->default(false);
            $table->date('last_reconciled_at')->nullable();
            $table->bigInteger('last_reconciled_balance')->nullable();
        });

        Schema::table('categories', function (Blueprint $table) {
            // Kategori sistem, misal unspecified_expense / unspecified_income untuk rekonsiliasi
            $table->string('system_key')->nullable();
        });

        Schema::table('debts', function (Blueprint $table) {
            $table->string('lender')->nullable();
            $table->string('kind')->default('other'); // car, house, credit_card, paylater, personal, other
            $table->date('start_month')->nullable(); // bulan cicilan pertama yang dijadwalkan
            $table->unsignedSmallInteger('tenor_months')->nullable(); // jumlah cicilan tersisa sejak start_month
        });

        Schema::create('debt_installments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('debt_id')->constrained()->cascadeOnDelete();
            $table->date('period'); // tanggal 1 bulan cicilan
            $table->date('due_date');
            $table->bigInteger('amount');
            $table->date('paid_at')->nullable();
            $table->timestamps();

            $table->unique(['debt_id', 'period']);
        });

        // Dana milik pengguna di pihak lain, misal investasi di teman
        Schema::create('receivables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('counterparty');
            $table->bigInteger('principal'); // pokok pada start_month
            $table->decimal('interest_pct', 6, 3)->default(0); // % per bulan dari sisa pokok
            $table->bigInteger('withdrawal')->default(0); // tarik pokok per bulan
            $table->date('withdrawal_change_month')->nullable(); // mulai bulan ini tarikan berubah
            $table->bigInteger('withdrawal_after')->nullable();
            $table->unsignedTinyInteger('due_day')->default(1);
            $table->date('start_month');
            $table->string('agreement_url')->nullable();
            $table->string('note')->nullable();
            $table->timestamps();
        });

        Schema::create('receivable_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receivable_id')->constrained()->cascadeOnDelete();
            $table->date('period');
            $table->date('due_date');
            $table->bigInteger('interest_due');
            $table->bigInteger('principal_due');
            $table->timestamps();

            $table->unique(['receivable_id', 'period']);
        });

        // Aset non-likuid: investasi, JHT, modal usaha, properti
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('kind')->default('investment'); // investment, jht, business, property, other
            $table->bigInteger('target_value')->nullable();
            $table->string('color')->default('#8b5cf6');
            $table->string('note')->nullable();
            $table->timestamps();
        });

        Schema::create('asset_valuations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->bigInteger('value');
            $table->string('note')->nullable();
            $table->timestamps();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->string('source')->default('manual'); // manual, reconcile
            $table->foreignId('debt_installment_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('receivable_schedule_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('asset_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::create('scenarios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('is_active')->default(false);
            $table->date('start_month');
            $table->unsignedSmallInteger('months')->default(26);
            $table->json('assumptions');
            $table->timestamps();
        });

        Schema::create('employment_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status'); // employed, unemployed
            $table->date('since');
            $table->string('employer')->nullable();
            $table->bigInteger('salary')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employment_statuses');
        Schema::dropIfExists('scenarios');
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('asset_id');
            $table->dropConstrainedForeignId('receivable_schedule_id');
            $table->dropConstrainedForeignId('debt_installment_id');
            $table->dropColumn('source');
        });
        Schema::dropIfExists('asset_valuations');
        Schema::dropIfExists('assets');
        Schema::dropIfExists('receivable_schedules');
        Schema::dropIfExists('receivables');
        Schema::dropIfExists('debt_installments');
        Schema::table('debts', fn (Blueprint $t) => $t->dropColumn(['lender', 'kind', 'start_month', 'tenor_months']));
        Schema::table('categories', fn (Blueprint $t) => $t->dropColumn('system_key'));
        Schema::table('accounts', fn (Blueprint $t) => $t->dropColumn(['is_archived', 'last_reconciled_at', 'last_reconciled_balance']));
    }
};
