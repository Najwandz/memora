import React from 'react';

export default function MetricsPanel({
  usedMemory = 0,
  freeMemory = 0,
  externalFrag = 0,
  internalFrag = 0,
  totalCapacity = 1024,
}) {
  const usagePercent = Math.round((usedMemory / totalCapacity) * 100);

  const barColor =
    usagePercent >= 90
      ? 'bg-red-600'
      : usagePercent >= 70
      ? 'bg-amber-600'
      : 'bg-teal-600';

  return (
    <div className="w-full bg-white border border-stone-200 rounded-xl p-4 text-left space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Kapasitas Terpakai
          </span>
          <span className="font-mono text-slate-600">
            {usedMemory} / {totalCapacity} MB ({usagePercent}%)
          </span>
        </div>

        <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            style={{ width: `${usagePercent}%` }}
            className={`h-full ${barColor} transition-all duration-300`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 pt-3 border-t border-stone-200 divide-x divide-stone-200">
        <div className="pr-4">
          <p className="text-xs text-stone-500">Ruang Kosong</p>
          <p className="text-base font-bold font-mono text-slate-800 mt-0.5">
            {freeMemory} MB
          </p>
        </div>

        <div className="px-4">
          <p className="text-xs text-stone-500">Fragmentasi Eksternal</p>
          <p
            className={`text-base font-bold font-mono mt-0.5 ${
              externalFrag > 0 ? 'text-amber-800' : 'text-slate-800'
            }`}
          >
            {externalFrag} MB
          </p>
        </div>

        <div className="pl-4">
          <p className="text-xs text-stone-500">Fragmentasi Internal</p>
          <p
            className={`text-base font-bold font-mono mt-0.5 ${
              internalFrag > 0 ? 'text-amber-800' : 'text-slate-800'
            }`}
          >
            {internalFrag} MB
          </p>
        </div>
      </div>
    </div>
  );
}
