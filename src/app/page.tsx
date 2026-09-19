import Link from "next/link";

const etapas = [
  ["01", "Clientes e projetos", "Organize cada levantamento e suas informações."],
  ["02", "Imagens e processamento", "Reúna as fotos do voo e acompanhe a geração dos resultados."],
  ["03", "Mapas e relatórios", "Visualize ortomosaicos, faça medições e apresente suas entregas."],
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-12 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-900/15 pb-7">
        <span className="text-xl font-bold tracking-tight">ORION <span className="font-normal">MAPS</span></span>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-900 sm:inline">Projeto em desenvolvimento</span>
          <Link href="/entrar" className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900">Entrar</Link>
        </div>
      </header>
      <section className="max-w-3xl py-16 sm:py-24">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Do voo à informação</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Um novo ponto de vista para seus projetos.</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">Seu espaço para organizar levantamentos com drone e transformar imagens em mapas, medições e relatórios.</p>
      </section>
      <section aria-labelledby="etapas" className="border-t border-emerald-900/15 pt-8">
        <h2 id="etapas" className="mb-7 text-sm font-semibold">O que estamos construindo</h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {etapas.map(([numero, titulo, descricao]) => (
            <li key={numero} className="rounded-2xl border border-emerald-900/10 bg-white p-7">
              <span className="text-sm font-semibold text-emerald-700">{numero}</span>
              <h3 className="mt-6 text-lg font-semibold">{titulo}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{descricao}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm leading-6 text-slate-500">Esta é a primeira etapa do Orion Maps. Os recursos acima ainda serão implementados; nenhum arquivo é enviado ou processado nesta versão.</p>
      </section>
    </main>
  );
}
