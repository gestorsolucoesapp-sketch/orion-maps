export default function Loading(){
  return <main className="min-h-screen bg-[#edf3ea] px-4 py-6 sm:px-7">
    <div className="mx-auto max-w-[1460px] animate-pulse">
      <div className="h-28 rounded-[28px] bg-[#0b2528]"/>
      <div className="mx-3 -mt-4 h-16 rounded-2xl bg-white shadow-sm sm:mx-6"/>
      <div className="mt-8 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="h-14 rounded-2xl bg-white/80"/>
          <div className="h-36 rounded-2xl bg-white"/>
          <div className="h-36 rounded-2xl bg-white"/>
          <div className="h-36 rounded-2xl bg-white"/>
        </div>
        <div className="min-h-[520px] rounded-[26px] bg-white shadow-sm">
          <div className="h-40 border-b border-slate-100 p-6">
            <div className="h-4 w-28 rounded bg-emerald-100"/>
            <div className="mt-4 h-9 w-2/3 rounded bg-slate-100"/>
            <div className="mt-3 h-4 w-1/2 rounded bg-slate-100"/>
          </div>
          <div className="space-y-4 p-6">
            <div className="h-24 rounded-2xl bg-slate-100"/>
            <div className="h-44 rounded-2xl bg-slate-100"/>
            <div className="h-24 rounded-2xl bg-slate-100"/>
          </div>
        </div>
      </div>
    </div>
  </main>;
}
