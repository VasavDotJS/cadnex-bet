/**
 * Character avatars: 15 original comic-style characters (bold ink outlines, flat colours) that
 * blink, bob and wiggle. A player picks one in Account → Edit profile.
 *
 * Stored in the profile's existing avatar seed: seeds CHARACTER_BASE + i are character i,
 * anything else is the colour gradient with the player's initial. No database change needed.
 */
import type { ReactNode } from 'react';

export const CHARACTER_BASE = 5000;

const INK = '#17151C';
const S = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Eyes that blink (the group squashes vertically now and then). */
function Eyes({ l, r, y, rx = 2.2, ry = 3, delay = 0 }: { l: number; r: number; y: number; rx?: number; ry?: number; delay?: number }) {
  return (
    <g className="av-blink" style={{ animationDelay: `${delay}s` }}>
      <ellipse cx={l} cy={y} rx={rx} ry={ry} fill={INK} />
      <ellipse cx={r} cy={y} rx={rx} ry={ry} fill={INK} />
      <circle cx={l + rx * 0.35} cy={y - ry * 0.4} r={rx * 0.35} fill="#fff" />
      <circle cx={r + rx * 0.35} cy={y - ry * 0.4} r={rx * 0.35} fill="#fff" />
    </g>
  );
}

/** Round eyes with whites and pupils. */
function BigEyes({ l, r, y, w = 5.5, p = 2.6, delay = 0, white = '#fff' }: { l: number; r: number; y: number; w?: number; p?: number; delay?: number; white?: string }) {
  return (
    <g className="av-blink" style={{ animationDelay: `${delay}s` }}>
      <circle cx={l} cy={y} r={w} fill={white} {...S} />
      <circle cx={r} cy={y} r={w} fill={white} {...S} />
      <circle cx={l + 0.8} cy={y + 0.6} r={p} fill={INK} />
      <circle cx={r + 0.8} cy={y + 0.6} r={p} fill={INK} />
      <circle cx={l + 1.6} cy={y - 0.6} r={p * 0.36} fill="#fff" />
      <circle cx={r + 1.6} cy={y - 0.6} r={p * 0.36} fill="#fff" />
    </g>
  );
}

const Cheeks = ({ l, r, y, c = '#FF7A9A' }: { l: number; r: number; y: number; c?: string }) => (
  <g opacity={0.55}><ellipse cx={l} cy={y} rx={3} ry={1.8} fill={c} /><ellipse cx={r} cy={y} rx={3} ry={1.8} fill={c} /></g>
);

/** Comic shine on the background disc. */
const Shine = () => <path d="M10 22 A24 24 0 0 1 22 9" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />;

export interface Character {
  id: string;
  name: string;
  bg: string;
  art: ReactNode;
}

