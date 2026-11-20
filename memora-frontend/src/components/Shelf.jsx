import React from 'react';
import Book from './Book';

export default function Shelf({
  blocks = [],
  totalCapacity = 1024,
  onDropBook,
  onRemoveBook,
}) {
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('book');
    if (rawData && onDropBook) {
      onDropBook(JSON.parse(rawData));
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="w-full h-44 bg-stone-100 border-x-4 border-t-4 border-amber-900 rounded-t-lg p-0 flex items-end gap-0 shadow-inner overflow-x-auto overflow-y-hidden"
      >
        {blocks.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-stone-500">
            <span className="text-xs font-semibold">Rak Kosong</span>
            <span className="text-[11px] font-mono">{totalCapacity} MB</span>
          </div>
        ) : (
          blocks.map((block) => {
            const blockWidth = (block.size / totalCapacity) * 100;

            if (block.isFree) {
              return (
                <div
                  key={block.id}
                  style={{ width: `${blockWidth}%` }}
                  className="h-full min-w-[44px] border-r border-dashed border-stone-400 last:border-r-0 flex flex-col items-center justify-center text-stone-500 transition-all duration-300 overflow-hidden"
                >
                  <span className="text-xs font-medium truncate px-1">
                    Kosong
                  </span>
                  <span className="text-[11px] font-mono">{block.size} MB</span>
                </div>
              );
            }

            const usedSize = block.usedSize || block.size;
            const remainingSize = block.size - usedSize;
            const bookRatio = (usedSize / block.size) * 100;

            return (
              <div
                key={block.id}
                style={{ width: `${blockWidth}%` }}
                className="h-full min-w-[56px] shrink-0 flex overflow-hidden transition-all duration-300"
              >
                <Book
                  book={{
                    id: block.bookId,
                    name: block.bookName || block.bookId,
                    size: usedSize,
                  }}
                  widthPercent={bookRatio}
                  onRemove={onRemoveBook}
                />

                {remainingSize > 0 && (
                  <div
                    style={{ width: `${100 - bookRatio}%` }}
                    title={`Kosong: ${remainingSize} MB`}
                    className="h-full border-r border-dashed border-stone-400 flex flex-col items-center justify-center text-stone-500 overflow-hidden"
                  >
                    <span className="text-xs font-medium truncate px-1">
                      Kosong
                    </span>
                    <span className="text-[11px] font-mono">
                      {remainingSize} MB
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="w-full h-3.5 bg-amber-900 border-t border-amber-700 rounded-b-md shadow-md" />
    </div>
  );
}
