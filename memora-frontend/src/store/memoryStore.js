// memoryStore.js — logika state rak buku Memora (JavaScript murni, tanpa dependency).
//
// Format blok (sama dengan yang dibaca Shelf.jsx):
//   { id, size, isFree, bookId, bookName, usedSize }
//   - Blok kosong : isFree = true,  bookId/bookName = null, usedSize = 0
//   - Blok terisi : isFree = false, usedSize = ukuran buku
//     Mode fixed  : size = ukuran partisi (sisa size - usedSize = fragmentasi internal)
//     Mode dynamic: size = usedSize (blok dipotong pas seukuran buku)
//
// Semua fungsi bersifat "pure": tidak mengubah state lama, selalu mengembalikan state baru.

export const MODES = { FIXED: 'fixed', DYNAMIC: 'dynamic' };

export const ALGORITHMS = {
  FIRST_FIT: 'first-fit',
  BEST_FIT: 'best-fit',
  WORST_FIT: 'worst-fit',
  NEXT_FIT: 'next-fit',
};

export const ERROR_CODES = {
  INVALID_BOOK: 'INVALID_BOOK',
  DUPLICATE_BOOK: 'DUPLICATE_BOOK',
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  EXTERNAL_FRAGMENTATION: 'EXTERNAL_FRAGMENTATION',
  NO_SPACE: 'NO_SPACE',
  TOO_LARGE_FOR_PARTITIONS: 'TOO_LARGE_FOR_PARTITIONS',
  NO_FREE_PARTITION: 'NO_FREE_PARTITION',
  NOT_DYNAMIC_MODE: 'NOT_DYNAMIC_MODE',
};

export const DEFAULT_CAPACITY = 1024;
export const DEFAULT_PARTITIONS = [128, 256, 256, 384]; // total 1024 MB

// ---------------------------------------------------------------------------
// Pembuatan state
// ---------------------------------------------------------------------------

