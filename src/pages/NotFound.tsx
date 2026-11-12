import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <article className="page">
      <h1>찾을 수 없습니다</h1>
      <p>
        요청한 항목이 데이터에 없습니다. <Link to="/">홈으로</Link>
      </p>
    </article>
  );
}
