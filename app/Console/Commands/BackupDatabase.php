<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Salin database SQLite ke storage/app/backups dan simpan 30 salinan terakhir (RPT-04, NFR-09).
 */
class BackupDatabase extends Command
{
    protected $signature = 'keuangan:backup {--keep=30}';

    protected $description = 'Backup database keuangan ke storage/app/backups';

    public function handle(): int
    {
        $source = config('database.connections.sqlite.database');
        if (config('database.default') !== 'sqlite' || ! is_file($source)) {
            $this->error('Backup otomatis hanya untuk database SQLite berbasis file.');

            return self::FAILURE;
        }

        $dir = storage_path('app/backups');
        File::ensureDirectoryExists($dir);
        $target = $dir.'/keuangan-'.now()->format('Ymd-His').'.sqlite';
        File::copy($source, $target);

        $files = collect(File::files($dir))->filter(fn ($f) => str_starts_with($f->getFilename(), 'keuangan-'))
            ->sortByDesc(fn ($f) => $f->getFilename())->values();
        $files->slice((int) $this->option('keep'))->each(fn ($f) => File::delete($f->getPathname()));

        $this->info("Backup tersimpan: {$target}");

        return self::SUCCESS;
    }
}
