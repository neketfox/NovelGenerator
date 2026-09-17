import React, { useEffect, useState } from 'react';
import { getUsageTotals, onUsageChange, type UsageTotals } from '../../services/usageTracker';
import { getActiveKeyLabel, onKeyPoolChange } from '../../services/geminiKeyPool';
import { useI18n } from '../../i18n';

const UsageWidget: React.FC = () => {
  const { t } = useI18n();
  const [totals, setTotals] = useState<UsageTotals>(getUsageTotals());
  const [activeKey, setActiveKey] = useState(getActiveKeyLabel());

  useEffect(() => {
    const unsubUsage = onUsageChange(() => setTotals(getUsageTotals()));
    const unsubKeys = onKeyPoolChange(() => setActiveKey(getActiveKeyLabel()));
    const interval = setInterval(() => setTotals(getUsageTotals()), 5000);
    return () => {
      unsubUsage();
      unsubKeys();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-400">
      <span>{t('usage.totalTokens')}: <span className="text-zinc-200">{totals.totalTokens.toLocaleString()}</span></span>
      <span>{t('usage.cost')}: <span className="text-zinc-200">${totals.estimatedCost.toFixed(2)}</span></span>
      <span>{t('usage.rpm')}: <span className="text-zinc-200">{totals.requestsPerMinute}</span></span>
      <span className="hidden sm:inline">{t('usage.activeKey')}: <span className="text-indigo-400">{activeKey}</span></span>
    </div>
  );
};

export default UsageWidget;
