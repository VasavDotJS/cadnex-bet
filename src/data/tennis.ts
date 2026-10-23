/** Tour-level tennis players. Serve/return figures feed the point-by-point Markov model. */
import { TennisPlayer } from './types';

const p = (id: string, tour: 'ATP' | 'WTA', name: string, short: string, country: string, colors: [string, string], serve: number, ret: number): TennisPlayer => ({
  id, tour, name, short, country, colors, serve, ret,
});

export const TENNIS_PLAYERS: TennisPlayer[] = [
  p('sinner', 'ATP', 'Jannik Sinner', 'Sinner', 'ITA', ['#0B6E4F', '#FFFFFF'], 93, 92),
  p('alcaraz', 'ATP', 'Carlos Alcaraz', 'Alcaraz', 'ESP', ['#C60B1E', '#FFC400'], 91, 93),
  p('zverev', 'ATP', 'Alexander Zverev', 'Zverev', 'GER', ['#1B1B1B', '#FFCE00'], 90, 84),
  p('djokovic', 'ATP', 'Novak Djokovic', 'Djokovic', 'SRB', ['#C6363C', '#0C4076'], 89, 90),
  p('fritz', 'ATP', 'Taylor Fritz', 'Fritz', 'USA', ['#3C3B6E', '#B22234'], 91, 80),
  p('draper', 'ATP', 'Jack Draper', 'Draper', 'GBR', ['#012169', '#C8102E'], 88, 82),
  p('deminaur', 'ATP', 'Alex de Minaur', 'de Minaur', 'AUS', ['#00843D', '#FFCD00'], 82, 88),
  p('shelton', 'ATP', 'Ben Shelton', 'Shelton', 'USA', ['#B22234', '#3C3B6E'], 92, 78),
  p('medvedev', 'ATP', 'Daniil Medvedev', 'Medvedev', 'RUS', ['#4A4A4A', '#D52B1E'], 86, 86),
  p('musetti', 'ATP', 'Lorenzo Musetti', 'Musetti', 'ITA', ['#009246', '#CE2B37'], 84, 85),
  p('mensik', 'ATP', 'Jakub Menšík', 'Menšík', 'CZE', ['#11457E', '#D7141A'], 89, 79),
  p('rune', 'ATP', 'Holger Rune', 'Rune', 'DEN', ['#C8102E', '#FFFFFF'], 86, 83),
  p('ruud', 'ATP', 'Casper Ruud', 'Ruud', 'NOR', ['#BA0C2F', '#00205B'], 84, 84),
  p('fonseca', 'ATP', 'João Fonseca', 'Fonseca', 'BRA', ['#009C3B', '#FFDF00'], 86, 81),
  p('tsitsipas', 'ATP', 'Stefanos Tsitsipas', 'Tsitsipas', 'GRE', ['#0D5EAF', '#FFFFFF'], 87, 79),
  p('paul', 'ATP', 'Tommy Paul', 'Paul', 'USA', ['#0A3161', '#B31942'], 84, 83),

  p('sabalenka', 'WTA', 'Aryna Sabalenka', 'Sabalenka', 'BLR', ['#C8313E', '#4AA657'], 93, 88),
  p('swiatek', 'WTA', 'Iga Świątek', 'Świątek', 'POL', ['#DC143C', '#FFFFFF'], 86, 93),
  p('gauff', 'WTA', 'Coco Gauff', 'Gauff', 'USA', ['#3C3B6E', '#B22234'], 85, 89),
  p('anisimova', 'WTA', 'Amanda Anisimova', 'Anisimova', 'USA', ['#B22234', '#3C3B6E'], 87, 86),
  p('rybakina', 'WTA', 'Elena Rybakina', 'Rybakina', 'KAZ', ['#00AFCA', '#FEC50C'], 92, 82),
  p('pegula', 'WTA', 'Jessica Pegula', 'Pegula', 'USA', ['#0A3161', '#B31942'], 84, 87),
  p('andreeva', 'WTA', 'Mirra Andreeva', 'Andreeva', 'RUS', ['#4A4A4A', '#0039A6'], 85, 87),
  p('paolini', 'WTA', 'Jasmine Paolini', 'Paolini', 'ITA', ['#009246', '#CE2B37'], 80, 86),
  p('keys', 'WTA', 'Madison Keys', 'Keys', 'USA', ['#B22234', '#FFFFFF'], 89, 80),
  p('zheng', 'WTA', 'Zheng Qinwen', 'Zheng', 'CHN', ['#DE2910', '#FFDE00'], 88, 81),
  p('navarro', 'WTA', 'Emma Navarro', 'Navarro', 'USA', ['#3C3B6E', '#FFFFFF'], 81, 85),
  p('mboko', 'WTA', 'Victoria Mboko', 'Mboko', 'CAN', ['#D80621', '#FFFFFF'], 86, 82),
  p('svitolina', 'WTA', 'Elina Svitolina', 'Svitolina', 'UKR', ['#0057B7', '#FFD700'], 80, 86),
  p('osaka', 'WTA', 'Naomi Osaka', 'Osaka', 'JPN', ['#BC002D', '#FFFFFF'], 89, 80),
  p('muchova', 'WTA', 'Karolína Muchová', 'Muchová', 'CZE', ['#11457E', '#D7141A'], 84, 84),
  p('alexandrova', 'WTA', 'Ekaterina Alexandrova', 'Alexandrova', 'RUS', ['#4A4A4A', '#D52B1E'], 86, 79),
];
