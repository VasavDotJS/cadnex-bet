/**
 * Character avatars, drawn as soft 3D figures in the style of emoji: rounded volumes, gentle
 * gradients, glossy eyes, no outlines. They blink, bob and wiggle.
 *
 * Stored in the profile's avatar seed: CHARACTER_BASE + i is character i (anyone can pick
 * these), ADMIN_SEED is the owner's own portrait (the database refuses it for anyone who
 * isn't an admin). Any other seed is the colour gradient with the player's initial.
 */
import { ReactNode, useId } from 'react';

export const CHARACTER_BASE = 5000;
/** The owner's personal avatar: reserved for admins by a database rule. */
export const ADMIN_SEED = 9000;

/** Makes gradient ids unique per avatar on the page. */
type U = (name: string) => string;
const url = (u: U, n: string) => `url(#${u(n)})`;

type Stop = [number, string, number?];
const stops = (s: Stop[]) => s.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />);

/** A soft sphere-like fill: light top-left, base, deep bottom-right. */
function Ball({ u, id, light, base, dark, cx = 0.36, cy = 0.3, r = 0.78 }: { u: U; id: string; light: string; base: string; dark: string; cx?: number; cy?: number; r?: number }) {
  return (
    <radialGradient id={u(id)} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>
      {stops([[0, light], [0.55, base], [1, dark]])}
    </radialGradient>
  );
}
function Lin({ u, id, s, x2 = 0, y2 = 1 }: { u: U; id: string; s: Stop[]; x2?: number; y2?: number }) {
  return <linearGradient id={u(id)} x1="0" y1="0" x2={x2} y2={y2}>{stops(s)}</linearGradient>;
}

