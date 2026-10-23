/**
 * Football clubs. Real names and colours, no official logos (crests are generated monograms).
 * Ratings are CADNEX's own simulation figures. Rosters are easy to edit: "Name weight" pairs,
 * where weight is the player's relative chance of scoring a given goal.
 */
import { FootballTeam, roster } from './types';

type R = [attack: number, defence: number, midfield: number, home: number];
const t = (id: string, name: string, short: string, colors: [string, string], r: R, gk: string, players: string): FootballTeam => ({
  id, name, short, colors, attack: r[0], defence: r[1], midfield: r[2], home: r[3], gk, players: roster(players),
});

export const FOOTBALL_TEAMS: FootballTeam[] = [
  // Premier League
  t('ars', 'Arsenal', 'ARS', ['#EF0107', '#FFFFFF'], [86, 90, 87, 0.6], 'Raya', 'Gyökeres 10, Saka 8, Havertz 6, Martinelli 6, Trossard 5, Ødegaard 4, Eze 5, Rice 3, Gabriel 2'),
  t('mci', 'Manchester City', 'MCI', ['#6CABDD', '#1C2C5B'], [88, 84, 86, 0.6], 'Donnarumma', 'Haaland 14, Marmoush 6, Foden 6, Doku 4, Cherki 4, Reijnders 3, Bernardo Silva 3, Gvardiol 1'),
  t('liv', 'Liverpool', 'LIV', ['#C8102E', '#F6EB61'], [89, 83, 86, 0.65], 'Alisson', 'Salah 11, Isak 9, Ekitiké 7, Wirtz 5, Gakpo 6, Szoboszlai 4, Mac Allister 3, Van Dijk 2'),
  t('che', 'Chelsea', 'CHE', ['#034694', '#DBA111'], [84, 80, 83, 0.55], 'Sánchez', 'Palmer 10, João Pedro 8, Delap 6, Neto 5, Estêvão 5, Enzo Fernández 4, Garnacho 4, Caicedo 2'),
  t('mun', 'Manchester United', 'MUN', ['#DA291C', '#FBE122'], [79, 75, 77, 0.55], 'Lammens', 'Šeško 8, Mbeumo 8, Cunha 7, Bruno Fernandes 7, Amad 4, Mount 3, Dorgu 2'),
  t('tot', 'Tottenham Hotspur', 'TOT', ['#132257', '#FFFFFF'], [78, 74, 76, 0.5], 'Vicario', 'Solanke 8, Richarlison 7, Johnson 6, Kudus 6, Simons 5, Odobert 3, Maddison 4'),
  t('new', 'Newcastle United', 'NEW', ['#241F20', '#FFFFFF'], [79, 79, 80, 0.65], 'Pope', 'Woltemade 8, Gordon 8, Wissa 6, Barnes 5, Elanga 4, Bruno Guimarães 4, Joelinton 3'),
  t('avl', 'Aston Villa', 'AVL', ['#670E36', '#95BFE5'], [79, 77, 79, 0.6], 'Martínez', 'Watkins 10, Rogers 6, McGinn 5, Tielemans 4, Buendía 4, Bailey 4, Kamara 1'),
  t('bha', 'Brighton & Hove Albion', 'BHA', ['#0057B8', '#FFFFFF'], [77, 74, 77, 0.55], 'Verbruggen', 'Welbeck 8, Mitoma 6, Minteh 6, Rutter 5, Ayari 4, Baleba 2, Gruda 4'),
  t('cry', 'Crystal Palace', 'CRY', ['#1B458F', '#C4122E'], [75, 77, 74, 0.55], 'Henderson', 'Mateta 10, Sarr 7, Wharton 3, Muñoz 3, Pino 4, Nketiah 5'),
  t('nfo', 'Nottingham Forest', 'NFO', ['#DD0000', '#FFFFFF'], [75, 76, 74, 0.6], 'Sels', 'Wood 10, Gibbs-White 6, Hudson-Odoi 5, Ndoye 5, Igor Jesus 6, Anderson 3'),
  t('whu', 'West Ham United', 'WHU', ['#7A263A', '#1BB1E7'], [73, 70, 72, 0.55], 'Areola', 'Bowen 9, Füllkrug 7, Paquetá 5, Summerville 5, Wilson 6, Soucek 3'),

  // La Liga
  t('rma', 'Real Madrid', 'RMA', ['#FFFFFF', '#FEBE10'], [92, 84, 88, 0.65], 'Courtois', 'Mbappé 15, Vinícius Júnior 9, Bellingham 6, Rodrygo 5, Güler 4, Mastantuono 3, Valverde 3'),
  t('bar', 'FC Barcelona', 'BAR', ['#A50044', '#004D98'], [92, 80, 89, 0.65], 'Joan García', 'Lewandowski 11, Raphinha 9, Yamal 9, Ferran Torres 6, Olmo 4, Rashford 5, Pedri 3, Fermín López 4'),
  t('atm', 'Atlético Madrid', 'ATM', ['#CB3524', '#272E61'], [84, 85, 83, 0.65], 'Oblak', 'Julián Álvarez 11, Sørloth 9, Griezmann 7, Baena 4, Giuliano Simeone 4, Koke 1'),
  t('ath', 'Athletic Club', 'ATH', ['#EE2523', '#FFFFFF'], [78, 79, 77, 0.7], 'Unai Simón', 'Guruzeta 8, Nico Williams 7, Iñaki Williams 7, Sancet 6, Berenguer 4'),
  t('rso', 'Real Sociedad', 'RSO', ['#0067B1', '#FFFFFF'], [75, 76, 76, 0.6], 'Remiro', 'Oyarzabal 10, Kubo 6, Barrenetxea 5, Brais Méndez 4, Sučić 3'),
  t('vil', 'Villarreal', 'VIL', ['#FFE667', '#005187'], [80, 75, 77, 0.6], 'Luiz Júnior', 'Gerard Moreno 8, Mikautadze 8, Moleiro 6, Pépé 6, Parejo 3, Buchanan 4'),
  t('bet', 'Real Betis', 'BET', ['#00954C', '#FFFFFF'], [77, 74, 76, 0.65], 'Pau López', 'Bakambu 8, Antony 7, Isco 6, Abde 6, Lo Celso 5, Cucho Hernández 6'),
  t('sev', 'Sevilla', 'SEV', ['#F43333', '#FFFFFF'], [72, 72, 72, 0.6], 'Vlachodimos', 'Isaac Romero 8, Akor Adams 8, Alexis Sánchez 6, Vargas 5, Agoumé 2'),

  // Serie A
  t('int', 'Inter', 'INT', ['#0068A8', '#000000'], [86, 85, 86, 0.6], 'Sommer', 'Lautaro Martínez 12, Thuram 9, Bonny 6, Çalhanoğlu 5, Dimarco 4, Barella 4, Pio Esposito 5'),
  t('nap', 'Napoli', 'NAP', ['#12A0D7', '#FFFFFF'], [83, 84, 84, 0.65], 'Meret', 'Højlund 10, Lukaku 8, McTominay 7, De Bruyne 6, Politano 4, Neres 5, Anguissa 3'),
  t('juv', 'Juventus', 'JUV', ['#000000', '#FFFFFF'], [81, 83, 80, 0.6], 'Di Gregorio', 'Vlahović 10, David 9, Yıldız 8, Openda 7, Conceição 5, Koopmeiners 4'),
  t('mil', 'AC Milan', 'MIL', ['#FB090B', '#000000'], [82, 80, 81, 0.6], 'Maignan', 'Leão 9, Pulisic 9, Nkunku 7, Gimenez 7, Modrić 3, Loftus-Cheek 4, Rabiot 4'),
  t('ata', 'Atalanta', 'ATA', ['#1E71B8', '#000000'], [81, 77, 79, 0.6], 'Carnesecchi', 'Scamacca 9, Krstović 8, De Ketelaere 7, Lookman 7, Pašalić 4, Samardžić 4'),
  t('rom', 'AS Roma', 'ROM', ['#8E1F2F', '#F0BC42'], [77, 80, 77, 0.6], 'Svilar', 'Dovbyk 9, Soulé 7, Ferguson 7, Dybala 7, Pellegrini 5, Cristante 2'),
  t('laz', 'Lazio', 'LAZ', ['#87D8F7', '#FFFFFF'], [76, 75, 76, 0.6], 'Provedel', 'Castellanos 10, Zaccagni 6, Isaksen 5, Pedro 5, Guendouzi 3, Dia 6'),
  t('fio', 'Fiorentina', 'FIO', ['#482E92', '#FFFFFF'], [76, 74, 75, 0.6], 'De Gea', 'Kean 11, Gudmundsson 7, Džeko 7, Fagioli 3, Mandragora 3'),

  // Bundesliga
  t('bay', 'Bayern München', 'BAY', ['#DC052D', '#0066B2'], [93, 82, 88, 0.7], 'Neuer', 'Kane 15, Olise 8, Díaz 8, Musiala 7, Gnabry 6, Jackson 6, Kimmich 2'),
  t('bvb', 'Borussia Dortmund', 'BVB', ['#FDE100', '#000000'], [83, 78, 80, 0.75], 'Kobel', 'Guirassy 13, Adeyemi 7, Beier 7, Brandt 5, Svensson 3, J. Bellingham 4'),
  t('b04', 'Bayer Leverkusen', 'B04', ['#E32221', '#000000'], [81, 78, 80, 0.6], 'Flekken', 'Schick 11, Tillman 6, Hofmann 5, Grimaldo 5, Poku 5, Kofane 5'),
  t('rbl', 'RB Leipzig', 'RBL', ['#DD0741', '#001F47'], [79, 76, 78, 0.6], 'Gulácsi', 'Diomande 7, Rômulo 8, Baumgartner 6, Nusa 6, Raum 3, Bakayoko 6'),
  t('vfb', 'VfB Stuttgart', 'VFB', ['#E32219', '#FFFFFF'], [79, 75, 77, 0.6], 'Nübel', 'Demirović 10, Undav 9, Führich 5, El Khannouss 5, Stiller 2'),
  t('sge', 'Eintracht Frankfurt', 'SGE', ['#E1000F', '#000000'], [79, 73, 76, 0.65], 'Santos', 'Burkardt 10, Doan 6, Knauff 6, Larsson 4, Götze 4, Bahoya 5'),
  t('wob', 'VfL Wolfsburg', 'WOB', ['#65B32E', '#FFFFFF'], [72, 70, 72, 0.55], 'Grabara', 'Amoura 10, Wind 8, Majer 5, Wimmer 4, Paredes 3'),
  t('scf', 'SC Freiburg', 'SCF', ['#000000', '#E30613'], [72, 74, 73, 0.6], 'Atubolu', 'Höler 8, Grifo 7, Manzambi 5, Eggestein 4, Adamu 6'),

  // Ligue 1
  t('psg', 'Paris Saint-Germain', 'PSG', ['#004170', '#DA291C'], [91, 84, 90, 0.65], 'Chevalier', 'Dembélé 12, Kvaratskhelia 9, Doué 8, Barcola 7, Gonçalo Ramos 8, Vitinha 4, Hakimi 3'),
  t('om', 'Olympique de Marseille', 'OM', ['#2FAEE0', '#FFFFFF'], [81, 75, 78, 0.7], 'Rulli', 'Greenwood 11, Aubameyang 9, Gouiri 6, Paixão 5, Højbjerg 3, Weah 4'),
  t('asm', 'AS Monaco', 'ASM', ['#E51B22', '#FFFFFF'], [79, 74, 77, 0.6], 'Hradecky', 'Biereth 9, Balogun 9, Akliouche 6, Golovin 5, Minamino 6, Pogba 3'),
  t('losc', 'LOSC Lille', 'LIL', ['#E01E13', '#20325F'], [77, 76, 76, 0.6], 'Özer', 'Giroud 9, Haraldsson 7, Igamane 7, André 3, Fernandez-Pardo 5'),
  t('ol', 'Olympique Lyonnais', 'OL', ['#1C3B85', '#DA0812'], [76, 74, 75, 0.6], 'Greif', 'Šulc 7, Moreira 6, Fofana 7, Tolisso 5, Satriano 7'),
  t('rcl', 'RC Lens', 'RCL', ['#FFDD00', '#E1000F'], [74, 75, 74, 0.7], 'Risser', 'Édouard 8, Saïd 7, Thauvin 7, Sotoca 5, Thomasson 3'),

  // Indian Super League
  t('mbsg', 'Mohun Bagan Super Giant', 'MBSG', ['#00703C', '#8B1A2B'], [72, 71, 70, 0.7], 'Vishal Kaith', 'Jason Cummings 10, Jamie Maclaren 10, Liston Colaço 7, Manvir Singh 6, Sahal Abdul Samad 4, Greg Stewart 5'),
  t('ebfc', 'East Bengal', 'EBFC', ['#E32028', '#F2C230'], [67, 64, 66, 0.7], 'Prabhsukhan Gill', 'Hijazi Maher 3, Dimitrios Diamantakos 10, Naorem Mahesh 6, Saúl Crespo 4, P.V. Vishnu 5, David Lalhlansanga 6'),
  t('mcfc', 'Mumbai City', 'MCFC', ['#5BC2E7', '#F6A800'], [69, 68, 69, 0.65], 'Phurba Lachenpa', 'Nikolaos Karelis 9, Lallianzuala Chhangte 8, Bipin Singh 6, Apuia 3, Jon Toral 5'),
  t('kbfc', 'Kerala Blasters', 'KBFC', ['#FFD700', '#0057B8'], [68, 64, 67, 0.75], 'Sachin Suresh', 'Jesús Jiménez 10, Noah Sadaoui 9, Adrian Luna 6, Korou Singh 4, Rahul KP 4'),
  t('bfc', 'Bengaluru FC', 'BFC', ['#0B3D91', '#FFFFFF'], [69, 68, 68, 0.65], 'Gurpreet Singh Sandhu', 'Sunil Chhetri 10, Edgar Méndez 8, Ryan Williams 6, Alberto Noguera 4, Suresh Wangjam 2'),
  t('fcg', 'FC Goa', 'FCG', ['#F57C00', '#1A237E'], [70, 68, 69, 0.65], 'Hrithik Tiwari', 'Armando Sadiku 10, Borja Herrera 6, Brison Fernandes 7, Udanta Singh 4, Iker Guarrotxena 7'),
  t('ofc', 'Odisha FC', 'OFC', ['#5B2C83', '#F2C230'], [66, 63, 65, 0.6], 'Amrinder Singh', 'Diego Maurício 11, Jerry Mawihmingthanga 6, Ahmed Jahouh 3, Isak Vanlalruatfela 5'),
  t('neufc', 'NorthEast United', 'NEU', ['#E2231A', '#000000'], [69, 64, 66, 0.7], 'Gurmeet Singh', 'Alaeddine Ajaraie 12, Guillermo Fernández 6, Parthib Gogoi 6, Jithin MS 5, Néstor Albiach 6'),
];