export const CHARACTERS: Character[] = [
  {
    id: 'fox', name: 'Fox', bg: '#2BB3A3',
    art: (
      <g className="av-bob">
        <path d="M14 64 Q32 50 50 64Z" fill="#E8692A" {...S} />
        <g className="av-wiggle-l"><path d="M15 26 L17 7 L29 19Z" fill="#F2762E" {...S} /><path d="M18 20 L19 12 L24 18Z" fill="#7A2E12" /></g>
        <g className="av-wiggle-r"><path d="M49 26 L47 7 L35 19Z" fill="#F2762E" {...S} /><path d="M46 20 L45 12 L40 18Z" fill="#7A2E12" /></g>
        <path d="M12 26 Q14 17 32 17 Q50 17 52 26 Q52 40 32 53 Q12 40 12 26Z" fill="#F2762E" {...S} />
        <path d="M14 32 Q24 33 32 45 Q40 33 50 32 Q47 44 32 53 Q17 44 14 32Z" fill="#FFF4E6" {...S} />
        <Eyes l={24} r={40} y={29} />
        <path d="M29.5 44 Q32 42.5 34.5 44 Q33 47 32 47 Q31 47 29.5 44Z" fill={INK} />
      </g>
    ),
  },
  {
    id: 'panda', name: 'Panda', bg: '#F7C548',
    art: (
      <g className="av-bob">
        <path d="M13 64 Q32 50 51 64Z" fill="#fff" {...S} />
        <circle cx="17" cy="18" r="6.5" fill={INK} />
        <circle cx="47" cy="18" r="6.5" fill={INK} />
        <circle cx="32" cy="34" r="19" fill="#fff" {...S} />
        <ellipse cx="24" cy="33" rx="5.6" ry="7" fill={INK} transform="rotate(-24 24 33)" />
        <ellipse cx="40" cy="33" rx="5.6" ry="7" fill={INK} transform="rotate(24 40 33)" />
        <g className="av-blink"><circle cx="24.5" cy="32.5" r="2.2" fill="#fff" /><circle cx="39.5" cy="32.5" r="2.2" fill="#fff" /><circle cx="24.8" cy="32.8" r="1.1" fill={INK} /><circle cx="39.8" cy="32.8" r="1.1" fill={INK} /></g>
        <ellipse cx="32" cy="41" rx="3.2" ry="2.2" fill={INK} />
        <path d="M28.5 45 Q30.2 47.5 32 45.5 Q33.8 47.5 35.5 45" fill="none" {...S} strokeWidth={1.8} />
        <Cheeks l={20} r={44} y={42} />
      </g>
    ),
  },
  {
    id: 'shiba', name: 'Shiba', bg: '#6C8CFF',
    art: (
      <g className="av-bob">
        <path d="M13 64 Q32 50 51 64Z" fill="#E8A15A" {...S} />
        <g className="av-wiggle-l"><path d="M13 30 L15 9 L28 20Z" fill="#E8A15A" {...S} /><path d="M16.5 22 L17.5 14 L23 19Z" fill="#FFF4E6" /></g>
        <g className="av-wiggle-r"><path d="M51 30 L49 9 L36 20Z" fill="#E8A15A" {...S} /><path d="M47.5 22 L46.5 14 L41 19Z" fill="#FFF4E6" /></g>
        <path d="M11 32 Q11 17 32 17 Q53 17 53 32 Q53 51 32 52 Q11 51 11 32Z" fill="#E8A15A" {...S} />
        <path d="M17 38 Q20 31 26 33 Q32 36 38 33 Q44 31 47 38 Q46 51 32 52 Q18 51 17 38Z" fill="#FFF4E6" />
        <circle cx="24" cy="25.5" r="1.7" fill="#FFF4E6" /><circle cx="40" cy="25.5" r="1.7" fill="#FFF4E6" />
        <Eyes l={24} r={40} y={31} rx={2} ry={2.6} />
        <ellipse cx="32" cy="39" rx="3.4" ry="2.4" fill={INK} />
        <path d="M27 44 Q32 49 37 44" fill="none" {...S} strokeWidth={1.9} />
        <path d="M30.5 45.8 Q32 51 33.5 45.8Z" fill="#FF6B8B" stroke={INK} strokeWidth={1.3} />
      </g>
    ),
  },
  {
    id: 'cat', name: 'Tux the cat', bg: '#FF8FB1',
    art: (
      <g className="av-bob">
        <path d="M13 64 Q32 50 51 64Z" fill="#2A2730" {...S} />
        <path d="M27 64 L32 55 L37 64Z" fill="#fff" />
        <g className="av-wiggle-l"><path d="M13 28 L14 9 L28 19Z" fill="#2A2730" {...S} /><path d="M16 20 L16.5 13 L22 18Z" fill="#FF8FB1" /></g>
        <g className="av-wiggle-r"><path d="M51 28 L50 9 L36 19Z" fill="#2A2730" {...S} /><path d="M48 20 L47.5 13 L42 18Z" fill="#FF8FB1" /></g>
        <ellipse cx="32" cy="34" rx="20" ry="17.5" fill="#2A2730" {...S} />
        <path d="M22 41 Q24 32 32 34 Q40 32 42 41 Q40 50 32 50.5 Q24 50 22 41Z" fill="#fff" />
        <g className="av-blink"><ellipse cx="24" cy="31" rx="4" ry="4.4" fill="#B6F25B" stroke={INK} strokeWidth={1.4} /><ellipse cx="40" cy="31" rx="4" ry="4.4" fill="#B6F25B" stroke={INK} strokeWidth={1.4} /><ellipse cx="24" cy="31" rx="1.1" ry="3.4" fill={INK} /><ellipse cx="40" cy="31" rx="1.1" ry="3.4" fill={INK} /></g>
        <path d="M30 40 L34 40 L32 42.5Z" fill="#FF6B8B" />
        <path d="M28.5 45 Q30.3 47 32 44.8 Q33.7 47 35.5 45" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <g stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.9}><path d="M20 42 L10 40" /><path d="M20 44.5 L10 46" /><path d="M44 42 L54 40" /><path d="M44 44.5 L54 46" /></g>
      </g>
    ),
  },
  {
    id: 'frog', name: 'Frog', bg: '#8E7CF6',
    art: (
      <g className="av-bob">
        <path d="M12 64 Q32 50 52 64Z" fill="#4FAF5A" {...S} />
        <path d="M9 38 Q9 24 32 24 Q55 24 55 38 Q55 53 32 53 Q9 53 9 38Z" fill="#63C66B" {...S} />
        <circle cx="20" cy="22" r="8" fill="#63C66B" {...S} />
        <circle cx="44" cy="22" r="8" fill="#63C66B" {...S} />
        <g className="av-blink"><circle cx="20" cy="22" r="5" fill="#fff" /><circle cx="44" cy="22" r="5" fill="#fff" /><circle cx="21" cy="23" r="2.6" fill={INK} /><circle cx="45" cy="23" r="2.6" fill={INK} /></g>
        <path d="M16 40 Q32 51 48 40" fill="none" {...S} />
        <Cheeks l={16} r={48} y={36} />
        <circle cx="29" cy="33" r="0.9" fill={INK} /><circle cx="35" cy="33" r="0.9" fill={INK} />
      </g>
    ),
  },
  {
    id: 'owl', name: 'Owl', bg: '#2A9D8F',
    art: (
      <g className="av-bob">
        <path d="M12 64 L12 38 Q12 16 32 16 Q52 16 52 38 L52 64Z" fill="#8C5A3C" {...S} />
        <path d="M14 22 L12 10 L23 18Z" fill="#8C5A3C" {...S} />
        <path d="M50 22 L52 10 L41 18Z" fill="#8C5A3C" {...S} />
        <path d="M22 64 Q22 46 32 46 Q42 46 42 64Z" fill="#E9C9A3" />
        <g stroke="#B88A62" strokeWidth={1.4} fill="none" strokeLinecap="round"><path d="M26 53 Q28 55 30 53" /><path d="M34 53 Q36 55 38 53" /><path d="M30 58 Q32 60 34 58" /></g>
        <circle cx="23" cy="31" r="8.5" fill="#F4A259" {...S} />
        <circle cx="41" cy="31" r="8.5" fill="#F4A259" {...S} />
        <BigEyes l={23} r={41} y={31} w={5.6} p={3} />
        <path d="M29 37 L35 37 L32 43Z" fill="#F7C548" {...S} strokeWidth={1.8} />
      </g>
    ),
  },
  {
    id: 'shark', name: 'Shark', bg: '#4CC9F0',
    art: (
      <g>
        <g className="av-wiggle-fin"><path d="M28 19 Q34 6 41 4 Q38 13 40 20Z" fill="#7D8CA3" {...S} /></g>
        <g className="av-bob">
          <path d="M8 64 L8 40 Q8 18 32 18 Q56 18 56 40 L56 64Z" fill="#7D8CA3" {...S} />
          <path d="M14 64 L14 47 Q32 38 50 47 L50 64Z" fill="#EEF2F7" {...S} />
          <path d="M18 46 Q32 41 46 46 L44 50 L41 46.5 L38 50.5 L35 46 L32 50.8 L29 46 L26 50.5 L23 46.5 L20 50Z" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <Eyes l={21} r={43} y={33} rx={2.4} ry={2.6} />
          <path d="M16.5 28.5 L25 30.5" {...S} strokeWidth={2} /><path d="M47.5 28.5 L39 30.5" {...S} strokeWidth={2} />
          <g stroke={INK} strokeWidth={1.4} strokeLinecap="round"><path d="M10 38 L13 36" /><path d="M10 42 L13 40" /><path d="M54 38 L51 36" /><path d="M54 42 L51 40" /></g>
        </g>
      </g>
    ),
  },
  {
    id: 'lion', name: 'Lion', bg: '#3D5AFE',
    art: (
      <g className="av-bob">
        <path d="M13 64 Q32 50 51 64Z" fill="#F6C453" {...S} />
        <path d="M32 9 L37 14 L44 11 L46 18 L53 19 L51 26 L57 31 L52 36 L55 43 L48 45 L47 52 L40 51 L36 57 L32 52 L28 57 L24 51 L17 52 L16 45 L9 43 L12 36 L7 31 L13 26 L11 19 L18 18 L20 11 L27 14Z" fill="#B5651D" {...S} />
        <circle cx="32" cy="34" r="14.5" fill="#F6C453" {...S} />
        <circle cx="21" cy="22" r="3.6" fill="#F6C453" {...S} /><circle cx="43" cy="22" r="3.6" fill="#F6C453" {...S} />
        <Eyes l={26} r={38} y={31} rx={1.9} ry={2.5} />
        <path d="M26 39 Q32 35 38 39 Q38 45 32 45 Q26 45 26 39Z" fill="#FFF0C9" />
        <path d="M29.5 38 L34.5 38 L32 40.8Z" fill={INK} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M32 41 L32 43 M29 44 Q32 46 35 44" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: 'penguin', name: 'Penguin', bg: '#FF6B6B',
    art: (
      <g className="av-bob">
        <path d="M10 64 L10 40 Q10 15 32 15 Q54 15 54 40 L54 64Z" fill="#23222B" {...S} />
        <path d="M16 64 L16 44 Q16 30 24 27 Q28 26 32 30 Q36 26 40 27 Q48 30 48 44 L48 64Z" fill="#fff" {...S} strokeWidth={1.8} />
        <Eyes l={25} r={39} y={34} rx={2} ry={2.6} />
        <path d="M27 40 Q32 37 37 40 Q34 44.5 32 44.5 Q30 44.5 27 40Z" fill="#FFA62B" {...S} strokeWidth={1.8} />
        <Cheeks l={20} r={44} y={41} />
      </g>
    ),
  },
  {
    id: 'bulldog', name: 'Bulldog', bg: '#9BE15D',
    art: (
      <g className="av-bob">
        <path d="M11 64 Q32 50 53 64Z" fill="#D9A066" {...S} />
        <g className="av-wiggle-l"><path d="M15 23 Q7 16 10 30 Q14 30 18 27Z" fill="#9C6B3F" {...S} /></g>
        <g className="av-wiggle-r"><path d="M49 23 Q57 16 54 30 Q50 30 46 27Z" fill="#9C6B3F" {...S} /></g>
        <path d="M12 34 Q12 18 32 18 Q52 18 52 34 Q53 45 46 49 Q32 55 18 49 Q11 45 12 34Z" fill="#D9A066" {...S} />
        <path d="M25 22 Q32 25 39 22" fill="none" stroke="#9C6B3F" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M20 39 Q22 32 32 33 Q42 32 44 39 Q44 47 32 48 Q20 47 20 39Z" fill="#F2D3A9" />
        <Eyes l={24} r={40} y={29} rx={2} ry={2.4} />
        <ellipse cx="32" cy="37" rx="4" ry="2.8" fill={INK} />
        <path d="M24 44 Q32 41 40 44" fill="none" {...S} strokeWidth={1.9} />
        <path d="M27 43.2 L28 40.5 L29.5 42.7Z M37 43.2 L36 40.5 L34.5 42.7Z" fill="#fff" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      </g>
    ),
  },
  {
    id: 'robot', name: 'Robot', bg: '#FFD166',
    art: (
      <g className="av-bob">
        <path d="M14 64 L16 54 L48 54 L50 64Z" fill="#9AA5B8" {...S} />
        <path d="M32 18 L32 10" {...S} />
        <circle cx="32" cy="8.5" r="3.4" fill="#B5F23D" {...S} className="av-pulse" />
        <rect x="12" y="18" width="40" height="34" rx="9" fill="#C9D2E0" {...S} />
        <rect x="7" y="28" width="6" height="12" rx="2.5" fill="#9AA5B8" {...S} />
        <rect x="51" y="28" width="6" height="12" rx="2.5" fill="#9AA5B8" {...S} />
        <rect x="17" y="24" width="30" height="15" rx="5" fill="#1F2A44" {...S} />
        <g className="av-blink"><rect x="21.5" y="28" width="6" height="7" rx="2" fill="#5CE1E6" /><rect x="36.5" y="28" width="6" height="7" rx="2" fill="#5CE1E6" /></g>
        <rect x="22" y="43" width="20" height="5" rx="2" fill="#9AA5B8" stroke={INK} strokeWidth={1.6} />
        <path d="M27 43 L27 48 M32 43 L32 48 M37 43 L37 48" stroke={INK} strokeWidth={1.3} />
      </g>
    ),
  },
  {
    id: 'alien', name: 'Alien', bg: '#2B2152',
    art: (
      <g>
        <g fill="#fff"><circle cx="11" cy="14" r="1" /><circle cx="54" cy="20" r="1.2" /><circle cx="49" cy="8" r="0.8" /><circle cx="8" cy="40" r="0.9" /></g>
        <g className="av-float">
          <path d="M14 64 Q32 52 50 64Z" fill="#7BD88F" {...S} />
          <g className="av-wiggle-l"><path d="M23 18 Q19 10 15 8" fill="none" {...S} /><circle cx="15" cy="8" r="2.6" fill="#F15BB5" {...S} strokeWidth={1.8} /></g>
          <g className="av-wiggle-r"><path d="M41 18 Q45 10 49 8" fill="none" {...S} /><circle cx="49" cy="8" r="2.6" fill="#F15BB5" {...S} strokeWidth={1.8} /></g>
          <path d="M32 15 Q53 15 52 33 Q51 47 32 55 Q13 47 12 33 Q11 15 32 15Z" fill="#7BD88F" {...S} />
          <g className="av-blink">
            <path d="M15.5 31 Q18 24 27 29 Q28 37 21.5 37 Q15 36 15.5 31Z" fill={INK} />
            <path d="M48.5 31 Q46 24 37 29 Q36 37 42.5 37 Q49 36 48.5 31Z" fill={INK} />
            <circle cx="20" cy="30" r="1.4" fill="#fff" /><circle cx="44" cy="30" r="1.4" fill="#fff" />
          </g>
          <path d="M28.5 45 Q32 47.5 35.5 45" fill="none" {...S} strokeWidth={1.9} />
        </g>
      </g>
    ),
  },
  {
    id: 'dealer', name: 'The Dealer', bg: '#0F7A5A',
    art: (
      <g className="av-bob">
        <path d="M10 64 Q12 52 32 51 Q52 52 54 64Z" fill="#fff" {...S} />
        <path d="M10 64 Q12 53 23 52 L28 64Z M54 64 Q52 53 41 52 L36 64Z" fill="#23222B" />
        <path d="M27 54 L32 57 L27 60Z M37 54 L32 57 L37 60Z" fill="#E63946" {...S} strokeWidth={1.5} />
        <path d="M15 32 Q15 17 32 17 Q49 17 49 32 Q49 49 32 50 Q15 49 15 32Z" fill="#E0A87E" {...S} />
        <path d="M15 31 Q14 16 32 15 Q50 16 49 31 Q44 22 32 23 Q20 22 15 31Z" fill="#3B2A20" />
        <path d="M10 25 Q32 16 54 25 L50 30 Q32 22 14 30Z" fill="#2ECC71" fillOpacity={0.85} {...S} strokeWidth={2} />
        <rect x="47" y="25" width="7" height="10" rx="1.2" fill="#fff" stroke={INK} strokeWidth={1.4} transform="rotate(18 50 30)" />
        <path d="M50.2 28.6 l1 1.4 l-1 1.4 l-1 -1.4z" fill="#E63946" transform="rotate(18 50 30)" />
        <Eyes l={25.5} r={38.5} y={34} rx={1.8} ry={2.3} />
        <path d="M22 42 Q27 38.5 32 41.5 Q37 38.5 42 42 Q38 44.5 32 43 Q26 44.5 22 42Z" fill="#3B2A20" />
        <path d="M29 46.5 Q32 48 35 46.5" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: 'ghost', name: 'Ghost', bg: '#3A86FF',
    art: (
      <g className="av-float">
        <path d="M14 60 L14 33 Q14 13 32 13 Q50 13 50 33 L50 60 L45 55 L40 60 L35 55 L32 59 L29 55 L24 60 L19 55Z" fill="#F7F7FF" {...S} />
        <BigEyes l={25.5} r={38.5} y={31} w={4.2} p={2.4} />
        <ellipse cx="32" cy="42" rx="3.4" ry="4.2" fill={INK} />
        <Cheeks l={20} r={44} y={38} />
      </g>
    ),
  },
  {
    id: 'dragon', name: 'Dragon', bg: '#F94144',
    art: (
      <g>
        <g className="av-puff"><circle cx="20" cy="42" r="3" fill="#fff" fillOpacity={0.85} /><circle cx="15.5" cy="38" r="2.2" fill="#fff" fillOpacity={0.7} /></g>
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill="#3FA34D" {...S} />
          <path d="M19 21 Q14 10 9 9 Q14 15 15 25Z" fill="#F7C548" {...S} strokeWidth={2} />
          <path d="M45 21 Q50 10 55 9 Q50 15 49 25Z" fill="#F7C548" {...S} strokeWidth={2} />
          <path d="M28 15 L32 9 L36 15Z" fill="#F7C548" {...S} strokeWidth={1.8} />
          <path d="M13 33 Q13 15 32 15 Q51 15 51 33 Q51 52 32 53 Q13 52 13 33Z" fill="#52C162" {...S} />
          <path d="M20 42 Q20 35 32 35 Q44 35 44 42 Q44 52 32 52 Q20 52 20 42Z" fill="#A7E8A0" {...S} strokeWidth={1.8} />
          <ellipse cx="27.5" cy="40" rx="1.6" ry="1.2" fill={INK} /><ellipse cx="36.5" cy="40" rx="1.6" ry="1.2" fill={INK} />
          <path d="M26 46.5 Q32 50 38 46.5" fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
          <g className="av-blink"><ellipse cx="24" cy="27" rx="3.3" ry="3.6" fill="#FFE066" stroke={INK} strokeWidth={1.4} /><ellipse cx="40" cy="27" rx="3.3" ry="3.6" fill="#FFE066" stroke={INK} strokeWidth={1.4} /><ellipse cx="24" cy="27" rx="1" ry="2.8" fill={INK} /><ellipse cx="40" cy="27" rx="1" ry="2.8" fill={INK} /></g>
        </g>
      </g>
    ),
  },
];

/** The character for a stored avatar seed, if the seed is one. */
export function characterFor(seed: number): Character | null {
  const i = seed - CHARACTER_BASE;
  return Number.isInteger(i) && i >= 0 && i < CHARACTERS.length ? CHARACTERS[i] : null;
}

export const characterSeed = (i: number) => CHARACTER_BASE + i;

/** A character in a round frame. `still` turns the animation off (tiny sizes, lists). */
export function CharacterAvatar({ c, size, still = false, phase = 0 }: { c: Character; size: number; still?: boolean; phase?: number }) {
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full ${still ? '' : 'av-anim'}`} style={{ width: size, height: size, ['--av-delay' as string]: `${-phase}s` }} aria-hidden>
      <svg viewBox="0 0 64 64" width={size} height={size} role="presentation">
        <circle cx="32" cy="32" r="32" fill={c.bg} />
        <Shine />
        {c.art}
      </svg>
    </span>
  );
}
