/** "Install the app": home-screen banner, the instructions sheet, and the button used elsewhere. */
import { motion } from 'framer-motion';
import { Download, EllipsisVertical, MonitorDown, PlusSquare, Share, X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { CdnxLockup } from '../../components/Brand';
import { Sheet } from '../../components/Sheet';
import { Pill } from '../../components/ui';
import { bannerDismissed, dismissBanner, iosBrowser, platform, useCanInstall, useInstall } from '../../pwa/install';
import { useUi } from '../../store/ui';

async function startInstall() {
  const r = await useInstall.getState().install();
  if (r === 'accepted') useUi.getState().toast({ tone: 'neutral', title: 'CADNEX is on your home screen', body: 'Open it from there for the full-screen app.' });
}

function AppTile({ size = 56 }: { size?: number }) {
  return <img src="/apple-touch-icon.png" alt="" width={size} height={size} className="shrink-0 rounded-[22%] shadow-[0_0_0_1px_rgb(var(--line)/0.08)]" />;
}

/** Dismissible card on Home inviting people to install. Comes back after two weeks. */
export function InstallBanner() {
  const can = useCanInstall();
  const [gone, setGone] = useState(bannerDismissed);
  if (!can || gone) return null;
  return (
    <motion.div layout className="glass mx-4 flex items-center gap-3 rounded-[22px] py-2.5 pl-2.5 pr-2 md:mx-0">
      <AppTile size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px]">Get the CADNEX app</p>
        <button onClick={() => void startInstall()} className="text-[13px] font-medium text-up">Install free →</button>
      </div>
      <button onClick={() => { dismissBanner(); setGone(true); }} aria-label="Not now" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-mute hover:bg-surface2"><X size={17} strokeWidth={1.5} /></button>
    </motion.div>
  );
}

/** A plain button that starts installing; renders nothing when installing isn't possible. */
export function InstallButton({ className = '', children }: { className?: string; children?: ReactNode }) {
  const can = useCanInstall();
  if (!can) return null;
  return (
    <Pill onClick={() => void startInstall()} className={className}>
      <Download size={17} strokeWidth={1.5} />{children ?? 'Install the app'}
    </Pill>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface3 text-[13px] font-medium">{n}</span>
      <span className="pt-0.5 text-[15px] leading-snug">{children}</span>
    </li>
  );
}

const Key = ({ children }: { children: ReactNode }) => <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-surface3 px-1.5 py-0.5 align-[-3px] text-[13.5px] font-medium">{children}</span>;

function Steps() {
  const p = platform();
  if (p === 'ios') {
    const b = iosBrowser();
    if (b === 'inapp') {
      return (
        <ol className="flex flex-col gap-4">
          <Step n={1}>This page is open inside another app. Tap <Key><EllipsisVertical size={14} className="rotate-90" /></Key> or the share menu and choose <b>Open in Safari</b>.</Step>
          <Step n={2}>In Safari, tap <Key><Share size={14} />Share</Key> then <Key><PlusSquare size={14} />Add to Home Screen</Key>.</Step>
        </ol>
      );
    }
    return (
      <ol className="flex flex-col gap-4">
        <Step n={1}>Tap <Key><Share size={14} />Share</Key> {b === 'safari' ? 'in the toolbar at the bottom of Safari (top right on iPad)' : 'next to the address bar'}.</Step>
        <Step n={2}>Scroll down and tap <Key><PlusSquare size={14} />Add to Home Screen</Key>.</Step>
        <Step n={3}>Tap <b>Add</b>. CADNEX appears on your home screen and opens full screen.</Step>
      </ol>
    );
  }
  if (p === 'android') {
    return (
      <ol className="flex flex-col gap-4">
        <Step n={1}>Open the browser menu <Key><EllipsisVertical size={14} /></Key> (top right in Chrome).</Step>
        <Step n={2}>Tap <b>Install app</b> or <b>Add to Home screen</b>.</Step>
        <Step n={3}>Confirm with <b>Install</b>. CADNEX appears with your apps.</Step>
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-4">
      <Step n={1}>In Chrome or Edge, click the install icon <Key><MonitorDown size={14} /></Key> at the right end of the address bar.</Step>
      <Step n={2}>In Safari on a Mac, choose <b>File → Add to Dock</b>.</Step>
    </ol>
  );
}

/** Instructions for browsers without an install prompt. Mounted once, at the app root. */
export function InstallSheet() {
  const open = useInstall((s) => s.sheet);
  const close = useInstall((s) => s.close);
  return (
    <Sheet open={open} onClose={close} label="Install CADNEX">
      <div className="flex flex-col gap-6 px-1 pb-2">
        <div className="flex items-center gap-4">
          <AppTile />
          <div>
            <CdnxLockup className="h-[30px] text-ink" />
            <p className="mt-1.5 text-[13.5px] text-mute">Free · no app store needed</p>
          </div>
        </div>
        <p className="text-[14.5px] leading-relaxed text-mute">Add CADNEX to your home screen. It opens full screen like any other app, starts faster, and you stay signed in to your account.</p>
        <Steps />
        <Pill tone="lime" size="lg" onClick={close}>Got it</Pill>
      </div>
    </Sheet>
  );
}
