<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Setiap teks t('...') di frontend dan __('...') di backend harus punya terjemahan Inggris
 * di lang/i18n/<bagian>/en.json, supaya fitur baru tidak tertinggal bahasa Indonesia saja.
 */
class TranslationCoverageTest extends TestCase
{
    private const ROOT = __DIR__.'/../..';

    public function test_every_translatable_string_has_an_english_translation()
    {
        $dictionary = [];
        foreach (glob(self::ROOT.'/lang/i18n/*/en.json') as $file) {
            $entries = json_decode(file_get_contents($file), true);
            $this->assertIsArray($entries, "JSON tidak valid: {$file}");
            $dictionary += $entries;
        }

        $missing = [];
        foreach ($this->keys() as $key => $file) {
            if (! array_key_exists($key, $dictionary)) {
                $missing[] = "{$key}  ({$file})";
            }
        }

        $this->assertSame([], $missing, "Belum ada terjemahan Inggris:\n".implode("\n", $missing));
    }

    /** @return array<string, string> kunci => file pertama yang memakainya */
    private function keys(): array
    {
        $keys = [];
        $sources = [
            [self::ROOT.'/resources/js', '/(?<![\w.])t\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/', ['ts', 'tsx']],
            [self::ROOT.'/app', '/(?<![\w>])__\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/', ['php']],
            [self::ROOT.'/routes', '/(?<![\w>])__\(\s*\'((?:[^\'\\\\]|\\\\.)*)\'/', ['php']],
        ];

        foreach ($sources as [$dir, $pattern, $extensions]) {
            $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS));
            foreach ($files as $file) {
                if (! in_array($file->getExtension(), $extensions, true) || str_contains($file->getPathname(), DIRECTORY_SEPARATOR.'ui'.DIRECTORY_SEPARATOR)) {
                    continue;
                }
                preg_match_all($pattern, file_get_contents($file->getPathname()), $matches);
                foreach ($matches[1] as $raw) {
                    // Kunci bawaan Laravel (auth.failed, validation.*) ada di lang/<bahasa>/*.php
                    if (preg_match('/^[a-z_]+\.[a-z_.]+$/', $raw)) {
                        continue;
                    }
                    $keys[stripcslashes($raw)] ??= basename($file->getPathname());
                }
            }
        }

        return $keys;
    }
}
