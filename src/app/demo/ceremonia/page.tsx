import {notFound} from 'next/navigation';
import DemoClient from './DemoClient';

/** Esta demostración no está disponible en producción. */
export default function DemoCeremoniaPage(){
  if(process.env.VERCEL_ENV==='production')notFound();
  return <DemoClient/>;
}