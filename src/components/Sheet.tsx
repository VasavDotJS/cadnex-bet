/** Bottom sheet with drag, velocity snapping and rubber-banding. Frosted surface. */
import { AnimatePresence, motion, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { gentle } from './motion';

export function Sheet({ open, onClose, title, children, footer, tall = false, label }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; tall?: boolean; label?: string;
}) {
  const controls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : 'Dialog')}>
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={`glass-strong relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-[32px] md:rounded-[32px] ${tall ? 'h-[88dvh] md:h-[80dvh]' : 'max-h-[88dvh]'}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={gentle}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div className="flex cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
              <span className="h-1.5 w-10 rounded-full bg-mute/40" />
            </div>
            {title !== undefined && (
              <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-1" onPointerDown={(e) => controls.start(e)}>
                <div className="min-w-0 text-[19px] font-semibold tracking-tighter2">{title}</div>
                <button aria-label="Close" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-mute hover:text-ink">
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
            {footer && <div className="border-t hair px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
