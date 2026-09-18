import React, { useEffect, useState } from 'react';
import { getUsageTotals, onUsageChange, type UsageTotals } from '../../services/usageTracker';
import { getActiveKeyLabel, onKeyPoolChange } from '../../services/geminiKeyPool';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
}

/** The token/cost/RPM numbers the header used to show inline, behind a button instead. */
const UsageStatsModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [totals, setTotals] = useState<UsageTotals>(getUsageTotals());
  const [activeKey, setActiveKey] = useState(getActiveKeyLabel());

  useEffect(() => {
    const unsubUsage = onUsageChange(() => setTotals(getUsageTotals()));
    const unsubKeys = onKeyPoolChange(() => setActiveKey(getActiveKeyLabel()));
    const interval = setInterval(() => setTotals(getUsageTotals()), 2000);
    return () => { unsubUsage(); unsubKeys(); clearInterval(interval); };
  }, []);

  const rows: [string, string][] = [
    [t('usage.totalTokens'), totals.totalTokens.toLocaleString()],
    [t('usage.promptTokens'), totals.promptTokens.toLocaleString()],
    [t('usage.completionTokens'), totals.completionTokens.toLocaleString()],
    [t('usage.cost'), `$${totals.estimatedCost.toFixed(2)}`],
    [t('usage.rpm'), String(totals.requestsPerMinute)],
    [t('usage.activeKey'), activeKey],
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg text-zinc-100 mb-3">{t('usage.title')}</h2>
        <dl className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="text-zinc-100 font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">{t('common.close')}</button>
      </div>
    </div>
  );
};

export default UsageStatsModal;