/** Shared defs: glossy eye, blush, background disc and floor shadow. */
function Common({ u, bg }: { u: U; bg: [string, string] }) {
  return (
    <>
      <radialGradient id={u('bg')} cx="0.5" cy="0.38" r="0.7">{stops([[0, bg[0]], [1, bg[1]]])}</radialGradient>
      <radialGradient id={u('eye')} cx="0.4" cy="0.32" r="0.75">{stops([[0, '#4A3B45'], [0.6, '#1C1620'], [1, '#07060A']])}</radialGradient>
      <radialGradient id={u('blush')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#FF6F91', 0.55], [1, '#FF6F91', 0]])}</radialGradient>
      <radialGradient id={u('floor')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#000', 0.28], [1, '#000', 0]])}</radialGradient>
      <radialGradient id={u('shine')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#fff', 0.85], [1, '#fff', 0]])}</radialGradient>
    </>
  );
}

/** Glossy eyes that blink. */
function Eyes({ u, l, r, y, rx = 2.6, ry = 3.3, delay = 0 }: { u: U; l: number; r: number; y: number; rx?: number; ry?: number; delay?: number }) {
  return (
    <g className="av-blink" style={{ animationDelay: `${delay}s` }}>
      {[l, r].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={url(u, 'eye')} />
          <ellipse cx={x - rx * 0.3} cy={y - ry * 0.38} rx={rx * 0.42} ry={ry * 0.32} fill="#fff" opacity={0.95} />
          <circle cx={x + rx * 0.4} cy={y + ry * 0.4} r={rx * 0.16} fill="#fff" opacity={0.7} />
        </g>
      ))}
    </g>
  );
}

/** Big round eyes: white ball, coloured iris, glossy pupil. */
function BigEyes({ u, l, r, y, w, iris, irisId }: { u: U; l: number; r: number; y: number; w: number; iris?: number; irisId?: string }) {
  const ir = iris ?? w * 0.62;
  return (
    <g className="av-blink">
      {[l, r].map((x) => (
        <g key={x}>
          <circle cx={x} cy={y} r={w} fill={url(u, 'white')} />
          {irisId && <circle cx={x + 0.5} cy={y + 0.4} r={ir} fill={url(u, irisId)} />}
          <circle cx={x + 0.6} cy={y + 0.5} r={irisId ? ir * 0.55 : ir} fill={url(u, 'eye')} />
          <ellipse cx={x - w * 0.18} cy={y - w * 0.3} rx={w * 0.26} ry={w * 0.2} fill="#fff" />
        </g>
      ))}
    </g>
  );
}
const WhiteBall = ({ u }: { u: U }) => <Ball u={u} id="white" light="#FFFFFF" base="#F6F6FA" dark="#C9CCD8" />;

const Blush = ({ u, l, r, y }: { u: U; l: number; r: number; y: number }) => (
  <><ellipse cx={l} cy={y} rx={4} ry={2.6} fill={url(u, 'blush')} /><ellipse cx={r} cy={y} rx={4} ry={2.6} fill={url(u, 'blush')} /></>
);
/** Soft specular highlight on a volume. */
const Gloss = ({ u, cx, cy, rx, ry, o = 0.55 }: { u: U; cx: number; cy: number; rx: number; ry: number; o?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={url(u, 'shine')} opacity={o} />
);
const Floor = ({ u, y = 60 }: { u: U; y?: number }) => <ellipse cx="32" cy={y} rx="20" ry="4" fill={url(u, 'floor')} />;

export interface Character {
  id: string;
  name: string;
  bg: [string, string];
  art: (u: U) => ReactNode;
}

export const CHARACTERS: Character[] = [
  {
    id: 'fox', name: 'Fox', bg: ['#A9F0E6', '#2BB3A3'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="fur" light="#FFC27A" base="#F57C2B" dark="#B9471A" />
          <Ball u={u} id="cream" light="#FFFFFF" base="#FFF1E2" dark="#E9CDB2" cy={0.2} />
          <Lin u={u} id="ear" s={[[0, '#7A2E12'], [1, '#C4501A']]} />
          <Ball u={u} id="nose" light="#6B5560" base="#231C22" dark="#0A0809" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M12 64 Q32 50 52 64Z" fill={url(u, 'fur')} />
          <g className="av-wiggle-l"><path d="M14 30 Q12 14 17 6 Q25 12 30 20Z" fill={url(u, 'fur')} /><path d="M17.5 23 Q17 14 19 10 Q23 14 26 19Z" fill={url(u, 'ear')} /></g>
          <g className="av-wiggle-r"><path d="M50 30 Q52 14 47 6 Q39 12 34 20Z" fill={url(u, 'fur')} /><path d="M46.5 23 Q47 14 45 10 Q41 14 38 19Z" fill={url(u, 'ear')} /></g>
          <path d="M11 28 Q12 16 32 16 Q52 16 53 28 Q53 42 32 54 Q11 42 11 28Z" fill={url(u, 'fur')} />
          <path d="M13 33 Q23 33 32 46 Q41 33 51 33 Q48 46 32 54 Q16 46 13 33Z" fill={url(u, 'cream')} />
          <Gloss u={u} cx={24} cy={21} rx={8} ry={3.5} />
          <Eyes u={u} l={24} r={40} y={29} />
          <path d="M28.6 43.5 Q32 41.5 35.4 43.5 Q34 47.5 32 47.5 Q30 47.5 28.6 43.5Z" fill={url(u, 'nose')} />
          <ellipse cx="31" cy="43.4" rx="1.4" ry="0.7" fill="#fff" opacity={0.6} />
        </g>
      </>
    ),
  },
  {
    id: 'panda', name: 'Panda', bg: ['#FFF0B8', '#F2B92F'],
    art: (u) => (
      <>
        <defs>
          <WhiteBall u={u} />
          <Ball u={u} id="black" light="#5D5C68" base="#26252D" dark="#0B0B0F" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill={url(u, 'white')} />
          <g className="av-wiggle-l"><circle cx="17" cy="18" r="7" fill={url(u, 'black')} /></g>
          <g className="av-wiggle-r"><circle cx="47" cy="18" r="7" fill={url(u, 'black')} /></g>
          <circle cx="32" cy="34" r="20" fill={url(u, 'white')} />
          <ellipse cx="24" cy="33" rx="6" ry="7.5" fill={url(u, 'black')} transform="rotate(-24 24 33)" />
          <ellipse cx="40" cy="33" rx="6" ry="7.5" fill={url(u, 'black')} transform="rotate(24 40 33)" />
          <g className="av-blink"><circle cx="24.6" cy="32.6" r="2.5" fill="#fff" /><circle cx="39.4" cy="32.6" r="2.5" fill="#fff" /><circle cx="25" cy="33" r="1.3" fill="#111" /><circle cx="39.8" cy="33" r="1.3" fill="#111" /></g>
          <ellipse cx="32" cy="41.4" rx="3.6" ry="2.5" fill={url(u, 'black')} />
          <ellipse cx="31" cy="40.6" rx="1.3" ry="0.6" fill="#fff" opacity={0.6} />
          <path d="M28.4 45.4 Q30.2 47.8 32 45.8 Q33.8 47.8 35.6 45.4" fill="none" stroke="#2A2830" strokeWidth={1.4} strokeLinecap="round" />
          <Blush u={u} l={19} r={45} y={42} />
          <Gloss u={u} cx={24} cy={20} rx={8} ry={3.6} o={0.8} />
        </g>
      </>
    ),
  },
  {
    id: 'shiba', name: 'Shiba', bg: ['#C9D5FF', '#5B7BFF'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="fur" light="#FFD49A" base="#EE9C4E" dark="#B4612A" />
          <Ball u={u} id="cream" light="#FFFFFF" base="#FFF4E6" dark="#EBD5BC" cy={0.2} />
          <Ball u={u} id="nose" light="#6B5560" base="#231C22" dark="#0A0809" />
          <Ball u={u} id="tongue" light="#FFB3C4" base="#FF6B8B" dark="#C93A5C" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill={url(u, 'fur')} />
          <g className="av-wiggle-l"><path d="M12 31 Q11 14 16 8 Q24 12 29 20Z" fill={url(u, 'fur')} /><path d="M16 24 Q16 15 18 12 Q22 15 25 20Z" fill={url(u, 'cream')} /></g>
          <g className="av-wiggle-r"><path d="M52 31 Q53 14 48 8 Q40 12 35 20Z" fill={url(u, 'fur')} /><path d="M48 24 Q48 15 46 12 Q42 15 39 20Z" fill={url(u, 'cream')} /></g>
          <path d="M10 33 Q10 17 32 17 Q54 17 54 33 Q54 52 32 53 Q10 52 10 33Z" fill={url(u, 'fur')} />
          <path d="M16 39 Q19 31 26 33 Q32 36 38 33 Q45 31 48 39 Q47 52 32 53 Q17 52 16 39Z" fill={url(u, 'cream')} />
          <circle cx="24" cy="25" r="2" fill={url(u, 'cream')} /><circle cx="40" cy="25" r="2" fill={url(u, 'cream')} />
          <Eyes u={u} l={24} r={40} y={31} rx={2.4} ry={3} />
          <ellipse cx="32" cy="39" rx="3.8" ry="2.7" fill={url(u, 'nose')} />
          <ellipse cx="31" cy="38.2" rx="1.4" ry="0.6" fill="#fff" opacity={0.6} />
          <path d="M27 44 Q32 48 37 44" fill="none" stroke="#3B2A22" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M30 45.6 Q30 51 32 51 Q34 51 34 45.6Z" fill={url(u, 'tongue')} />
          <Gloss u={u} cx={23} cy={21} rx={8} ry={3.4} />
        </g>
      </>
    ),
  },
  {
    id: 'cat', name: 'Tux the cat', bg: ['#FFD3E1', '#FF7FA6'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="fur" light="#64636F" base="#2C2B34" dark="#101015" />
          <WhiteBall u={u} />
          <Ball u={u} id="iris" light="#E4FFA8" base="#8BD43B" dark="#3F7A12" />
          <Ball u={u} id="pink" light="#FFC3D1" base="#FF8FAE" dark="#D35C80" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill={url(u, 'fur')} />
          <path d="M27 64 L32 55 L37 64Z" fill={url(u, 'white')} />
          <g className="av-wiggle-l"><path d="M12 29 Q11 14 14 7 Q23 12 29 19Z" fill={url(u, 'fur')} /><path d="M15.5 22 Q15 14 16.5 11 Q21 14 24 18Z" fill={url(u, 'pink')} /></g>
          <g className="av-wiggle-r"><path d="M52 29 Q53 14 50 7 Q41 12 35 19Z" fill={url(u, 'fur')} /><path d="M48.5 22 Q49 14 47.5 11 Q43 14 40 18Z" fill={url(u, 'pink')} /></g>
          <ellipse cx="32" cy="34" rx="21" ry="18.5" fill={url(u, 'fur')} />
          <path d="M21 42 Q23 32 32 34 Q41 32 43 42 Q41 51 32 51.5 Q23 51 21 42Z" fill={url(u, 'white')} />
          <g className="av-blink">
            {[24, 40].map((x) => (
              <g key={x}><ellipse cx={x} cy={31} rx={4.4} ry={4.8} fill={url(u, 'iris')} /><ellipse cx={x} cy={31.3} rx={1.3} ry={3.7} fill="#0B0B0F" /><ellipse cx={x - 1.4} cy={29.4} rx={1.2} ry={0.9} fill="#fff" /></g>
            ))}
          </g>
          <path d="M29.8 40 Q32 39 34.2 40 Q33.4 42.6 32 42.6 Q30.6 42.6 29.8 40Z" fill={url(u, 'pink')} />
          <path d="M28.5 45 Q30.3 47 32 44.8 Q33.7 47 35.5 45" fill="none" stroke="#3A3640" strokeWidth={1.3} strokeLinecap="round" />
          <g stroke="#fff" strokeOpacity={0.85} strokeWidth={0.9} strokeLinecap="round"><path d="M20 42 L10 40" /><path d="M20 44.5 L10 46" /><path d="M44 42 L54 40" /><path d="M44 44.5 L54 46" /></g>
          <Gloss u={u} cx={24} cy={21} rx={8} ry={3.4} o={0.35} />
        </g>
      </>
    ),
  },
  {
    id: 'frog', name: 'Frog', bg: ['#DCD5FF', '#7E6CF2'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="skin" light="#C4F7A8" base="#5CC65A" dark="#2A7F38" />
          <WhiteBall u={u} />
          <Ball u={u} id="mouth" light="#E2547A" base="#B3264D" dark="#6E0F2B" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M11 64 Q32 50 53 64Z" fill={url(u, 'skin')} />
          <path d="M8 38 Q8 23 32 23 Q56 23 56 38 Q56 54 32 54 Q8 54 8 38Z" fill={url(u, 'skin')} />
          <circle cx="20" cy="22" r="8.6" fill={url(u, 'skin')} />
          <circle cx="44" cy="22" r="8.6" fill={url(u, 'skin')} />
          <BigEyes u={u} l={20} r={44} y={22} w={5.6} iris={3} />
          <path d="M15 40 Q32 52 49 40 Q32 47 15 40Z" fill={url(u, 'mouth')} />
          <Blush u={u} l={15} r={49} y={36} />
          <circle cx="29" cy="33" r="0.9" fill="#1E5A28" /><circle cx="35" cy="33" r="0.9" fill="#1E5A28" />
          <Gloss u={u} cx={26} cy={28} rx={9} ry={3} o={0.5} />
        </g>
      </>
    ),
  },
  {
    id: 'owl', name: 'Owl', bg: ['#B8F0E6', '#22948A'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="body" light="#C08A64" base="#8C5A3C" dark="#55331F" />
          <Ball u={u} id="face" light="#FFE3B8" base="#F4B26B" dark="#C9803A" />
          <Ball u={u} id="belly" light="#FFF6E8" base="#EAD2AF" dark="#C9A981" />
          <WhiteBall u={u} />
          <Ball u={u} id="iris" light="#FFE38A" base="#F59E2B" dark="#B55E0A" />
          <Ball u={u} id="beak" light="#FFF0A0" base="#F6BE2F" dark="#C88A12" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M11 64 L11 38 Q11 15 32 15 Q53 15 53 38 L53 64Z" fill={url(u, 'body')} />
          <g className="av-wiggle-l"><path d="M13 23 Q10 13 13 7 Q19 13 23 18Z" fill={url(u, 'body')} /></g>
          <g className="av-wiggle-r"><path d="M51 23 Q54 13 51 7 Q45 13 41 18Z" fill={url(u, 'body')} /></g>
          <path d="M21 64 Q21 46 32 46 Q43 46 43 64Z" fill={url(u, 'belly')} />
          <circle cx="23" cy="31" r="9" fill={url(u, 'face')} />
          <circle cx="41" cy="31" r="9" fill={url(u, 'face')} />
          <BigEyes u={u} l={23} r={41} y={31} w={5.8} iris={3.6} irisId="iris" />
          <path d="M28.6 37 Q32 35.6 35.4 37 Q33.6 43 32 43.6 Q30.4 43 28.6 37Z" fill={url(u, 'beak')} />
          <Gloss u={u} cx={24} cy={20} rx={7} ry={2.8} o={0.4} />
        </g>
      </>
    ),
  },
  {
    id: 'shark', name: 'Shark', bg: ['#C6F1FF', '#2FB4E8'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="skin" light="#D4DEEA" base="#7F8FA7" dark="#46536B" />
          <Ball u={u} id="belly" light="#FFFFFF" base="#F1F4F9" dark="#C7CFDC" cy={0.15} />
          <Lin u={u} id="tooth" s={[[0, '#FFFFFF'], [1, '#DDE3EC']]} />
          <Ball u={u} id="mouth" light="#C2405E" base="#7C1A33" dark="#3E0A18" />
        </defs>
        <Floor u={u} />
        <g className="av-wiggle-fin"><path d="M27 20 Q33 6 42 3 Q38 13 41 21Z" fill={url(u, 'skin')} /></g>
        <g className="av-bob">
          <path d="M7 64 L7 40 Q7 17 32 17 Q57 17 57 40 L57 64Z" fill={url(u, 'skin')} />
          <path d="M13 64 L13 47 Q32 37 51 47 L51 64Z" fill={url(u, 'belly')} />
          <path d="M17 45.5 Q32 39 47 45.5 Q46 52 32 53 Q18 52 17 45.5Z" fill={url(u, 'mouth')} />
          <path d="M18 46 Q32 40.5 46 46 L44 49.4 L41 46.4 L38 50 L35 46 L32 50.4 L29 46 L26 50 L23 46.4 L20 49.4Z" fill={url(u, 'tooth')} />
          <Eyes u={u} l={21} r={43} y={33} rx={2.6} ry={2.8} />
          <path d="M16.5 28.4 L25.5 30.6 M47.5 28.4 L38.5 30.6" stroke="#3B465C" strokeWidth={2} strokeLinecap="round" />
          <g stroke="#56637C" strokeWidth={1.3} strokeLinecap="round"><path d="M10 38 L13 36" /><path d="M10 42 L13 40" /><path d="M54 38 L51 36" /><path d="M54 42 L51 40" /></g>
          <Gloss u={u} cx={24} cy={22} rx={9} ry={3.2} />
        </g>
      </>
    ),
  },
  {
    id: 'lion', name: 'Lion', bg: ['#C9D2FF', '#3550F0'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="mane" light="#F5A55A" base="#C26A24" dark="#7A3A10" cx={0.4} cy={0.35} />
          <Ball u={u} id="face" light="#FFEEB0" base="#F6C453" dark="#C68E28" />
          <Ball u={u} id="muzzle" light="#FFFFFF" base="#FFF2CF" dark="#E8CF95" cy={0.2} />
          <Ball u={u} id="nose" light="#8A5A4A" base="#4A2A22" dark="#1F100C" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill={url(u, 'face')} />
          <path d="M32 8 Q37 12 44 10 Q46 16 53 18 Q51 25 57 30 Q52 35 55 42 Q48 44 48 51 Q41 51 37 57 Q34 53 32 54 Q30 53 27 57 Q23 51 16 51 Q16 44 9 42 Q12 35 7 30 Q13 25 11 18 Q18 16 20 10 Q27 12 32 8Z" fill={url(u, 'mane')} />
          <circle cx="21" cy="22" r="4" fill={url(u, 'face')} /><circle cx="43" cy="22" r="4" fill={url(u, 'face')} />
          <circle cx="32" cy="34" r="15" fill={url(u, 'face')} />
          <Eyes u={u} l={26} r={38} y={31} rx={2.2} ry={2.8} />
          <path d="M25 40 Q32 34.5 39 40 Q39 46 32 46 Q25 46 25 40Z" fill={url(u, 'muzzle')} />
          <path d="M29 37.8 Q32 36.8 35 37.8 Q33.8 40.8 32 40.8 Q30.2 40.8 29 37.8Z" fill={url(u, 'nose')} />
          <path d="M32 41 L32 42.8 M29 43.8 Q32 45.8 35 43.8" fill="none" stroke="#5A3A20" strokeWidth={1.2} strokeLinecap="round" />
          <Gloss u={u} cx={27} cy={24} rx={6} ry={2.4} />
        </g>
      </>
    ),
  },
  {
    id: 'penguin', name: 'Penguin', bg: ['#FFD0D0', '#FF5E62'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="body" light="#5C5B69" base="#25242D" dark="#0B0B10" />
          <Ball u={u} id="face" light="#FFFFFF" base="#F7F8FC" dark="#CDD1DD" cy={0.25} />
          <Ball u={u} id="beak" light="#FFD58A" base="#FFA62B" dark="#D2730A" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M9 64 L9 40 Q9 14 32 14 Q55 14 55 40 L55 64Z" fill={url(u, 'body')} />
          <path d="M15 64 L15 44 Q15 29 24 26.5 Q28 25.6 32 29.5 Q36 25.6 40 26.5 Q49 29 49 44 L49 64Z" fill={url(u, 'face')} />
          <Eyes u={u} l={25} r={39} y={34} rx={2.3} ry={2.9} />
          <path d="M26.5 40 Q32 36.5 37.5 40 Q34.5 45 32 45 Q29.5 45 26.5 40Z" fill={url(u, 'beak')} />
          <Blush u={u} l={20} r={44} y={41} />
          <Gloss u={u} cx={24} cy={19} rx={8} ry={3} o={0.35} />
        </g>
      </>
    ),
  },
  {
    id: 'bulldog', name: 'Bulldog', bg: ['#E2FBC4', '#7FD13B'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="fur" light="#F4C895" base="#D9A066" dark="#9C6533" />
          <Ball u={u} id="ear" light="#BE8A5A" base="#8F5E33" dark="#5E3A1A" />
          <Ball u={u} id="muzzle" light="#FFF3E0" base="#F2D3A9" dark="#D2AA78" cy={0.2} />
          <Ball u={u} id="nose" light="#6B5560" base="#231C22" dark="#0A0809" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M10 64 Q32 50 54 64Z" fill={url(u, 'fur')} />
          <g className="av-wiggle-l"><path d="M16 22 Q6 15 9 31 Q14 31 19 27Z" fill={url(u, 'ear')} /></g>
          <g className="av-wiggle-r"><path d="M48 22 Q58 15 55 31 Q50 31 45 27Z" fill={url(u, 'ear')} /></g>
          <path d="M11 34 Q11 17 32 17 Q53 17 53 34 Q54 46 46 50 Q32 56 18 50 Q10 46 11 34Z" fill={url(u, 'fur')} />
          <path d="M25 22 Q32 25 39 22" fill="none" stroke="#A9733F" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M19 40 Q21 32 32 33 Q43 32 45 40 Q45 48 32 49 Q19 48 19 40Z" fill={url(u, 'muzzle')} />
          <Eyes u={u} l={24} r={40} y={29} rx={2.3} ry={2.7} />
          <ellipse cx="32" cy="37" rx="4.4" ry="3" fill={url(u, 'nose')} />
          <ellipse cx="30.8" cy="36.2" rx="1.6" ry="0.7" fill="#fff" opacity={0.6} />
          <path d="M24 44.5 Q32 41.4 40 44.5" fill="none" stroke="#5A3A20" strokeWidth={1.6} strokeLinecap="round" />
          <path d="M27 43.6 L28 40.8 L29.5 43Z M37 43.6 L36 40.8 L34.5 43Z" fill="#fff" />
          <Gloss u={u} cx={24} cy={21} rx={8} ry={3} />
        </g>
      </>
    ),
  },
  {
    id: 'robot', name: 'Robot', bg: ['#FFF0BF', '#FFC53D'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="metal" light="#FFFFFF" base="#C9D2E0" dark="#7F8BA1" cx={0.3} cy={0.2} />
          <Ball u={u} id="dark" light="#4A5A82" base="#1F2A44" dark="#0B1020" cx={0.3} cy={0.2} />
          <Ball u={u} id="glow" light="#E8FFFF" base="#5CE1E6" dark="#1A9AA0" cx={0.4} cy={0.35} />
          <Ball u={u} id="bulb" light="#F4FFD6" base="#B5F23D" dark="#6EA514" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M13 64 L15 54 L49 54 L51 64Z" fill={url(u, 'metal')} />
          <rect x="30.8" y="10" width="2.4" height="9" rx="1.2" fill={url(u, 'metal')} />
          <circle cx="32" cy="8.5" r="3.8" fill={url(u, 'bulb')} className="av-pulse" />
          <rect x="11" y="18" width="42" height="35" rx="11" fill={url(u, 'metal')} />
          <rect x="6" y="28" width="7" height="13" rx="3.5" fill={url(u, 'metal')} />
          <rect x="51" y="28" width="7" height="13" rx="3.5" fill={url(u, 'metal')} />
          <rect x="16.5" y="23.5" width="31" height="16" rx="6" fill={url(u, 'dark')} />
          <g className="av-blink"><rect x="21" y="27.5" width="7" height="8" rx="3" fill={url(u, 'glow')} /><rect x="36" y="27.5" width="7" height="8" rx="3" fill={url(u, 'glow')} /></g>
          <path d="M19 26 Q30 24 40 25" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.2} strokeLinecap="round" fill="none" />
          <rect x="22" y="43" width="20" height="5.4" rx="2.7" fill={url(u, 'dark')} />
          <path d="M27 43.6 L27 47.8 M32 43.6 L32 47.8 M37 43.6 L37 47.8" stroke="#5CE1E6" strokeOpacity={0.6} strokeWidth={1} />
          <Gloss u={u} cx={22} cy={21} rx={8} ry={2.2} o={0.7} />
        </g>
      </>
    ),
  },
  {
    id: 'alien', name: 'Alien', bg: ['#4B3D8F', '#160F33'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="skin" light="#D6FFE0" base="#7BD88F" dark="#2E8A4A" />
          <Ball u={u} id="tip" light="#FFD6F0" base="#F15BB5" dark="#A3237A" />
        </defs>
        <g fill="#fff"><circle cx="11" cy="14" r="1" /><circle cx="54" cy="20" r="1.2" /><circle cx="49" cy="8" r="0.8" opacity={0.7} /><circle cx="8" cy="40" r="0.9" opacity={0.8} /></g>
        <g className="av-float">
          <path d="M14 64 Q32 52 50 64Z" fill={url(u, 'skin')} />
          <g className="av-wiggle-l"><path d="M23 18 Q19 10 15 8" fill="none" stroke="#5BBF73" strokeWidth={2} strokeLinecap="round" /><circle cx="15" cy="8" r="3" fill={url(u, 'tip')} /></g>
          <g className="av-wiggle-r"><path d="M41 18 Q45 10 49 8" fill="none" stroke="#5BBF73" strokeWidth={2} strokeLinecap="round" /><circle cx="49" cy="8" r="3" fill={url(u, 'tip')} /></g>
          <path d="M32 14 Q54 14 53 33 Q52 48 32 56 Q12 48 11 33 Q10 14 32 14Z" fill={url(u, 'skin')} />
          <g className="av-blink">
            <path d="M14.5 31 Q17 23 27.5 28.5 Q28.5 38 21.5 38 Q14 37 14.5 31Z" fill={url(u, 'eye')} />
            <path d="M49.5 31 Q47 23 36.5 28.5 Q35.5 38 42.5 38 Q50 37 49.5 31Z" fill={url(u, 'eye')} />
            <ellipse cx="19.5" cy="29.5" rx="2.4" ry="1.6" fill="#fff" /><ellipse cx="44.5" cy="29.5" rx="2.4" ry="1.6" fill="#fff" />
          </g>
          <path d="M28.5 46 Q32 48.4 35.5 46" fill="none" stroke="#2E7A44" strokeWidth={1.5} strokeLinecap="round" />
          <Gloss u={u} cx={25} cy={19} rx={9} ry={3.2} />
        </g>
      </>
    ),
  },
  {
    id: 'dealer', name: 'The Dealer', bg: ['#9BE3C8', '#0E7A58'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="skin" light="#FFD9B8" base="#E5A97C" dark="#B07247" />
          <Ball u={u} id="hair" light="#6A4A38" base="#3B2A20" dark="#1C120C" />
          <Lin u={u} id="visor" s={[[0, '#7CF0A8', 0.95], [1, '#14A35A', 0.9]]} />
          <Ball u={u} id="shirt" light="#FFFFFF" base="#F2F3F7" dark="#C9CDD8" cy={0.2} />
          <Ball u={u} id="vest" light="#4E4D5C" base="#24232C" dark="#0D0D12" />
          <Ball u={u} id="tie" light="#FF8A95" base="#E63946" dark="#9C1825" />
        </defs>
        <Floor u={u} />
        <g className="av-bob">
          <path d="M10 64 Q12 52 32 51 Q52 52 54 64Z" fill={url(u, 'shirt')} />
          <path d="M10 64 Q12 53 23 52 L28 64Z M54 64 Q52 53 41 52 L36 64Z" fill={url(u, 'vest')} />
          <path d="M26.5 54 L32 57 L26.5 60.4Z M37.5 54 L32 57 L37.5 60.4Z" fill={url(u, 'tie')} />
          <circle cx="32" cy="57" r="1.6" fill={url(u, 'tie')} />
          <circle cx="15" cy="34" r="3.4" fill={url(u, 'skin')} /><circle cx="49" cy="34" r="3.4" fill={url(u, 'skin')} />
          <path d="M15 32 Q15 17 32 17 Q49 17 49 32 Q49 50 32 51 Q15 50 15 32Z" fill={url(u, 'skin')} />
          <path d="M15 31 Q14 15.5 32 15 Q50 15.5 49 31 Q44 22 32 23 Q20 22 15 31Z" fill={url(u, 'hair')} />
          <path d="M9.5 25 Q32 15.5 54.5 25 L50.5 30.5 Q32 22.5 13.5 30.5Z" fill={url(u, 'visor')} />
          <g transform="rotate(18 50 30)"><rect x="47" y="25" width="7" height="10" rx="1.4" fill="#fff" /><path d="M50.5 28.4 l1.1 1.5 l-1.1 1.5 l-1.1 -1.5z" fill="#E63946" /></g>
          <Eyes u={u} l={25.5} r={38.5} y={34} rx={2.1} ry={2.6} />
          <path d="M22 42 Q27 38.4 32 41.4 Q37 38.4 42 42 Q38 44.6 32 43.2 Q26 44.6 22 42Z" fill={url(u, 'hair')} />
          <path d="M29 46.5 Q32 48.2 35 46.5" fill="none" stroke="#8A4A2E" strokeWidth={1.4} strokeLinecap="round" />
          <Blush u={u} l={20} r={44} y={40} />
        </g>
      </>
    ),
  },
  {
    id: 'ghost', name: 'Ghost', bg: ['#C7DAFF', '#3A7BFF'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="sheet" light="#FFFFFF" base="#F1F2FB" dark="#BFC4E2" cx={0.35} cy={0.25} />
          <WhiteBall u={u} />
        </defs>
        <Floor u={u} y={61} />
        <g className="av-float">
          <path d="M13 58 L13 33 Q13 12 32 12 Q51 12 51 33 L51 58 Q48 54 45 58 Q42 62 39 57 Q36 53 32 58 Q28 62 25 57 Q22 53 19 58 Q16 62 13 58Z" fill={url(u, 'sheet')} />
          <Eyes u={u} l={25.5} r={38.5} y={31} rx={2.9} ry={3.6} />
          <ellipse cx="32" cy="42" rx="3.6" ry="4.4" fill={url(u, 'eye')} />
          <Blush u={u} l={19.5} r={44.5} y={38} />
          <Gloss u={u} cx={24} cy={19} rx={8} ry={3.4} o={0.9} />
        </g>
      </>
    ),
  },
  {
    id: 'dragon', name: 'Dragon', bg: ['#FFC6C7', '#F2363B'],
    art: (u) => (
      <>
        <defs>
          <Ball u={u} id="skin" light="#B8F2A8" base="#4FBF5F" dark="#23793A" />
          <Ball u={u} id="snout" light="#F2FFE8" base="#A7E8A0" dark="#6CB869" cy={0.2} />
          <Ball u={u} id="horn" light="#FFF4C2" base="#F7C548" dark="#B9851A" />
          <Ball u={u} id="iris" light="#FFF7B8" base="#FFD93D" dark="#D19A0A" />
        </defs>
        <Floor u={u} />
        <g className="av-puff"><circle cx="20" cy="42" r="3.4" fill="#fff" fillOpacity={0.9} /><circle cx="15.5" cy="37.6" r="2.4" fill="#fff" fillOpacity={0.75} /></g>
        <g className="av-bob">
          <path d="M13 64 Q32 50 51 64Z" fill={url(u, 'skin')} />
          <path d="M19 21 Q14 10 8.5 8.5 Q13 15 14.6 25Z" fill={url(u, 'horn')} />
          <path d="M45 21 Q50 10 55.5 8.5 Q51 15 49.4 25Z" fill={url(u, 'horn')} />
          <path d="M27.6 15.5 Q32 7 36.4 15.5Z" fill={url(u, 'horn')} />
          <path d="M12 33 Q12 14 32 14 Q52 14 52 33 Q52 53 32 54 Q12 53 12 33Z" fill={url(u, 'skin')} />
          <path d="M19 42 Q19 34.5 32 34.5 Q45 34.5 45 42 Q45 53 32 53 Q19 53 19 42Z" fill={url(u, 'snout')} />
          <ellipse cx="27.5" cy="40" rx="1.7" ry="1.3" fill="#1F5A2A" /><ellipse cx="36.5" cy="40" rx="1.7" ry="1.3" fill="#1F5A2A" />
          <path d="M25.6 46.5 Q32 50.4 38.4 46.5" fill="none" stroke="#2E6E3A" strokeWidth={1.5} strokeLinecap="round" />
          <g className="av-blink">
            {[24, 40].map((x) => (
              <g key={x}><ellipse cx={x} cy={27} rx={3.6} ry={4} fill={url(u, 'iris')} /><ellipse cx={x} cy={27.3} rx={1.1} ry={3} fill="#0B0B0F" /><ellipse cx={x - 1.2} cy={25.6} rx={1} ry={0.8} fill="#fff" /></g>
            ))}
          </g>
          <Gloss u={u} cx={24} cy={19} rx={8} ry={3} />
        </g>
      </>
    ),
  },
];

/** The owner's portrait: a big-headed mirror-selfie cartoon (only admins can use it). */
export const OWNER: Character = {
  id: 'vasu', name: 'Vasu', bg: ['#7A6CFF', '#24186B'],
  art: (u) => (
    <>
      <defs>
        <Ball u={u} id="skin" light="#B47A52" base="#734428" dark="#3E2212" cx={0.38} cy={0.28} />
        <Ball u={u} id="hair" light="#3A302C" base="#141010" dark="#050404" cx={0.4} cy={0.2} />
        <Lin u={u} id="fade" s={[[0, '#141010', 0.95], [0.55, '#141010', 0.7], [1, '#141010', 0.95]]} />
        <Ball u={u} id="lip" light="#7A4430" base="#4E2618" dark="#2E140A" cy={0.2} />
        <Ball u={u} id="nose" light="#9A6440" base="#6A3D24" dark="#46240F" cx={0.4} cy={0.25} />
        <Ball u={u} id="beard" light="#2E2420" base="#120E0D" dark="#050404" />
        <Ball u={u} id="tee" light="#FAF6EA" base="#E3DCC6" dark="#AFA68B" cy={0.15} />
        <radialGradient id={u('dye')} cx="0.5" cy="0.5" r="0.5">{stops([[0, '#4E5F7C', 0.95], [0.6, '#61718D', 0.55], [1, '#61718D', 0]])}</radialGradient>
        <Lin u={u} id="gold" s={[[0, '#FFF1B0'], [0.5, '#F2C14E'], [1, '#B07A12']]} x2={1} y2={0} />
        <Ball u={u} id="phone" light="#4A4F5C" base="#15171C" dark="#050608" cx={0.3} cy={0.2} />
        <Lin u={u} id="lens" s={[[0, '#FFFFFF', 0.32], [0.45, '#FFFFFF', 0.06], [1, '#BFD8FF', 0.16]]} x2={1} y2={1} />
        <Lin u={u} id="frame" s={[[0, '#3A3A44'], [1, '#050507']]} />
      </defs>
      <Floor u={u} y={62} />
      <g className="av-bob">
        {/* tie-dye tee */}
        <path d="M6 64 Q8 50 22 47.5 Q32 46 42 47.5 Q56 50 58 64Z" fill={url(u, 'tee')} />
        <ellipse cx="18" cy="56" rx="7" ry="5" fill={url(u, 'dye')} />
        <ellipse cx="38" cy="54" rx="6" ry="4.4" fill={url(u, 'dye')} />
        <ellipse cx="50" cy="60" rx="6.5" ry="4.6" fill={url(u, 'dye')} />
        <ellipse cx="29" cy="61.5" rx="5.5" ry="3.4" fill={url(u, 'dye')} />
        <path d="M24 48 Q32 53 40 48 Q38 46 32 46 Q26 46 24 48Z" fill={url(u, 'skin')} />
        {/* thin gold chain */}
        <path d="M25 48.6 Q32 54.4 39 48.6" fill="none" stroke={url(u, 'gold')} strokeWidth={0.9} strokeLinecap="round" />
        {/* ears */}
        <ellipse cx="13.6" cy="31" rx="3.6" ry="4.6" fill={url(u, 'skin')} />
        <ellipse cx="50.4" cy="31" rx="3.6" ry="4.6" fill={url(u, 'skin')} />
        {/* big head */}
        <path d="M14 28 Q14 10 32 10 Q50 10 50 28 Q50 40 46 45 Q40 51.5 32 51.5 Q24 51.5 18 45 Q14 40 14 28Z" fill={url(u, 'skin')} />
        {/* short fade: crisp line-up on top, fading at the sides */}
        <path d="M14.6 25 Q14 9.5 32 9 Q50 9.5 49.4 25 Q48 19.5 45.5 18.2 L18.5 18.2 Q16 19.5 14.6 25Z" fill={url(u, 'hair')} />
        {/* faded sides running into the sideburns and beard */}
        <path d="M14.5 24.5 Q15.2 19.8 18.6 18.2 Q17.4 22 17.6 26 L17.4 34 Q16 33.6 15.2 33 Q14.2 28.5 14.5 24.5Z" fill={url(u, 'fade')} opacity={0.9} />
        <path d="M49.5 24.5 Q48.8 19.8 45.4 18.2 Q46.6 22 46.4 26 L46.6 34 Q48 33.6 48.8 33 Q49.8 28.5 49.5 24.5Z" fill={url(u, 'fade')} opacity={0.9} />
        {/* beard along the jaw, light moustache */}
        <path d="M15.4 33 Q16 44 22 48.5 Q27 52 32 52 Q37 52 42 48.5 Q48 44 48.6 33 Q46.5 41 41.5 43.4 Q37 41.6 32 41.8 Q27 41.6 22.5 43.4 Q17.5 41 15.4 33Z" fill={url(u, 'beard')} />
        <path d="M26.8 40.6 Q32 38.6 37.2 40.6 Q32 40.2 26.8 40.6Z" fill={url(u, 'beard')} />
        {/* nose */}
        <path d="M30.2 33.5 Q29.6 36.6 28.4 37.6 Q28.6 39.6 32 39.6 Q35.4 39.6 35.6 37.6 Q34.4 36.6 33.8 33.5Z" fill={url(u, 'nose')} />
        <ellipse cx="30" cy="38.6" rx="0.9" ry="0.5" fill="#2A140A" opacity={0.7} /><ellipse cx="34" cy="38.6" rx="0.9" ry="0.5" fill="#2A140A" opacity={0.7} />
        <ellipse cx="31.4" cy="36.4" rx="0.7" ry="1.2" fill="#fff" opacity={0.18} />
        {/* lips: a sideways smirk */}
        <path d="M27.8 43.4 Q31 42.4 36.4 42.2 Q35.2 45.8 31.6 46 Q28.6 45.8 27.8 43.4Z" fill={url(u, 'lip')} />
        <path d="M27.8 43.4 Q31.4 44.2 36.4 42.2" fill="none" stroke="#1E0C05" strokeWidth={0.9} strokeLinecap="round" />
        {/* eyes and the raised eyebrow */}
        <Eyes u={u} l={24.6} r={39.4} y={30.6} rx={2} ry={2.5} />
        <path d="M20 25.4 Q24.6 23.6 29 25" fill="none" stroke="#0E0A09" strokeWidth={2} strokeLinecap="round" />
        <g className="av-brow"><path d="M35 23.6 Q39.6 20.6 44 23" fill="none" stroke="#0E0A09" strokeWidth={2} strokeLinecap="round" /></g>
        {/* chunky black glasses with silver hinges */}
        <rect x="18" y="26" width="13" height="10" rx="2.6" fill={url(u, 'lens')} stroke={url(u, 'frame')} strokeWidth={2.3} />
        <rect x="33" y="26" width="13" height="10" rx="2.6" fill={url(u, 'lens')} stroke={url(u, 'frame')} strokeWidth={2.3} />
        <path d="M31 29.4 Q32 28.4 33 29.4" fill="none" stroke="#111" strokeWidth={1.8} />
        <path d="M18 28.6 L14.6 27.6 M46 28.6 L49.4 27.6" stroke="#111" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx="18.6" cy="27" r="0.9" fill="#E8EDF5" /><circle cx="45.4" cy="27" r="0.9" fill="#E8EDF5" />
        <path d="M20 27.6 L23.5 27.6 M35 27.6 L38.5 27.6" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.9} strokeLinecap="round" />
        <Gloss u={u} cx={26} cy={14} rx={9} ry={2.6} o={0.25} />
        {/* the mirror selfie: a hand holding a phone up */}
        <g className="av-selfie">
          <rect x="3.5" y="35" width="10" height="18" rx="2.4" fill={url(u, 'phone')} />
          <circle cx="6.6" cy="38.4" r="1.2" fill="#2B3140" stroke="#5A6275" strokeWidth={0.5} />
          <circle cx="6.6" cy="41.6" r="1.2" fill="#2B3140" stroke="#5A6275" strokeWidth={0.5} />
          <circle cx="10" cy="38.4" r="0.6" fill="#FFF7D6" className="av-pulse" />
          <path d="M4.2 45 Q2 47.5 3.4 51 Q5.5 55 11 54.4 Q15.2 54 15.4 50.4 Q15.6 47.4 13.4 46.6 L13.4 45.6 Q10.5 44.4 8 45.4Z" fill={url(u, 'skin')} />
          <path d="M12.6 47.6 Q15.4 47.2 15.6 49.4" fill="none" stroke="#3E2212" strokeOpacity={0.5} strokeWidth={0.7} strokeLinecap="round" />
        </g>
      </g>
    </>
  ),
};

