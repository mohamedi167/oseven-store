import React, { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import type { Language, OfferTimer } from '../types';
import { useT } from '../utils/i18n';

interface Props {
  offer: OfferTimer | null;
  lang: Language;
  onSelectOffer?: () => void;
}

export const OfferCountdownBanner: React.FC<Props> = ({ offer, lang, onSelectOffer }) => {
  const t = useT(lang);
  const [dismissed, setDismissed] = useState(false);
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!offer) return;
    const update = () => {
      const diff = new Date(offer.endAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('00:00:00');
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [offer]);

  if (!offer || dismissed || remaining === '00:00:00') return null;

  return (
    <div className="relative z-40 h-9 w-full bg-[#7A0C1E] text-white flex items-center justify-center px-10 text-xs sm:text-sm border-b border-white/10">
      <button
        type="button"
        onClick={onSelectOffer}
        className="flex items-center gap-2.5 truncate hover:opacity-90 transition-opacity cursor-pointer"
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium truncate">
          {lang === 'ar' ? offer.titleAr : offer.title}
        </span>
        <span className="opacity-60" aria-hidden="true">·</span>
        <span className="hidden sm:inline opacity-85">{t.offerEndsIn}</span>
        <span className="font-mono-num font-semibold tracking-wider bg-black/25 px-2 py-0.5 rounded">
          {remaining}
        </span>
      </button>
      <button
        type="button"
        aria-label="Dismiss banner"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/75 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
