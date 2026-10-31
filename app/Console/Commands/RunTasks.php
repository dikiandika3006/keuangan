<?php

namespace App\Console\Commands;

use App\Services\TaskRunner;
use Illuminate\Console\Command;

/** Jalankan tugas berkala yang sudah waktunya (backup, Google Drive, pengingat push). */
class RunTasks extends Command
{
    protected $signature = 'keuangan:tasks';

    protected $description = 'Jalankan backup harian & pengingat yang sudah waktunya';

    public function handle(): int
    {
        foreach (TaskRunner::runDue() as $task => $result) {
            $this->line("{$task}: {$result}");
        }

        return self::SUCCESS;
    }
}
