import { useI18n } from '../i18n/react';
import type { Issue } from '../limits';

export function IssueList({ issues }: { issues: Issue[] }) {
  const { t, tl } = useI18n();
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.slice(0, 20).map((i, k) => (
        <li key={k} className={i.level}>
          {t(i.level === 'error' ? 'issue.error' : 'issue.warning')}
          {tl(i)}
        </li>
      ))}
      {issues.length > 20 && <li className="warning">{t('issue.more', { count: issues.length - 20 })}</li>}
    </ul>
  );
}
