<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Menyusun pengingat harian: tagihan jatuh tempo hari ini/besok, penerimaan terlambat, belum mencatat 2 hari,
 * rekening yang lama tidak dicocokkan, dan tinjauan bulanan. Tiap pengingat punya kunci unik agar tidak terkirim dua kali.
 */
class ReminderService
{
    public function __construct(private User $user) {}

    /** @return int jumlah pengingat baru */
    public function generate(?CarbonImmutable $today = null): int
    {
        $today ??= CarbonImmutable::today();
        $tomorrow = $today->addDay();
        $created = 0;
        $add = function (string $key, string $title, string $body, ?string $url) use (&$created) {
            $n = $this->user->appNotifications()->firstOrCreate(['key' => $key], ['title' => $title, 'body' => $body, 'url' => $url]);
            $created += $n->wasRecentlyCreated ? 1 : 0;
        };

        app()->setLocale($this->user->locale ?? 'id');
        $bills = new BillService($this->user);
        $events = $bills->events($today->format('Y-m'));
        if (! $tomorrow->isSameMonth($today)) {
            $events = $events->concat($bills->events($tomorrow->format('Y-m')));
        }

        foreach ($events as $e) {
            if ($e['status'] === 'paid' || ! $e['has_day']) {
                continue;
            }
            $rp = 'Rp'.number_format($e['amount'] - $e['done'], 0, ',', '.');
            if ($e['direction'] !== 'in' && in_array($e['date'], [$today->toDateString(), $tomorrow->toDateString()], true)) {
                $when = $e['date'] === $today->toDateString() ? __('hari ini') : __('besok');
                $add("bill:{$e['key']}:{$e['date']}", __(':name jatuh tempo :when', ['name' => $e['title'], 'when' => $when]), __('Sisa :amount belum dibayar.', ['amount' => $rp]), $e['url']);
            }
            if ($e['direction'] === 'in' && $e['status'] === 'late') {
                $add("late:{$e['key']}", __(':name terlambat', ['name' => $e['title']]), __('Belum diterima :amount sejak :date.', ['amount' => $rp, 'date' => $e['date']]), $e['url']);
            }
        }

        // Belum mencatat apa pun 2 hari terakhir (hanya bila sudah biasa mencatat)
        $last = $this->user->transactions()->where('source', 'manual')->max('created_at');
        if ($last && CarbonImmutable::parse($last)->lt($today->subDays(2))) {
            $add('idle:'.$today->toDateString(), __('Sudah 2 hari belum mencatat'), __('Catat pengeluaran kemarin supaya rekap tetap akurat.'), route('transactions.index'));
        }

        // Cocokkan saldo rekening tiap minggu bila sudah > 30 hari tidak direkonsiliasi
        $stale = $this->user->accounts()->where('is_archived', false)->where('type', '!=', 'pocket')
            ->where(fn ($q) => $q->whereNull('last_reconciled_at')->orWhere('last_reconciled_at', '<', $today->subDays(30)->toDateString()))
            ->pluck('name');
        if ($stale->isNotEmpty() && $this->user->transactions()->exists()) {
            $add('reconcile:'.$today->format('o-W'), __('Cocokkan saldo rekening'), __(':names belum dicocokkan dengan saldo bank lebih dari 30 hari.', ['names' => $stale->take(3)->join(', ')]), route('accounts.index'));
        }

        // Tinjauan bulan lalu, mulai tanggal 1
        $prev = $today->subMonth();
        if ($this->user->transactions()->whereBetween('date', [$prev->startOfMonth()->toDateString(), $prev->endOfMonth()->toDateString()])->exists()) {
            $add('review:'.$prev->format('Y-m'), __('Tinjauan :month siap', ['month' => $prev->locale(app()->getLocale())->translatedFormat('F Y')]), __('Lihat ringkasan, kategori yang naik, dan saran untuk bulan ini.'), route('review.index', ['month' => $prev->format('Y-m')]));
        }

        return $created;
    }

    /** Kirim ketukan push bila ada pengingat yang belum diantar. */
    public function push(): int
    {
        if (! $this->user->appNotifications()->whereNull('delivered_at')->exists()) {
            return 0;
        }
        $sent = 0;
        foreach ($this->user->pushSubscriptions()->get() as $subscription) {
            $sent += WebPush::send($subscription) ? 1 : 0;
        }

        return $sent;
    }

    /** Pengingat yang belum diantar → ditandai terantar (dipanggil service worker setelah push masuk). */
    public function takePending(): array
    {
        $items = $this->user->appNotifications()->whereNull('delivered_at')->latest('id')->limit(5)->get();
        AppNotification::whereIn('id', $items->pluck('id'))->update(['delivered_at' => now()]);

        return $items->map->only(['id', 'title', 'body', 'url'])->values()->all();
    }
}
