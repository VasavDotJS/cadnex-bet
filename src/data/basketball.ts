/** Basketball teams. Player weights are relative shot usage. */
import { BasketballTeam, roster } from './types';

const t = (id: string, name: string, short: string, colors: [string, string], off: number, def: number, pace: number, players: string): BasketballTeam => ({
  id, name, short, colors, offense: off, defense: def, pace, players: roster(players),
});

export const BASKETBALL_TEAMS: BasketballTeam[] = [
  // NBA
  t('okc', 'Oklahoma City Thunder', 'OKC', ['#007AC1', '#EF3B24'], 88, 92, 100, 'Shai Gilgeous-Alexander 32, Jalen Williams 20, Chet Holmgren 16, Isaiah Hartenstein 9, Luguentz Dort 8, Alex Caruso 6, Cason Wallace 7'),
  t('den', 'Denver Nuggets', 'DEN', ['#0E2240', '#FEC524'], 89, 82, 98, 'Nikola Jokić 30, Jamal Murray 22, Aaron Gordon 12, Cameron Johnson 13, Christian Braun 11, Bruce Brown 7'),
  t('bos', 'Boston Celtics', 'BOS', ['#007A33', '#BA9653'], 85, 85, 97, 'Jaylen Brown 26, Derrick White 17, Payton Pritchard 14, Anfernee Simons 15, Sam Hauser 9, Neemias Queta 8'),
  t('nyk', 'New York Knicks', 'NYK', ['#006BB6', '#F58426'], 87, 84, 97, 'Jalen Brunson 28, Karl-Anthony Towns 22, Mikal Bridges 16, OG Anunoby 15, Josh Hart 10, Mitchell Robinson 5'),
  t('cle', 'Cleveland Cavaliers', 'CLE', ['#860038', '#FDBB30'], 87, 86, 99, 'Donovan Mitchell 28, Darius Garland 19, Evan Mobley 18, Jarrett Allen 13, De\'Andre Hunter 11, Max Strus 8'),
  t('lal', 'Los Angeles Lakers', 'LAL', ['#552583', '#FDB927'], 87, 79, 100, 'Luka Dončić 32, LeBron James 24, Austin Reaves 19, Deandre Ayton 12, Rui Hachimura 11, Marcus Smart 6'),
  t('gsw', 'Golden State Warriors', 'GSW', ['#1D428A', '#FFC72C'], 84, 82, 101, 'Stephen Curry 30, Jimmy Butler 19, Jonathan Kuminga 15, Brandin Podziemski 11, Draymond Green 8, Moses Moody 9'),
  t('mil', 'Milwaukee Bucks', 'MIL', ['#00471B', '#EEE1C6'], 84, 80, 99, 'Giannis Antetokounmpo 33, Myles Turner 14, Kyle Kuzma 13, Bobby Portis 12, Ryan Rollins 11, Kevin Porter Jr. 12'),
  t('min', 'Minnesota Timberwolves', 'MIN', ['#0C2340', '#78BE20'], 85, 85, 98, 'Anthony Edwards 30, Julius Randle 20, Rudy Gobert 11, Jaden McDaniels 13, Naz Reid 13, Donte DiVincenzo 10'),
  t('dal', 'Dallas Mavericks', 'DAL', ['#00538C', '#B8C4CA'], 82, 83, 98, 'Anthony Davis 26, Kyrie Irving 24, Cooper Flagg 19, Klay Thompson 12, P.J. Washington 12, Dereck Lively II 7'),
  t('sas', 'San Antonio Spurs', 'SAS', ['#000000', '#C4CED4'], 84, 83, 100, 'Victor Wembanyama 28, De\'Aaron Fox 22, Stephon Castle 15, Dylan Harper 13, Devin Vassell 12, Keldon Johnson 10'),
  t('hou', 'Houston Rockets', 'HOU', ['#CE1141', '#000000'], 85, 87, 97, 'Kevin Durant 27, Alperen Şengün 21, Amen Thompson 16, Jabari Smith Jr. 13, Fred VanVleet 12, Tari Eason 9'),

  // EuroLeague
  t('rmb', 'Real Madrid Baloncesto', 'RMB', ['#FFFFFF', '#3E2A87'], 86, 85, 92, 'Facundo Campazzo 18, Mario Hezonja 20, Walter Tavares 14, Gabriel Deck 12, Sergio Llull 11, Andrés Feliz 13'),
  t('fen', 'Fenerbahçe Beko', 'FEN', ['#002D72', '#FFED00'], 87, 87, 91, 'Wade Baldwin IV 18, Nicolò Melli 12, Tarik Biberović 15, Talen Horton-Tucker 17, Devon Hall 12, Khem Birch 8'),
  t('pao', 'Panathinaikos', 'PAO', ['#007A33', '#FFFFFF'], 86, 86, 92, 'Kendrick Nunn 22, Kostas Sloukas 16, Mathias Lessort 14, Jerian Grant 13, Cedi Osman 14, Juancho Hernangómez 11'),
  t('oly', 'Olympiacos', 'OLY', ['#E30613', '#FFFFFF'], 87, 85, 91, 'Sasha Vezenkov 22, Evan Fournier 18, Thomas Walkup 11, Nikola Milutinov 13, Tyrique Jones 9, Kostas Papanikolaou 9'),
  t('fcb', 'FC Barcelona Basket', 'FCB', ['#A50044', '#004D98'], 84, 82, 93, 'Kevin Punter 21, Jan Veselý 15, Tomáš Satoranský 12, Dario Brizuela 13, Joel Parra 11, Willy Hernangómez 13'),
  t('efs', 'Anadolu Efes', 'EFS', ['#003B79', '#E30613'], 83, 81, 92, 'Shane Larkin 21, Elijah Bryant 15, Ercan Osmani 13, Jordan Loyd 16, Rodrigue Beaubois 11, Isaia Cordinier 12'),
  t('asmb', 'AS Monaco Basket', 'ASMB', ['#E51B22', '#FFFFFF'], 85, 82, 93, 'Mike James 25, Elie Okobo 17, Daniel Theis 11, Alpha Diallo 14, Matthew Strazel 10, Nikola Mirotić 18'),
  t('zal', 'Žalgiris Kaunas', 'ZAL', ['#006A44', '#FFFFFF'], 82, 84, 90, 'Sylvain Francisco 19, Ignas Brazdeikis 15, Laurynas Birutis 13, Deividas Sirvydis 11, Nigel Williams-Goss 14, Moses Wright 10'),
];
