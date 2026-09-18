import React, { useState } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { I18nProvider, useI18n } from './i18n';
import Bookshelf from './components/dashboard/Bookshelf';
import LanguageSelector from './components/common/LanguageSelector';
import ApiKeyManagerModal from './components/common/ApiKeyManagerModal';
import UsageWidget from './components/usage/UsageWidget';
import RateLimitBanner from './components/common/RateLimitBanner';
import App from './App';

const StudioHeader: React.FC = () => {
  const { t } = useI18n();
  const [showKeys, setShowKeys] = useState(false);
  return (
    <header className="border-b border-zinc-800 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <Link to="/" className="text-sm font-semibold text-zinc-100">{t('app.title')}</Link>
      <div className="flex items-center gap-3">
        <div className="hidden lg:block">
          <UsageWidget />
        </div>
        <button
          onClick={() => setShowKeys(true)}
          className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500"
        >
          🔑 {t('keys.title')}
        </button>
        <LanguageSelector />
      </div>
      {showKeys && <ApiKeyManagerModal onClose={() => setShowKeys(false)} />}
    </header>
  );
};

/**
 * A book is always the generator's own page (App → ThreeZoneGenerationView): /project/new is
 * that page with an empty slot showing its creation form, and /project/:id is the same page
 * bound to a slot on disk. There is no second editor — the box's page is the editor, and it
 * carries its own header, so the Studio header only appears on the dashboard.
 */
const Shell: React.FC = () => {
  const location = useLocation();
  const isProjectPage = location.pathname.startsWith('/project/');
  return (
    <div className="min-h-screen flex flex-col">
      <RateLimitBanner />
      {!isProjectPage && <StudioHeader />}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Bookshelf />} />
          <Route path="/project/new" element={<App />} />
          <Route path="/project/:id" element={<App />} />
        </Routes>
      </div>
    </div>
  );
};

const AppRouter: React.FC = () => (
  <I18nProvider>
    <HashRouter>
      <Shell />
    </HashRouter>
  </I18nProvider>
);

export default AppRouter;