/** The character for a stored avatar seed, if the seed is one. */
export function characterFor(seed: number): Character | null {
  if (seed === ADMIN_SEED) return OWNER;
  const i = seed - CHARACTER_BASE;
  return Number.isInteger(i) && i >= 0 && i < CHARACTERS.length ? CHARACTERS[i] : null;
}

export const characterSeed = (i: number) => CHARACTER_BASE + i;

/** A character in a round frame. `still` turns the animation off. */
export function CharacterAvatar({ c, size, still = false, phase = 0 }: { c: Character; size: number; still?: boolean; phase?: number }) {
  const raw = useId();
  const key = `av${raw.replace(/[^A-Za-z0-9]/g, '')}`;
  const u: U = (n) => `${key}-${n}`;
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full ${still ? '' : 'av-anim'}`} style={{ width: size, height: size, ['--av-delay' as string]: `${-phase}s` }} aria-hidden>
      <svg viewBox="0 0 64 64" width={size} height={size} role="presentation">
        <Common u={u} bg={c.bg} />
        <circle cx="32" cy="32" r="32" fill={url(u, 'bg')} />
        {c.art(u)}
      </svg>
    </span>
  );
}

/**
 * The admin's gold ring: a slowly turning band of gold with a soft glow, around any avatar.
 * Purely decorative; who gets it is decided by the caller (admins only).
 */
export function GoldRing({ size, children }: { size: number; children: ReactNode }) {
  const w = Math.max(2, Math.round(size * 0.065));
  return (
    <span className="gold-ring relative inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, padding: w }}>
      <span className="relative inline-flex overflow-hidden rounded-full" style={{ boxShadow: '0 0 0 1.5px rgb(var(--bg))' }}>{children}</span>
    </span>
  );
}

export const ringInner = (size: number) => size - 2 * Math.max(2, Math.round(size * 0.065));
