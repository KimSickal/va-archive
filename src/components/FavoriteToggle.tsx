import { isFavorite, toggleFavorite, useFavorites, type FavoriteKind } from '../state/favorites';

export function FavoriteToggle({ kind, id, label }: { kind: FavoriteKind; id: string; label: string }) {
  const fav = useFavorites();
  const on = isFavorite(fav, kind, id);
  return (
    <button
      className={`fav-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => toggleFavorite(kind, id)}
      title={label}
    >
      {on ? '★' : '☆'} <span>{label}</span>
    </button>
  );
}
