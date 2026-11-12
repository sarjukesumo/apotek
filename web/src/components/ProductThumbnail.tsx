import { useState } from "react";

export function ProductThumbnail({ name, imageUrl, className = "" }: {
  name: string; imageUrl?: string; className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const available = !!imageUrl && failedUrl !== imageUrl;
  return (
    <div className={`shrink-0 rounded-xl border border-surface-200 bg-white overflow-hidden flex items-center justify-center ${className}`}>
      {available ? (
        <img src={imageUrl} alt={`Foto ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className="w-full h-full object-contain p-1" onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <div role="img" aria-label={`${name}: ${imageUrl ? "foto gagal dimuat" : "belum ada foto"}`}
          className="flex flex-col items-center justify-center gap-1 p-1 text-center text-ink-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8" cy="8" r="1.5" />
            <path d="m3 17 5-5 4 4 3-3 6 6" />
          </svg>
          <span className="text-[9px] leading-tight">{imageUrl ? "Foto gagal dimuat" : "Belum ada foto"}</span>
        </div>
      )}
    </div>
  );
}