function createFreeBlock(id, size) {
  return { id, size, isFree: true, bookId: null, bookName: null, usedSize: 0 };
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

/**
 * Membuat state awal rak.
 * - mode 'dynamic': satu blok kosong sepanjang `capacity`.
 * - mode 'fixed'  : satu blok kosong per elemen `partitions`; capacity = jumlah partisi.
 * `autoCoalesce` (hanya dynamic): true = blok kosong bersebelahan langsung melebur saat buku dicabut.
 */
export function createInitialState({
  mode = MODES.DYNAMIC,
  capacity = DEFAULT_CAPACITY,
  partitions = DEFAULT_PARTITIONS,
  autoCoalesce = true,
} = {}) {
  let blocks;
  let totalCapacity;

  if (mode === MODES.FIXED) {
    if (!Array.isArray(partitions) || partitions.length === 0 || !partitions.every(isPositiveInt)) {
      throw new RangeError('partitions harus berupa array bilangan bulat positif');
    }
    blocks = partitions.map((size, i) => createFreeBlock(`blk-${i + 1}`, size));
    totalCapacity = partitions.reduce((sum, s) => sum + s, 0);
  } else if (mode === MODES.DYNAMIC) {
    if (!isPositiveInt(capacity)) {
      throw new RangeError('capacity harus bilangan bulat positif');
    }
    blocks = [createFreeBlock('blk-1', capacity)];
    totalCapacity = capacity;
  } else {
    throw new RangeError(`mode tidak dikenal: ${mode}`);
  }

  return {
    mode,
    capacity: totalCapacity,
    blocks,
    nextBlockId: blocks.length + 1,
    nextFitPointer: null, // id blok tempat alokasi terakhir (untuk Next Fit)
    autoCoalesce,
    stats: { attempts: 0, successes: 0 },
    error: null, // { code, message, details } dari operasi terakhir, atau null
  };
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function makeError(code, message, details = {}) {
  return { code, message, details };
}

function totalFree(blocks) {
  return blocks.reduce((sum, b) => (b.isFree ? sum + b.size : sum), 0);
}

function largestFree(blocks) {
  return blocks.reduce((max, b) => (b.isFree && b.size > max ? b.size : max), 0);
}

// Menentukan KENAPA alokasi gagal supaya UI bisa menampilkan pesan yang tepat.
function diagnoseFailure(state, size) {
  const free = totalFree(state.blocks);
  const largestHole = largestFree(state.blocks);
  const details = { requested: size, totalFree: free, largestHole };

  if (state.mode === MODES.DYNAMIC) {
    if (free >= size) {
      return makeError(
        ERROR_CODES.EXTERNAL_FRAGMENTATION,
        `Fragmentasi Eksternal Terdeteksi: total memori kosong ${free} MB cukup untuk buku ${size} MB, ` +
          `tetapi celah terbesar hanya ${largestHole} MB.`,
        details
      );
    }
    return makeError(
      ERROR_CODES.NO_SPACE,
      `Memori tidak cukup: buku ${size} MB, sisa ruang kosong hanya ${free} MB.`,
      details
    );
  }

  // Mode fixed
  const largestPartition = state.blocks.reduce((max, b) => Math.max(max, b.size), 0);
  if (size > largestPartition) {
    return makeError(
      ERROR_CODES.TOO_LARGE_FOR_PARTITIONS,
      `Buku ${size} MB lebih besar dari partisi terbesar (${largestPartition} MB).`,
      { ...details, largestPartition }
    );
  }
  return makeError(
    ERROR_CODES.NO_FREE_PARTITION,
    `Semua partisi yang cukup besar untuk buku ${size} MB sedang terisi.`,
    { ...details, largestPartition }
  );
}

// ---------------------------------------------------------------------------
// Pemilihan blok (First / Best / Worst / Next Fit)
// ---------------------------------------------------------------------------

/** Mengembalikan index blok kosong yang dipilih algoritma, atau -1 jika tidak ada yang muat. */
function pickBlockIndex(state, size, algorithm) {
  const { blocks } = state;
  const fits = (b) => b.isFree && b.size >= size;

  switch (algorithm) {
    case ALGORITHMS.FIRST_FIT:
      return blocks.findIndex(fits);

    case ALGORITHMS.BEST_FIT: {
      let best = -1;
      blocks.forEach((b, i) => {
        if (fits(b) && (best === -1 || b.size < blocks[best].size)) best = i;
      });
      return best;
    }

    case ALGORITHMS.WORST_FIT: {
      let worst = -1;
      blocks.forEach((b, i) => {
        if (fits(b) && (worst === -1 || b.size > blocks[worst].size)) worst = i;
      });
      return worst;
    }

    case ALGORITHMS.NEXT_FIT: {
      const n = blocks.length;
      const pointerIdx = blocks.findIndex((b) => b.id === state.nextFitPointer);
      const start = pointerIdx === -1 ? 0 : pointerIdx;
      for (let step = 0; step < n; step += 1) {
        const i = (start + step) % n; // circular
        if (fits(blocks[i])) return i;
      }
      return -1;
    }

    default:
      throw new RangeError(`algoritma tidak dikenal: ${algorithm}`);
  }
}

// ---------------------------------------------------------------------------
// Alokasi
// ---------------------------------------------------------------------------

/**
 * Memasukkan satu buku ke rak.
 * book = { id, name?, size }
 * Mengembalikan { ok, state, error }. `state.error` juga diisi supaya UI cukup membaca state.
 */
export function allocate(state, book, algorithm = ALGORITHMS.FIRST_FIT) {
  const size = Number(book && book.size);

  if (!book || !book.id || !isPositiveInt(size)) {
    const error = makeError(
      ERROR_CODES.INVALID_BOOK,
      'Buku tidak valid: butuh id dan ukuran berupa bilangan bulat positif (MB).'
    );
    return { ok: false, state: { ...state, error }, error };
  }

  if (state.blocks.some((b) => !b.isFree && b.bookId === book.id)) {
    const error = makeError(
      ERROR_CODES.DUPLICATE_BOOK,
      `Buku "${book.name || book.id}" sudah ada di rak.`,
      { bookId: book.id }
    );
    return { ok: false, state: { ...state, error }, error };
  }

  const stats = { ...state.stats, attempts: state.stats.attempts + 1 };
  const idx = pickBlockIndex(state, size, algorithm);

  if (idx === -1) {
    const error = diagnoseFailure(state, size);
    return { ok: false, state: { ...state, stats, error }, error };
  }

  const target = state.blocks[idx];
  const occupied = {
    ...target,
    isFree: false,
    bookId: book.id,
    bookName: book.name || book.id,
    usedSize: size,
  };

  let blocks;
  let nextBlockId = state.nextBlockId;

  if (state.mode === MODES.DYNAMIC && target.size > size) {
    // Potong blok: bagian kiri = buku, sisa di kanan = celah kosong baru.
    occupied.size = size;
    const remainder = createFreeBlock(`blk-${nextBlockId}`, target.size - size);
    nextBlockId += 1;
    blocks = [...state.blocks.slice(0, idx), occupied, remainder, ...state.blocks.slice(idx + 1)];
  } else {
    // Fixed: partisi tidak dipotong (sisa = fragmentasi internal). Dynamic: ukuran pas.
    blocks = [...state.blocks.slice(0, idx), occupied, ...state.blocks.slice(idx + 1)];
  }

  return {
    ok: true,
    error: null,
    state: {
      ...state,
      blocks,
      nextBlockId,
      nextFitPointer: occupied.id,
      stats: { ...stats, successes: stats.successes + 1 },
      error: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Dealokasi & Coalescing
// ---------------------------------------------------------------------------

// Melebur blok kosong yang bersebelahan. Blok kiri mempertahankan id-nya.
function mergeAdjacentFree(blocks, pointerId) {
  const merged = [];
  let pointer = pointerId;
  let count = 0;

  blocks.forEach((block) => {
    const last = merged[merged.length - 1];
    if (last && last.isFree && block.isFree) {
      merged[merged.length - 1] = { ...last, size: last.size + block.size };
      if (pointer === block.id) pointer = last.id;
      count += 1;
    } else {
      merged.push(block);
    }
  });

  return { blocks: merged, pointer, count };
}

/**
 * Mencabut buku dari rak. Pada mode dynamic dengan autoCoalesce, celah di kiri/kanan langsung melebur.
 * Pada mode fixed, partisi hanya dikosongkan (tidak pernah digabung).
 */
export function deallocate(state, bookId) {
  const idx = state.blocks.findIndex((b) => !b.isFree && b.bookId === bookId);
  if (idx === -1) {
    const error = makeError(ERROR_CODES.BOOK_NOT_FOUND, `Buku "${bookId}" tidak ada di rak.`, { bookId });
    return { ok: false, state: { ...state, error }, error };
  }

  const freed = createFreeBlock(state.blocks[idx].id, state.blocks[idx].size);
  let blocks = [...state.blocks.slice(0, idx), freed, ...state.blocks.slice(idx + 1)];
  let pointer = state.nextFitPointer;

  if (state.mode === MODES.DYNAMIC && state.autoCoalesce) {
    ({ blocks, pointer } = mergeAdjacentFree(blocks, pointer));
  }

  return {
    ok: true,
    error: null,
    state: { ...state, blocks, nextFitPointer: pointer, error: null },
  };
}

/**
 * Coalescing manual (dipakai saat autoCoalesce dimatikan). Hanya untuk mode dynamic.
 * Mengembalikan juga `merged` = jumlah penggabungan yang terjadi.
 */
export function coalesce(state) {
  if (state.mode !== MODES.DYNAMIC) {
    const error = makeError(
      ERROR_CODES.NOT_DYNAMIC_MODE,
      'Coalescing hanya berlaku pada Dynamic Partition.'
    );
    return { ok: false, merged: 0, state: { ...state, error }, error };
  }

  const { blocks, pointer, count } = mergeAdjacentFree(state.blocks, state.nextFitPointer);
  return {
    ok: true,
    merged: count,
    error: null,
    state: { ...state, blocks, nextFitPointer: pointer, error: null },
  };
}

export function setAutoCoalesce(state, enabled) {
  return { ...state, autoCoalesce: Boolean(enabled) };
}

// ---------------------------------------------------------------------------
// Metrik untuk MetricsPanel
// ---------------------------------------------------------------------------

/**
 * Definisi:
 * - usedMemory  : jumlah ukuran blok yang terisi (di mode fixed, termasuk ruang terbuang di dalam partisi)
 * - freeMemory  : jumlah ukuran blok kosong (usedMemory + freeMemory = capacity)
 * - internalFrag: ruang terbuang di dalam partisi terisi (size - usedSize). Hanya mode fixed.
 * - externalFrag: ruang kosong di luar celah terbesar (freeMemory - largestHole). Hanya mode dynamic.
 *                 Contoh: celah 300 + 300 + 100 -> externalFrag = 400 (tidak bisa dipakai satu buku besar).
 * - externalFragPercent: externalFrag / freeMemory * 100 (0 jika tidak ada ruang kosong)
 * - successRate : persentase alokasi berhasil dari semua percobaan alokasi valid
 */
export function computeMetrics(state) {
  const { blocks, capacity, mode } = state;

  const usedMemory = blocks.reduce((sum, b) => (b.isFree ? sum : sum + b.size), 0);
  const freeMemory = totalFree(blocks);
  const largestHole = largestFree(blocks);
  const holeCount = blocks.filter((b) => b.isFree).length;

  const internalFrag =
    mode === MODES.FIXED
      ? blocks.reduce((sum, b) => (b.isFree ? sum : sum + (b.size - b.usedSize)), 0)
      : 0;

  const externalFrag = mode === MODES.DYNAMIC ? freeMemory - largestHole : 0;
  const externalFragPercent = freeMemory > 0 ? Math.round((externalFrag / freeMemory) * 100) : 0;

  const { attempts, successes } = state.stats;

  return {
    capacity,
    usedMemory,
    freeMemory,
    usagePercent: capacity > 0 ? Math.round((usedMemory / capacity) * 100) : 0,
    internalFrag,
    externalFrag,
    externalFragPercent,
    largestHole,
    holeCount,
    allocationAttempts: attempts,
    allocationSuccesses: successes,
    successRate: attempts > 0 ? Math.round((successes / attempts) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Reducer (siap dipakai useReducer di langkah berikutnya)
// ---------------------------------------------------------------------------

export const ACTIONS = {
  INIT: 'INIT',
  ALLOCATE: 'ALLOCATE',
  DEALLOCATE: 'DEALLOCATE',
  COALESCE: 'COALESCE',
  SET_AUTO_COALESCE: 'SET_AUTO_COALESCE',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

export function memoryReducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT:
      return createInitialState(action.payload);
    case ACTIONS.ALLOCATE:
      return allocate(state, action.payload.book, action.payload.algorithm).state;
    case ACTIONS.DEALLOCATE:
      return deallocate(state, action.payload.bookId).state;
    case ACTIONS.COALESCE:
      return coalesce(state).state;
    case ACTIONS.SET_AUTO_COALESCE:
      return setAutoCoalesce(state, action.payload);
    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
    default:
      return state;
  }
}
