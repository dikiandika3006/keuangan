import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { Camera, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { type InputHTMLAttributes, useEffect, useRef, useState } from 'react';

const MAX_SIDE = 1600;

/**
 * Perkecil foto (kamera HP bisa 3–8 MB) jadi JPEG maks 1600px sebelum upload.
 * File yang tidak bisa dibaca browser (PDF, HEIC di sebagian browser) dikirim apa adanya.
 */
async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        if (scale === 1 && file.size < 1_000_000) return file;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob || blob.size >= file.size) return file;

        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

function formatSize(bytes: number) {
    return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

interface AttachmentPickerProps {
    file: File | null;
    onFileChange: (file: File | null) => void;
    /** Bukti yang sudah tersimpan (saat mengubah transaksi). */
    existing?: { url: string; name: string | null } | null;
    removed: boolean;
    onRemovedChange: (removed: boolean) => void;
    error?: string;
}

/** Bukti transaksi opsional: foto langsung dari kamera atau pilih file (gambar/PDF). */
export function AttachmentPicker({ file, onFileChange, existing, removed, onRemovedChange, error }: AttachmentPickerProps) {
    const cameraRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!file || !file.type.startsWith('image/')) {
            setPreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const pick = async (list: FileList | null) => {
        const chosen = list?.[0];
        if (!chosen) return;
        setBusy(true);
        onFileChange(await compressImage(chosen));
        setBusy(false);
    };

    const input = (ref: typeof cameraRef, props: InputHTMLAttributes<HTMLInputElement>) => (
        <input
            ref={ref}
            type="file"
            className="hidden"
            onChange={(e) => {
                pick(e.target.files);
                e.target.value = '';
            }}
            {...props}
        />
    );

    const showExisting = existing && !removed && !file;

    return (
        <div className="grid gap-1.5">
            <span className="text-sm font-medium">
                {t('Bukti')} <span className="text-muted-foreground font-normal">{t('(opsional)')}</span>
            </span>

            {file ? (
                <div className="flex items-center gap-3 rounded-lg border p-2">
                    {preview ? (
                        <img src={preview} alt={t('Pratinjau bukti')} className="size-14 shrink-0 rounded object-cover" />
                    ) : (
                        <div className="bg-muted flex size-14 shrink-0 items-center justify-center rounded">
                            <FileText className="text-muted-foreground size-6" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                        <div className="truncate font-medium">{file.name}</div>
                        <div className="text-muted-foreground text-xs">
                            {formatSize(file.size)} · {t('tersimpan saat klik Simpan')}
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => onFileChange(null)}
                        aria-label={t('Batal pilih')}
                    >
                        <X className="size-4" />
                    </Button>
                </div>
            ) : showExisting ? (
                <div className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                    <Paperclip className="text-muted-foreground size-4 shrink-0" />
                    <a href={existing.url} target="_blank" rel="noreferrer" className="text-primary min-w-0 flex-1 truncate underline">
                        {existing.name ?? t('Lihat bukti')}
                    </a>
                    <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-red-600" onClick={() => onRemovedChange(true)}>
                        {t('Hapus')}
                    </Button>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => cameraRef.current?.click()}>
                    {busy ? <Loader2 className="animate-spin" /> : <Camera />} {t('Kamera')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <Upload /> {t('Pilih file')}
                </Button>
                {existing && removed && !file && (
                    <button type="button" className="text-muted-foreground text-xs underline" onClick={() => onRemovedChange(false)}>
                        {t('Batal hapus bukti lama')}
                    </button>
                )}
                {(file || showExisting) && <span className="text-muted-foreground text-xs">{t('Pilih lagi untuk mengganti')}</span>}
            </div>
            {/* capture membuka kamera belakang langsung di HP; di laptop jatuh ke pemilih file biasa */}
            {input(cameraRef, { accept: 'image/*', capture: 'environment' })}
            {input(fileRef, { accept: 'image/*,application/pdf' })}
            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    );
}
