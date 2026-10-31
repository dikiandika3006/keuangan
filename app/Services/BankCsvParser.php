<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * Membaca file mutasi rekening (CSV) dari internet/mobile banking. Kolom dikenali dari judulnya:
 * tanggal, keterangan, lalu salah satu dari (debet + kredit) / (jumlah + DB/CR) / jumlah bertanda.
 * Format angka 1.234.567,89 maupun 1,234,567.89 dan tanggal d/m/Y, d-m-Y, Y-m-d, d/m (tahun berjalan) didukung.
 */
class BankCsvParser
{
    private const DATE = ['tanggal', 'tgl', 'date', 'tanggal transaksi', 'posting date', 'transaction date', 'tgl. transaksi', 'tanggal mutasi'];

    private const NOTE = ['keterangan', 'deskripsi', 'description', 'uraian', 'remark', 'remarks', 'keterangan transaksi', 'detail', 'berita', 'narasi'];

    private const DEBIT = ['debet', 'debit', 'mutasi debet', 'mutasi debit', 'keluar', 'uang keluar', 'pengeluaran', 'withdrawal', 'db'];

    private const CREDIT = ['kredit', 'credit', 'mutasi kredit', 'masuk', 'uang masuk', 'pemasukan', 'deposit', 'cr'];

    private const AMOUNT = ['jumlah', 'amount', 'nominal', 'mutasi', 'nilai'];

    private const DC = ['db/cr', 'd/k', 'dk', 'jenis', 'tipe', 'type', 'dc', 'cr/db'];

    /**
     * @return array{rows: list<array{date: string, note: string, amount: int, type: string}>, skipped: int}
     */
    public function parse(string $content): array
    {
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        $lines = preg_split('/\r\n|\r|\n/', trim($content));
        $delimiter = $this->delimiter($lines);
        $table = array_map(fn ($l) => array_map('trim', str_getcsv($l, $delimiter)), $lines);

        [$headerIndex, $map] = $this->header($table);
        if ($headerIndex === null) {
            throw new \InvalidArgumentException('header');
        }

        $rows = [];
        $skipped = 0;
        foreach (array_slice($table, $headerIndex + 1) as $cells) {
            $row = $this->row($cells, $map);
            $row ? $rows[] = $row : $skipped++;
        }

        return ['rows' => $rows, 'skipped' => $skipped];
    }

    private function delimiter(array $lines): string
    {
        $sample = implode("\n", array_slice($lines, 0, 15));
        $counts = [';' => substr_count($sample, ';'), "\t" => substr_count($sample, "\t"), ',' => substr_count($sample, ',')];
        arsort($counts);

        return (string) array_key_first($counts);
    }

    /** Baris judul pertama (dalam 30 baris awal) yang punya kolom tanggal dan nominal. */
    private function header(array $table): array
    {
        foreach (array_slice($table, 0, 30, true) as $i => $cells) {
            $norm = array_map(fn ($c) => Str::of($c)->lower()->replaceMatches('/\s+/', ' ')->trim()->toString(), $cells);
            $find = fn (array $names) => collect($norm)->search(fn ($c) => in_array($c, $names, true) || collect($names)->contains(fn ($n) => mb_strlen($n) > 3 && str_starts_with($c, $n)));
            $map = [
                'date' => $find(self::DATE),
                'note' => $find(self::NOTE),
                'debit' => $find(self::DEBIT),
                'credit' => $find(self::CREDIT),
                'amount' => $find(self::AMOUNT),
                'dc' => $find(self::DC),
            ];
            if ($map['date'] !== false && ($map['amount'] !== false || ($map['debit'] !== false && $map['credit'] !== false))) {
                return [$i, $map];
            }
        }

        return [null, []];
    }

    private function row(array $cells, array $map): ?array
    {
        $cell = fn (string $key) => $map[$key] !== false ? ($cells[$map[$key]] ?? '') : '';
        $date = $this->date($cell('date'));
        if (! $date) {
            return null;
        }

        if ($map['debit'] !== false && $map['credit'] !== false) {
            $debit = $this->number($cell('debit'));
            $credit = $this->number($cell('credit'));
            [$amount, $type] = $credit > 0 ? [$credit, 'income'] : [$debit, 'expense'];
        } else {
            $raw = $cell('amount');
            $amount = $this->number($raw);
            $dc = Str::lower($cell('dc').' '.$raw);
            $type = match (true) {
                str_contains($dc, 'cr') || str_contains($dc, 'kredit') || str_contains($dc, ' k') => 'income',
                str_contains($dc, 'db') || str_contains($dc, 'debet') || str_contains($dc, 'debit') || str_contains($dc, ' d') => 'expense',
                default => str_starts_with(trim($raw), '-') ? 'expense' : 'income',
            };
        }

        $amount = (int) round(abs($amount));
        if ($amount <= 0) {
            return null;
        }

        $note = Str::of($cell('note'))->replaceMatches('/\s+/', ' ')->trim()->limit(250, '')->toString();

        return ['date' => $date, 'note' => $note, 'amount' => $amount, 'type' => $type];
    }

    private function date(string $value): ?string
    {
        $value = trim(preg_replace('/\s+.*$/', '', trim($value))); // buang jam
        if ($value === '' || ! preg_match('/\d/', $value)) {
            return null;
        }
        foreach (['Y-m-d', 'd/m/Y', 'd-m-Y', 'd.m.Y', 'd/m/y', 'd-m-y', 'Y/m/d', 'd M Y', 'd-M-Y', 'd-M-y'] as $format) {
            try {
                $d = CarbonImmutable::createFromFormat('!'.$format, $value);
            } catch (\Throwable) {
                continue;
            }
            if ($d && $d->format($format) === $value && $d->year > 2000) {
                return $d->toDateString();
            }
        }
        // BCA: "01/10" tanpa tahun → tahun berjalan (tahun lalu bila bulannya di depan)
        if (preg_match('#^(\d{1,2})/(\d{1,2})$#', $value, $m)) {
            $d = CarbonImmutable::create(now()->year, (int) $m[2], (int) $m[1]);
            if ($d && $d->gt(now()->endOfDay())) {
                $d = $d->subYear();
            }

            return $d?->toDateString();
        }

        return null;
    }

    /** "1.234.567,89" / "1,234,567.89" / "-50000" / "100,000.00 DB" → angka. */
    public function number(string $value): float
    {
        $v = preg_replace('/[^\d,.\-]/', '', $value);
        if ($v === '' || $v === '-') {
            return 0;
        }
        $lastComma = strrpos($v, ',');
        $lastDot = strrpos($v, '.');
        if ($lastComma !== false && $lastDot !== false) {
            $decimal = $lastComma > $lastDot ? ',' : '.';
        } elseif ($lastComma !== false) {
            $decimal = strlen($v) - $lastComma - 1 === 2 ? ',' : null;
        } elseif ($lastDot !== false) {
            $decimal = strlen($v) - $lastDot - 1 === 2 && substr_count($v, '.') === 1 ? '.' : null;
        } else {
            $decimal = null;
        }
        $thousand = $decimal === ',' ? '.' : ($decimal === '.' ? ',' : null);
        $v = $thousand ? str_replace($thousand, '', $v) : str_replace([',', '.'], '', $v);
        if ($decimal === ',') {
            $v = str_replace(',', '.', $v);
        }

        return (float) $v;
    }
}
