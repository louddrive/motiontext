import type { Issue } from '../limits';

export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.slice(0, 20).map((i, k) => (
        <li key={k} className={i.level}>
          {i.level === 'error' ? 'エラー: ' : '注意: '}
          {i.message}
        </li>
      ))}
      {issues.length > 20 && <li className="warning">ほか {issues.length - 20} 件</li>}
    </ul>
  );
}
