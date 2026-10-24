import {CELEBRACION_MS, TIEMPOS_CALIFICACION} from './tiempos-celebracion.mjs';

export const CEREMONIA_PREMIUM_MS=CELEBRACION_MS;
export const CEREMONIA_PREMIUM_FPS=30;
export const CEREMONIA_PREMIUM_CUADROS=Math.round(CELEBRACION_MS*CEREMONIA_PREMIUM_FPS/1000);
export const FASES_PREMIUM=Object.freeze({
  intriga:TIEMPOS_CALIFICACION.analisis,
  metricas:TIEMPOS_CALIFICACION.analisis+TIEMPOS_CALIFICACION.subpuntajes,
  puntuacion:TIEMPOS_CALIFICACION.analisis+TIEMPOS_CALIFICACION.subpuntajes+TIEMPOS_CALIFICACION.total,
  fin:CELEBRACION_MS,
});
export function rangoPremium(total){return total>=90?'S':total>=78?'A':total>=65?'B':'C';}
export const BANDAS_PREMIUM=Object.freeze({
  under:{texto:'ÁNIMO CANTANTE',color:'#CAD1E7'},
  normal:{texto:'BUEN INTENTO',color:'#9CCDFF'},
  good:{texto:'GRAN SHOWMAN',color:'#8AF4C4'},
  excellent:{texto:'ESTRELLA DE LA NOCHE',color:'#EBC1FF'},
  exceptional:{texto:'ÍDOLO DEL KARAOKE',color:'#FFE0A1'},
});
/** Adaptación exclusiva de presentación: nunca calcula ni altera el score. */
export function datosPremium(resultado,patrocinio=null,siguienteEnCola=false){
  if(!resultado)return null;
  const banda=BANDAS_PREMIUM[resultado.tier]??BANDAS_PREMIUM.normal;
  const limitar=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(100,Math.round(Number(n)))):0;
  const total=limitar(resultado.total);
  return {
    id:resultado.id,
    cantante:String(resultado.nickname??'Cantante'),
    cancion:String(resultado.song_title??'Canción'),
    artista:String(resultado.artist??''),
    mesa:resultado.mesa?String(resultado.mesa):null,
    total,
    ritmo:limitar(resultado.rhythm),
    energia:limitar(resultado.energy),
    interpretacion:limitar(resultado.interpretation),
    rango:rangoPremium(total),
    banda:resultado.tier,
    titular:banda.texto,
    color:banda.color,
    patrocinador:patrocinio?.placement==='resultado'?{
      nombre:String(patrocinio.bar_name??''),
      titulo:String(patrocinio.title??''),
      imagen:String(patrocinio.image_url??''),
    }:null,
    siguienteEnCola:Boolean(siguienteEnCola),
  };
}