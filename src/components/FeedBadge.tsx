/** Shows where scores come from and whether the live feed is current. */
import { useLive } from '../store/live';
import { useNow } from './ui';

export function FeedBadge({ className = '' }: { className?: string }) {
  const health = useLive((s) => s.health);
  const now = useNow(1000);
  if (!health) return <span className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-surface2 px-2.5 text-[11.5px] text-mute ${className}`}><span className="h-1.5 w-1.5 rounded-full bg-mute" />Connecting to live scores</span>;
  const age = health.lastOk ? Math.max(0, Math.round((now - health.lastOk) / 1000)) : null;
  const fresh = health.ok && age !== null && age < 50;
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] ${fresh ? 'bg-up/12 text-up' : 'bg-warn/15 text-warn'} ${className}`} title={health.error ?? `Scores from ${health.provider}'s public feed. Can run up to a minute behind TV.`}>
      <span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'bg-up breathe' : 'bg-warn'}`} />
      {fresh ? `Live scores · ${health.provider} · ${age! < 5 ? 'just now' : `${age}s ago`}` : age === null ? 'Live scores unavailable' : `Reconnecting · last update ${age < 120 ? `${age}s` : `${Math.round(age / 60)}m`} ago`}
    </span>
  );
}
