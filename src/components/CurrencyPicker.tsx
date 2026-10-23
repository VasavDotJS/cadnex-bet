/** Searchable currency sheet: flag or coin mark, code and name. */
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CURRENCIES } from '../lib/currencies';
import { Sheet } from './Sheet';

export function CurrencyPicker({ open, onClose, value, onPick, title = 'Choose currency' }: { open: boolean; onClose: () => void; value: string; onPick: (code: string) => void; title?: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CURRENCIES.filter((c) => !s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s));
  }, [q]);
  const groups = [
    { label: 'Currencies', items: list.filter((c) => c.kind === 'fiat') },
    { label: 'Crypto', items: list.filter((c) => c.kind === 'crypto') },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      <label className="sticky top-0 z-10 mb-3 flex h-12 items-center gap-2 rounded-full bg-surface2 px-4">
        <Search size={17} strokeWidth={1.5} className="text-mute" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code or name" aria-label="Search currencies" className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
      </label>
      {groups.map((g) =>
        g.items.length ? (
          <div key={g.label} className="mb-4">
            <p className="px-1 pb-2 text-[12px] text-mute">{g.label}</p>
            <div className="flex flex-col">
              {g.items.map((c) => (
                <button key={c.code} onClick={() => { onPick(c.code); onClose(); setQ(''); }} className="flex h-14 items-center gap-3 rounded-[18px] px-2 text-left hover:bg-surface2" aria-pressed={c.code === value}>
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 ${c.kind === 'crypto' ? 'text-[17px] text-lavender' : 'text-[20px]'}`}>{c.glyph}</span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">{c.code}</span>
                    <span className="block text-[12.5px] text-mute">{c.name}</span>
                  </span>
                  {c.code === value && <Check size={18} className="text-lime" />}
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}
      {!list.length && <p className="py-10 text-center text-[14px] text-mute">No currency matches “{q}”.</p>}
    </Sheet>
  );
}
