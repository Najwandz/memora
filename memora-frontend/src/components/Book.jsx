import React from 'react';

// Fungsi penentu warna buku
function colorBook(size) {
  const numSize = Number(size) || 0;

  if (numSize <= 150) {
    return '#0D9488'; // Warna Teal
  }
  if (numSize <= 300) {
    return '#2563EB'; // Warna Royal Blue
  }
  if (numSize <= 500) {
    return '#D97706'; // Warna Amber Gold
  }
  if (numSize <= 800) {
    return '#EA580C'; // Warna Deep Orange
  }
  return '#BE123C'; // Warna Crimson
}

export default function Book({ book, widthPercent, onDragStart, onRemove }) {
  const bgColor = colorBook(book.size);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart && onDragStart(e, book)}
      onClick={() => onRemove && onRemove(book.id)}
      style={{
        width: widthPercent ? `${widthPercent}%` : 'auto',
        backgroundColor: bgColor,
      }}
      title={`${book.name || book.id} (${book.size} MB)`}
      className="h-full min-w-[52px] px-1.5 py-2.5 rounded-sm border-x border-black/20 shadow-md 
                 flex flex-col justify-between items-center gap-1 select-none text-white
                 cursor-pointer hover:brightness-110 transition-all duration-300"
    >
      {/* Garis di Atas Buku */}
      <div className="w-full h-1 rounded-full bg-white/30 shrink-0" />

      {/* Nama Proses / Buku */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
        <span className="font-bold text-[11px] leading-none tracking-wider uppercase truncate max-h-full [writing-mode:vertical-rl] rotate-180">
          {book.name || book.id}
        </span>
      </div>

      {/* Ukuran Memori */}
      <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30 text-white">
        {book.size} MB
      </span>
    </div>
  );
}
