/** Esports organisations and their well-known players. */
import { EsportsGame, EsportsTeam, roster } from './types';

const t = (id: string, game: EsportsGame, name: string, short: string, region: string, colors: [string, string], rating: number, players: string): EsportsTeam => ({
  id, game, name, short, region, colors, rating, players: roster(players),
});

export const ESPORTS_TEAMS: EsportsTeam[] = [
  // CS2
  t('cs-vit', 'cs2', 'Team Vitality', 'VIT', 'EU', ['#F5E61E', '#000000'], 92, 'ZywOo 10, ropz 7, flameZ 6, mezii 5, apEX 4'),
  t('cs-spi', 'cs2', 'Team Spirit', 'SPR', 'EU', ['#C9C9C9', '#111111'], 87, 'donk 10, sh1ro 7, zont1x 5, magixx 4, tN1R 5'),
  t('cs-mouz', 'cs2', 'MOUZ', 'MOUZ', 'EU', ['#E5002B', '#FFFFFF'], 87, 'torzsi 8, Spinx 7, xertioN 6, Jimpphat 6, Brollan 5'),
  t('cs-faze', 'cs2', 'FaZe Clan', 'FAZE', 'EU', ['#E43D30', '#000000'], 84, 'frozen 8, broky 7, Twistzz 6, jcobbb 5, karrigan 3'),
  t('cs-navi', 'cs2', 'Natus Vincere', 'NAVI', 'EU', ['#FFEE00', '#000000'], 86, 'w0nderful 8, iM 7, b1t 6, jL 6, Aleksib 3'),
  t('cs-fal', 'cs2', 'Team Falcons', 'FLC', 'EU', ['#00A85A', '#FFFFFF'], 88, 'm0NESY 9, NiKo 8, kyxsan 4, TeSeS 5, kyousuke 6'),
  t('cs-mgz', 'cs2', 'The MongolZ', 'MGZ', 'AS', ['#D52B1E', '#FFD900'], 86, 'Techno4K 7, 910 8, mzinho 6, bLitz 4, Senzu 6'),
  t('cs-g2', 'cs2', 'G2 Esports', 'G2', 'EU', ['#F00F17', '#000000'], 83, 'huNter- 7, malbsMd 7, HeavyGod 6, SunPayus 6, MATYS 5'),

  // League of Legends
  t('lol-t1', 'lol', 'T1', 'T1', 'KR', ['#E2012D', '#000000'], 92, 'Faker 9, Oner 7, Keria 7, Doran 6, Gumayusi 8'),
  t('lol-gen', 'lol', 'Gen.G', 'GEN', 'KR', ['#AA8B56', '#000000'], 93, 'Chovy 9, Canyon 8, Kiin 7, Ruler 8, Duro 5'),
  t('lol-hle', 'lol', 'Hanwha Life Esports', 'HLE', 'KR', ['#F37321', '#000000'], 90, 'Zeka 8, Peanut 7, Zeus 8, Viper 9, Delight 6'),
  t('lol-blg', 'lol', 'Bilibili Gaming', 'BLG', 'CN', ['#00A1D6', '#FFFFFF'], 90, 'knight 9, Bin 8, Beichuan 6, Elk 8, ON 6'),
  t('lol-al', 'lol', 'Anyone\'s Legend', 'AL', 'CN', ['#A40E26', '#FFFFFF'], 88, 'Shanks 8, Tarzan 7, Flandre 6, Hope 8, Kael 5'),
  t('lol-g2', 'lol', 'G2 Esports', 'G2', 'EU', ['#F00F17', '#000000'], 85, 'Caps 9, SkewMond 6, BrokenBlade 7, Hans Sama 7, Labrov 5'),
  t('lol-fnc', 'lol', 'Fnatic', 'FNC', 'EU', ['#FF5900', '#000000'], 80, 'Humanoid 7, Razork 6, Oscarinin 6, Upset 7, Mikyx 5'),
  t('lol-fly', 'lol', 'FlyQuest', 'FLY', 'NA', ['#00A859', '#000000'], 82, 'Quad 7, Inspired 7, Bwipo 6, Massu 7, Busio 5'),

  // Valorant
  t('val-fnc', 'valorant', 'Fnatic', 'FNC', 'EMEA', ['#FF5900', '#000000'], 90, 'Chronicle 8, Alfajer 8, kaajak 7, crashies 5, Boaster 4'),
  t('val-th', 'valorant', 'Team Heretics', 'TH', 'EMEA', ['#E9C46A', '#000000'], 88, 'MiniBoo 8, Boo 6, RieNs 6, benjyfishy 6, Wo0t 7'),
  t('val-prx', 'valorant', 'Paper Rex', 'PRX', 'Pacific', ['#B5179E', '#FFFFFF'], 87, 'f0rsakeN 7, something 9, Jinggg 7, d4v41 6, mindfreak 4'),
  t('val-sen', 'valorant', 'Sentinels', 'SEN', 'Americas', ['#CE0037', '#FFFFFF'], 85, 'zekken 8, N4RRATE 7, johnqt 5, Kyu 6, bang 5'),
  t('val-g2', 'valorant', 'G2 Esports', 'G2', 'Americas', ['#F00F17', '#000000'], 88, 'leaf 8, trent 6, valyn 6, jawgemo 7, JonahP 6'),
  t('val-nrg', 'valorant', 'NRG', 'NRG', 'Americas', ['#000000', '#FFB000'], 87, 'brawk 7, mada 8, Ethan 5, s0m 6, skuba 6'),
  t('val-edg', 'valorant', 'EDward Gaming', 'EDG', 'China', ['#000000', '#E10600'], 86, 'ZmjjKK 9, nobody 6, CHICHOO 6, Smoggy 6, Jieni7 5'),
  t('val-drx', 'valorant', 'DRX', 'DRX', 'Pacific', ['#5A8DEE', '#000000'], 84, 'MaKo 6, BeYN 7, free1ng 7, Flashback 6, HYUNMIN 6'),
];

export const MAPS: Record<'cs2' | 'valorant', string[]> = {
  cs2: ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Train'],
  valorant: ['Ascent', 'Bind', 'Haven', 'Lotus', 'Sunset', 'Split', 'Icebox', 'Corrode'],
};
