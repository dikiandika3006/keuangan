<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Akun demo dengan contoh data 6 bulan: demo@keuangan.test / password
     */
    public function run(): void
    {
        $user = User::factory()->create([
            'name' => 'Demo',
            'email' => 'demo@keuangan.test',
        ]);

        $bank = $user->accounts()->create(['name' => 'Rekening Utama', 'type' => 'bank', 'initial_balance' => 8_000_000, 'color' => '#3b82f6']);
        $user->accounts()->create(['name' => 'Tabungan Darurat', 'type' => 'bank', 'initial_balance' => 12_000_000, 'color' => '#10b981', 'is_emergency_fund' => true]);
        $wallet = $user->accounts()->create(['name' => 'E-Wallet', 'type' => 'ewallet', 'initial_balance' => 300_000, 'color' => '#06b6d4']);
        $invest = $user->accounts()->create(['name' => 'Reksa Dana', 'type' => 'investment', 'initial_balance' => 15_000_000, 'color' => '#8b5cf6']);

        $cat = $user->categories()->pluck('id', 'name');
        $expenseCat = $user->categories()->where('type', 'expense')->pluck('id', 'name');

        for ($i = 5; $i >= 0; $i--) {
            $month = now()->startOfMonth()->subMonths($i);
            $day = fn (int $d) => $month->copy()->day(min($d, $i === 0 ? now()->day : $month->daysInMonth))->toDateString();

            $user->transactions()->create(['type' => 'income', 'account_id' => $bank->id, 'category_id' => $cat['Gaji'], 'amount' => 9_500_000, 'date' => $day(1), 'note' => 'Gaji bulanan']);
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Tempat Tinggal'], 'amount' => 2_000_000, 'date' => $day(2), 'note' => 'Sewa']);
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Cicilan / Utang'], 'amount' => 850_000, 'date' => $day(5), 'note' => 'Cicilan motor']);
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Tagihan & Utilitas'], 'amount' => random_int(450, 650) * 1000, 'date' => $day(6)]);
            $user->transactions()->create(['type' => 'transfer', 'account_id' => $bank->id, 'to_account_id' => $wallet->id, 'amount' => 1_000_000, 'date' => $day(3)]);
            $user->transactions()->create(['type' => 'transfer', 'account_id' => $bank->id, 'to_account_id' => $invest->id, 'amount' => 1_000_000, 'date' => $day(4), 'note' => 'Investasi rutin']);

            foreach ([3, 8, 12, 16, 20, 24, 27] as $d) {
                $user->transactions()->create(['type' => 'expense', 'account_id' => $wallet->id, 'category_id' => $expenseCat['Makan & Minum'], 'amount' => random_int(80, 250) * 1000, 'date' => $day($d)]);
            }
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Transportasi'], 'amount' => random_int(300, 500) * 1000, 'date' => $day(10)]);
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Belanja'], 'amount' => random_int(300, 900) * 1000, 'date' => $day(15)]);
            $user->transactions()->create(['type' => 'expense', 'account_id' => $bank->id, 'category_id' => $expenseCat['Hiburan'], 'amount' => random_int(100, 400) * 1000, 'date' => $day(22)]);
        }

        foreach (['Makan & Minum' => 1_500_000, 'Transportasi' => 500_000, 'Belanja' => 700_000, 'Hiburan' => 300_000, 'Tagihan & Utilitas' => 600_000] as $name => $amount) {
            $user->budgets()->create(['category_id' => $expenseCat[$name], 'amount' => $amount]);
        }

        $user->goals()->create(['name' => 'Dana Darurat 6 Bulan', 'target_amount' => 36_000_000, 'current_amount' => 12_000_000, 'target_date' => now()->addMonths(12)->toDateString(), 'priority' => 1, 'color' => '#10b981']);
        $user->goals()->create(['name' => 'DP Rumah', 'target_amount' => 150_000_000, 'current_amount' => 15_000_000, 'target_date' => now()->addYears(5)->toDateString(), 'priority' => 2, 'color' => '#3b82f6']);
        $user->goals()->create(['name' => 'Liburan', 'target_amount' => 8_000_000, 'current_amount' => 1_500_000, 'target_date' => now()->addMonths(8)->toDateString(), 'priority' => 3, 'color' => '#f59e0b']);

        $user->debts()->create(['name' => 'Cicilan Motor', 'total_amount' => 20_000_000, 'remaining_amount' => 11_900_000, 'monthly_payment' => 850_000, 'interest_rate' => 0, 'due_day' => 5]);
    }
}
