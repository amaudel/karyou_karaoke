/**
 * Clasificación por género.
 *
 * Existe porque buscar «vallenato» solo encontraba 11 de las 1.161 pistas de
 * vallenato: la búsqueda compara texto contra artista + título, y el género no
 * está en ninguna de esas dos cosas. Aquí se deduce el género para poder buscar
 * por él.
 *
 * Tres señales, en orden de fiabilidad:
 *
 *   1. CANAL. Un canal dedicado a un género es la señal más limpia: todo lo que
 *      publica "Karaoke Vallenato" es vallenato. Cubre miles de pistas de golpe y
 *      sin posibilidad de error.
 *   2. ARTISTA. Para los canales mixtos (Party Tyme publica de todo) el nombre del
 *      artista es lo que mejor discrimina.
 *   3. TÍTULO. Último recurso, para cuando el artista no se pudo separar del título
 *      y quedó vacío. Aquí solo valen palabras de género explícitas.
 *
 * Es deliberadamente conservador: si no hay señal, devuelve `null` en vez de
 * inventar. Un género equivocado es peor que ninguno, porque hace que la búsqueda
 * mienta. Las listas se amplían sin tocar el resto del código.
 *
 * Es lógica pura: ni base de datos, ni red, ni azar. Se puede probar en milisegundos.
 */
import { normalize } from '../lib/normalize.mjs';

/** Canal → género. La señal más fiable que tenemos. */
const POR_CANAL = [
  { canal: 'karaoke vallenato', genero: 'vallenato' },
  { canal: 'humbert mendoza', genero: 'ecuatoriana' },
  { canal: 'fredy troya', genero: 'ecuatoriana' },
  { canal: 'alejandro riofrio', genero: 'ecuatoriana' },
];

/**
 * Artista → género. Las agujas se comparan contra el nombre YA normalizado, así que
 * se escriben sin acentos ni mayúsculas.
 */
