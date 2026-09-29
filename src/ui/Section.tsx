import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * サイドバーの折りたたみセクション。
 * 閉じても中身はアンマウントしない（書き出し中に閉じても進捗などの状態を失わないように）。
 */
export function Section({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="section" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
