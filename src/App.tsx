import { useEffect } from 'react';
import { createHashRouter, Link, NavLink, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { SearchBox } from './components/Search';
import { DbProvider } from './data/DbContext';
import { t } from './i18n/ko';
import { CharacterPage } from './pages/CharacterPage';
import { ComparePersonsPage, CompareWorksPage, VsFavoritesPage } from './pages/ComparePages';
import { FranchisePage } from './pages/FranchisePage';
import { AboutPage, FavoritesPage, HomePage, SearchPage } from './pages/MiscPages';
import { NotFound } from './pages/NotFound';
import { PersonPage } from './pages/PersonPage';
import { WorkPage } from './pages/WorkPage';
import { updateSettings, useSettings } from './state/settings';

function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const { theme } = useSettings();
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!loc.pathname.includes('/character/')) document.title = t.appName;
  }, [loc.pathname]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  return (
    <>
      <header className="topbar">
        <Link to="/" className="logo">
          {t.appName}
        </Link>
        {loc.pathname !== '/' && <SearchBox onSubmit={(q) => nav(`/search?q=${encodeURIComponent(q)}`)} />}
        <nav>
          <NavLink to="/compare/works">작품 비교</NavLink>
          <NavLink to="/compare/persons">성우 비교</NavLink>
          <NavLink to="/favorites">즐겨찾기</NavLink>
          <NavLink to="/about">정보</NavLink>
          <button
            className="chip-btn"
            title="테마"
            onClick={() =>
              updateSettings({ theme: theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark' })
            }
          >
            {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥'}
          </button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/person/:id', element: <PersonPage /> },
      { path: '/work/:id', element: <WorkPage /> },
      { path: '/work/:id/vs-favorites', element: <VsFavoritesPage /> },
      { path: '/franchise/:id', element: <FranchisePage /> },
      { path: '/franchise/:id/character/:cid', element: <CharacterPage /> },
      { path: '/compare/works', element: <CompareWorksPage /> },
      { path: '/compare/persons', element: <ComparePersonsPage /> },
      { path: '/favorites', element: <FavoritesPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <DbProvider
      fallback={(s, retry) => (
        <div className="loading">
          {s.status === 'loading' ? (
            <p>{t.loading}</p>
          ) : (
            <p>
              {t.loadFailed} ({s.status === 'error' ? s.message : ''}){' '}
              <button className="btn" onClick={retry}>
                {t.retry}
              </button>
            </p>
          )}
        </div>
      )}
    >
      <RouterProvider router={router} />
    </DbProvider>
  );
}
