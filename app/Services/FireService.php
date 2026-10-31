<?php

namespace App\Services;

use App\Models\Account;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Realisasi FIRE otomatis dari Rekening FIRE: per bulan setoran (transfer masuk − keluar), saldo akhir bulan,
 * dan sisanya dihitung sebagai hasil investasi (rekonsiliasi nilai, dividen, dll.).
 */
class FireService
{
    public function __construct(private User $user) {}

    public function account(): ?Account
    {
        return $this->user->accounts()->where('is_fire', true)->first();
    }

    /**
     * @return list<array{month: string, deposit: int, balance: int}>
     */
    public function history(Account $account): array
    {
        $touching = $this->user->transactions()
            ->where(fn ($q) => $q->where('account_id', $account->id)->orWhere('to_account_id', $account->id));
        $first = (clone $touching)->min('date');
        $thisMonth = CarbonImmutable::now()->startOfMonth();
        $start = $first ? CarbonImmutable::parse($first)->startOfMonth() : $thisMonth;
        if ($start->gt($thisMonth)) {
            $start = $thisMonth;
        }

        $transfers = (clone $touching)->where('type', 'transfer')->where('date', '>=', $start->toDateString())
            ->get(['account_id', 'to_account_id', 'amount', 'date']);
        $finance = new FinanceService($this->user);
        $balanceAt = fn (CarbonImmutable $date) => (int) $finance->accounts($date->toDateString())->firstWhere('id', $account->id)->balance;

        $rows = [];
        for ($m = $start; $m->lte($thisMonth); $m = $m->addMonth()) {
            $end = $m->eq($thisMonth) ? CarbonImmutable::today() : $m->endOfMonth();
            $inMonth = $transfers->filter(fn ($t) => $t->date->format('Y-m') === $m->format('Y-m'));
            $rows[] = [
                'month' => $m->format('Y-m'),
                'deposit' => (int) $inMonth->where('to_account_id', $account->id)->sum('amount')
                    - (int) $inMonth->where('account_id', $account->id)->sum('amount'),
                'balance' => $balanceAt($end),
            ];
        }

        return $rows;
    }

    /** Saldo Rekening FIRE sebelum bulan pertama riwayat (pembanding hasil invest bulan pertama). */
    public function openingBalance(Account $account, string $firstMonth): int
    {
        $before = CarbonImmutable::parse($firstMonth.'-01')->subDay()->toDateString();

        return (int) (new FinanceService($this->user))->accounts($before)->firstWhere('id', $account->id)->balance;
    }
}
