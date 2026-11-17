import React, { useState, useEffect } from 'react';

// Fungsi penentu warna buku
function getBookStyleBySize(size) {
  const numSize = Number(size) || 0;

  if (numSize <= 150) {
    return { bg: '#0D9488', isLightBg: false };
  }
  if (numSize <= 300) {
    return { bg: '#2563EB', isLightBg: false };
  }
  if (numSize <= 500) {
    return { bg: '#D97706', isLightBg: false };
  }
  if (numSize <= 800) {
    return { bg: '#EA580C', isLightBg: false };
  }
  return { bg: '#BE123C', isLightBg: false };
}

export default function Book({
  book,
  widthPercent,
  onDragStart,
  onRemove,
  onRename,
  editable = true,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentName, setCurrentName] = useState(book.name || book.id);
  const [draftName, setDraftName] = useState(book.name || book.id);

  useEffect(() => {
    setCurrentName(book.name || book.id);
    setDraftName(book.name || book.id);
  }, [book.name, book.id]);

  const { bg, isLightBg } = getBookStyleBySize(book.size);
  const showEditInput = editable && isEditing;

  const handleStartEdit = (e) => {
    if (!editable) return;
    e.stopPropagation();
    setDraftName(currentName);
    setIsEditing(true);
  };

  const handleSaveName = () => {
    const trimmed = draftName.trim();
    if (trimmed) {
      setCurrentName(trimmed);
      if (onRename) {
        onRename(book.id, trimmed);
      }
    } else {
      setDraftName(currentName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      setDraftName(currentName);
      setIsEditing(false);
    }
  };

  return (
    <div
      draggable={!showEditInput}
      onDragStart={(e) =>
        !showEditInput &&
        onDragStart &&
        onDragStart(e, { ...book, name: currentName })
      }
      onClick={() => !showEditInput && onRemove && onRemove(book.id)}
      style={{
        width: widthPercent ? `${widthPercent}%` : 'auto',
        backgroundColor: bg,
      }}
      title={
        editable
          ? `${currentName} (${book.size} MB) — Klik ✎ untuk ubah nama, tarik ke rak untuk alokasi`
          : `${currentName} (${book.size} MB) — Klik untuk mencabut buku`
      }
      className={`group relative h-full min-w-[48px] px-2 py-2.5 rounded-sm border-x border-black/20 shadow-md 
                 flex flex-col justify-between items-center select-none
                 cursor-pointer hover:brightness-110 transition-all duration-300 ${
                   isLightBg ? 'text-slate-900' : 'text-white'
                 }`}
    >
      {/* Bagian Edit Teks */}
      <div className="w-full flex flex-col items-center gap-1">
        <div
          className={`w-full h-1.5 rounded-full ${
            isLightBg ? 'bg-black/20' : 'bg-white/30'
          }`}
        />
        {editable && !isEditing && (
          <button
            type="button"
            onClick={handleStartEdit}
            title="Edit nama buku"
            className={`opacity-70 group-hover:opacity-100 text-[10px] px-1.5 py-0.2 rounded transition ${
              isLightBg
                ? 'bg-black/15 hover:bg-black/25 text-slate-900'
                : 'bg-black/25 hover:bg-black/45 text-white'
            }`}
          >
            ✎
          </button>
        )}
      </div>

      {/* Bagian Input Teks */}
      {showEditInput ? (
        <input
          type="text"
          value={draftName}
          autoFocus
          maxLength={16}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={handleKeyDown}
          className="w-20 px-1.5 py-0.5 text-xs font-bold text-slate-900 bg-white rounded shadow-lg border border-slate-400 outline-none text-center z-20"
        />
      ) : (
        <span
          onDoubleClick={editable ? handleStartEdit : undefined}
          className="font-bold text-xs tracking-wider uppercase truncate max-w-full [writing-mode:vertical-rl] rotate-180"
        >
          {currentName}
        </span>
      )}

      {/* Bagian Ukuran Memori */}
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          isLightBg
            ? 'bg-black/15 text-slate-900 font-semibold'
            : 'bg-black/30 text-white'
        }`}
      >
        {book.size}MB
      </span>
    </div>
  );
}
