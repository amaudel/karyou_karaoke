import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Esa pista no está disponible</h1>
      <p className="text-[var(--color-tenue)]">
        Puede que el video ya no exista, que el canal haya desactivado la inserción, o que el
        enlace esté mal.
      </p>
      <Link
        href="/catalogo"
        className="inline-block rounded-lg bg-[var(--color-acento)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--color-acento-suave)]"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}