const POR_ARTISTA = [
  {
    genero: 'ecuatoriana',
    agujas: [
      'julio jaramillo', 'segundo rosero', 'gerardo moran', 'widinson', 'tierra canela',
      'cholo berrocal', 'jaime enrique aymara', 'angel guaraca', 'claudio vallejo',
      'carlota jaramillo', 'hermanos mino naranjo', 'hector jaramillo', 'au d',
      'verde 70', 'tercer mundo', 'juan fernando velasco', 'pamela cortes', 'mirella cessa',
      'sahiro', 'trio colonial', 'benitez y valencia', 'hermanas mendoza', 'paulina tamayo',
      'maximo escaleras', 'byron caicedo', 'don medardo', 'medardo y sus players',
      'cecilio alba', 'orquesta sentimiento', 'sensacion rumbera', 'bajo suenos',
      'cruks en karnak', 'caña fistula', 'aladino', 'roberto zumba', 'koral y esmeralda',
      'las lasser', 'azucena aymara', 'grupomar', 'ecuatorian',
    ],
  },
  {
    genero: 'vallenato',
    agujas: [
      'diomedes', 'silvestre dangond', 'binomio de oro', 'rafael orozco', 'jorge celedon',
      'ivan villazon', 'peter manjarres', 'felipe pelaez', 'hermanos zuleta', 'poncho zuleta',
      'emiliano zuleta', 'patricia teheran', 'los diablitos', 'martin elias', 'elder dayan',
      'jean carlos centeno', 'kaleth morales', 'los betos', 'luifer cuello', 'miguel morales',
      'jorge onate', 'los inquietos', 'los chiches', 'silvio brito', 'otto serge', 'binar',
      'alejandro palacio', 'churo diaz', 'gigantes del vallenato', 'embajadores vallenatos',
      'los pechichones', 'vallenato',
    ],
  },
  {
    genero: 'bachata',
    agujas: [
      'romeo santos', 'aventura', 'prince royce', 'zacarias ferreira', 'antony santos',
      'frank reyes', 'monchy', 'raulin rodriguez', 'hector acosta', 'toby love',
      'yoskar sarante', 'luis vargas', 'domenic marte', 'el chaval', 'joe veras',
      'alex bueno', 'juan luis guerra', 'luis segura', 'fernando villalona', 'bachata',
    ],
  },
  {
    genero: 'salsa',
    agujas: [
      'marc anthony', 'victor manuelle', 'gilberto santa rosa', 'adolescent', 'frankie ruiz',
      'ruben blades', 'willie colon', 'hector lavoe', 'tito nieves', 'jerry rivera',
      'eddie santiago', 'la india', 'rey ruiz', 'grupo niche', 'guayacan', 'sonora carruseles',
      'oscar d', 'salsa',
    ],
  },
  {
    genero: 'cumbia',
    agujas: [
      'sonora dinamita', 'sonora santanera', 'los angeles de charly', 'grupo bryndis',
      'los acosta', 'grupo mojado', 'chicos de barrio', 'super lamas', 'grupo karos',
      'los felinos', 'la sonora', 'cumbia', 'cumbiambera',
    ],
  },
  {
    genero: 'ranchera',
    agujas: [
      'vicente fernandez', 'joan sebastian', 'alejandro fernandez', 'banda el recodo',
      'javier solis', 'juan gabriel', 'jenni rivera', 'valentin elizalde', 'chalino sanchez',
      'antonio aguilar', 'lola beltran', 'pedro infante', 'jorge negrete', 'ramon ayala',
      'los tigres del norte', 'los invasores', 'los huracanes del norte', 'los cadetes',
      'pancho barraza', 'la arrolladora', 'los recoditos', 'calibre 50', 'julion alvarez',
      'grupo firme', 'carin leon', 'christian nodal', 'peso pluma', 'natanael cano',
      'banda ms', 'el chapo de sinaloa', 'larry hernandez', 'ranchera', 'banda',
    ],
  },
  {
    genero: 'urbano',
    agujas: [
      'bad bunny', 'j balvin', 'maluma', 'karol g', 'daddy yankee', 'rauw alejandro',
      'ozuna', 'anuel', 'feid', 'nicky jam', 'wisin', 'yandel', 'don omar',
      'tito el bambino', 'arcangel', 'de la ghetto', 'plan b', 'sech', 'jhay cortez',
      'myke towers', 'lunay', 'becky g', 'natti natasha', 'regueton',
    ],
  },
  {
    genero: 'rock',
    agujas: [
      'soda stereo', 'caifanes', 'heroes del silencio', 'hombres g', 'mana',
      'los prisioneros', 'enanitos verdes', 'fabulosos cadillacs', 'el tri', 'jaguares',
      'cafe tacuba', 'molotov', 'la ley', 'los tres', 'panda', 'inspector',
      'el canto del loco', 'hermetica', 'rata blanca', 'extremoduro', 'rock',
    ],
  },
  {
    genero: 'balada',
    agujas: [
      'luis miguel', 'jose jose', 'camilo', 'sebastian yatra', 'morat', 'reik',
      'jesse & joy', 'sin bandera', 'marco antonio solis', 'rocio durcal', 'ana gabriel',
      'daniela romo', 'los bukis', 'los temerarios', 'jose luis perales', 'julio iglesias',
      'ricardo arjona', 'franco de vita', 'ricardo montaner', 'chayanne', 'enrique iglesias',
      'alejandro sanz', 'la oreja de van gogh', 'miguel bose', 'balada',
    ],
  },
];

/** Palabras de género en el título. Solo explícitas: nada de adivinar. */
const POR_TITULO = [
  {
    genero: 'ecuatoriana',
    agujas: [
      'pasillo', 'sanjuanito', 'albazo', 'yaravi', 'tonada', 'rockolero', 'rocolero',
      'ecuatoriano', 'ecuatoriana', 'chulla quiteno', 'guayaquil de mis amores',
      'el aguacate',
    ],
  },
  { genero: 'vallenato', agujas: ['vallenato', 'vallenata'] },
  { genero: 'bachata', agujas: ['bachata'] },
  { genero: 'salsa', agujas: ['salsa'] },
  { genero: 'cumbia', agujas: ['cumbia', 'cumbiamba'] },
  { genero: 'ranchera', agujas: ['ranchera', 'corrido', 'norteno', 'banda'] },
  { genero: 'rock', agujas: ['rock'] },
  { genero: 'balada', agujas: ['balada'] },
];

/**
 * Deduce el género de una pista.
 *
 * @param {{ canal?: string|null, artista?: string|null, titulo?: string|null }} pista
 * @returns {string|null} el género, o null si no hay señal suficiente
 */
export function clasificarGenero({ canal, artista, titulo }) {
  const c = normalize(canal);
  const a = normalize(artista);
  const t = normalize(titulo);

  for (const regla of POR_CANAL) {
    if (c.includes(regla.canal)) return regla.genero;
  }

  for (const regla of POR_ARTISTA) {
    if (regla.agujas.some((aguja) => a.includes(aguja))) return regla.genero;
  }

  for (const regla of POR_TITULO) {
    if (regla.agujas.some((aguja) => t.includes(aguja))) return regla.genero;
  }

  return null;
}

/** Los géneros que este clasificador sabe reconocer. */
export const GENEROS = POR_ARTISTA.map((r) => r.genero);
