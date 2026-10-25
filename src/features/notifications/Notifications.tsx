/** Notifications centre: settled bets and followed-match moments. */
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, NotificationRow } from '../../db/db';
import { Empty, Pill, TwoTone } from '../../components/ui';
import { useSession } from '../../store/session';
import { spring } from '../../components/motion';

/** Notification links only ever open pages inside the app. */
const inAppPath = (link?: string | null) => (link && /^\/(?![\\/])[^\s]*$/.test(link) ? link : '/');

let listeners = new Set<() => void>();
export function notifyChanged(): void {
  listeners.forEach((l) => l());
}

export function useNotifications(): NotificationRow[] {
  const user = useSession((s) => s.user);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  useEffect(() => {
    if (!user) { setRows([]); return; }
    let alive = true;
    const load = () => db.notifications.where('[userId+createdAt]').between([user.id, 0], [user.id, Number.MAX_SAFE_INTEGER]).reverse().limit(100).toArray().then((r) => alive && setRows(r));
    void load();
    const t = setInterval(load, 4000);
    listeners.add(load);
    return () => { alive = false; clearInterval(t); listeners.delete(load); };
  }, [user]);
  return rows;
}

export function useUnread(): number {
  return useNotifications().filter((n) => !n.read).length;
}

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export function NotificationsPage() {
  const rows = useNotifications();
  const user = useSession((s) => s.user);
  const markAll = async () => {
    if (!user) return;
    await db.notifications.where('userId').equals(user.id).modify({ read: true });
    notifyChanged();
  };
  return (
    <div className="px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <div className="flex items-end justify-between">
        <TwoTone a="Your" b="updates" size="lg" as="h1" />
        {rows.some((r) => !r.read) && <Pill size="sm" onClick={markAll}>Mark all read</Pill>}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {rows.length === 0 ? (
          <Empty title="Nothing yet" body="Settled bets and big moments in matches you follow will show up here." />
        ) : (
          rows.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.035 }}>
              <Link to={inAppPath(n.link)} onClick={() => { void db.notifications.update(n.id, { read: true }).then(notifyChanged); }} className="flex items-start gap-3 rounded-[22px] bg-surface p-4">
                <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${n.read ? 'bg-surface2 text-mute' : 'bg-lime/20 text-ink'}`}><Bell size={17} strokeWidth={1.5} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-[14.5px] ${n.read ? 'text-mute' : 'font-medium'}`}>{n.title}</p>
                    <span className="shrink-0 text-[12px] text-faint">{ago(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-mute">{n.body}</p>
                </div>
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

export function resetNotificationListeners(): void {
  listeners = new Set();
}
