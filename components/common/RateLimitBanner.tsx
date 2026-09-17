import React, { useEffect, useState } from 'react';
import { onRateLimitChange, getRateLimitStatus, type RateLimitStatus } from '../../services/geminiKeyPool';
import { useI18n } from '../../i18n';

function secondsLeft(status: RateLimitStatus): number {
  if (!status.resumeAt) return 0;
  return Math.max(0, Math.ceil((status.resumeAt - Date.now()) / 1000));
}

/** Shown whenever every configured Gemini key is rate-limited — generation is not failing, it's
 *  waiting out the limit automatically (services/geminiKeyPool.ts) and will resume on its own. */
const RateLimitBanner: React.FC = () => {
  const { t } = useI18n();
  const [status, setStatus] = useState<RateLimitStatus>(getRateLimitStatus());
  const [, forceTick] = useState(0);

  useEffect(() => onRateLimitChange(setStatus), []);
  useEffect(() => {
    if (!status.resumeAt) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [status.resumeAt]);

  if (!status.resumeAt) return null;

  return (
    <div className="w-full bg-amber-950/60 border-b border-amber-800/60 text-amber-200 text-xs px-4 py-1.5 text-center">
      {t('rateLimit.waiting', { seconds: secondsLeft(status) })}
    </div>
  );
};

export default RateLimitBanner;
