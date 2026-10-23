import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUi } from '../store/ui';
import { spring } from './motion';

const toneDot: Record<string, string> = {
  neutral: 'bg-mute', win: 'bg-lime', loss: 'bg-down', error: 'bg-down', demo: 'bg-lavender',
};

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-4 md:left-auto md:right-6 md:items-end" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={spring}
            className={`glass pointer-events-auto flex w-full max-w-[400px] items-start gap-3 rounded-[22px] px-4 py-3 ${t.tone === 'win' ? 'ring-1 ring-lime/40' : ''}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[t.tone]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-snug">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-mute">{t.body}</p>}
            </div>
            {t.action && (
              <Link to={t.action.to} onClick={() => dismiss(t.id)} className="shrink-0 self-center rounded-full bg-surface2 px-3 py-1.5 text-[12.5px] font-medium">
                {t.action.label}
              </Link>
            )}
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 shrink-0 self-center rounded-full p-1.5 text-mute hover:text-ink">
              <X size={15} strokeWidth={1.5} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
