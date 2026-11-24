import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, ALGORITHMS as A, ERROR_CODES as E,
  createInitialState, allocate, deallocate, coalesce, setAutoCoalesce, computeMetrics, memoryReducer, ACTIONS,
} from './memoryStore.js';

const book = (id, size) => ({ id, name: id, size });
const put = (s, id, size, algo = A.FIRST_FIT) => {
  const r = allocate(s, book(id, size), algo);
  assert.ok(r.ok, `alokasi ${id} harus berhasil: ${r.error && r.error.message}`);
  return r.state;
};
const layout = (s) => s.blocks.map((b) => (b.isFree ? `_${b.size}` : `${b.bookId}${b.size}`)).join(' ');

// ---------- Dynamic: algoritma ----------

// Rak 1000: A200 B100 C300 D100 E200 -> cabut B dan D -> celah 100 (idx1), 100 (idx3)... buat celah beda ukuran
function shelfWithHoles() {
  let s = createInitialState({ mode: MODES.DYNAMIC, capacity: 1000 });
  s = put(s, 'A', 100);
  s = put(s, 'B', 200); // celah 200 nanti
  s = put(s, 'C', 100);
  s = put(s, 'D', 400); // celah 400 nanti
  s = put(s, 'E', 100);
  s = put(s, 'F', 100); // total 1000, penuh
  s = deallocate(s, 'B').state;
  s = deallocate(s, 'D').state;
  return s; // A100 _200 C100 _400 E100 F100
}

test('dynamic: layout dasar setelah cabut buku', () => {
  assert.equal(layout(shelfWithHoles()), 'A100 _200 C100 _400 E100 F100');
});

test('first fit: celah pertama yang muat', () => {
  const s = put(shelfWithHoles(), 'X', 150, A.FIRST_FIT);
  assert.equal(layout(s), 'A100 X150 _50 C100 _400 E100 F100');
});

test('best fit: celah paling pas', () => {
  const s = put(shelfWithHoles(), 'X', 150, A.BEST_FIT);
  assert.equal(layout(s), 'A100 X150 _50 C100 _400 E100 F100'); // 200 lebih pas dari 400
  const t = put(shelfWithHoles(), 'Y', 250, A.BEST_FIT);
  assert.equal(layout(t), 'A100 _200 C100 Y250 _150 E100 F100'); // hanya 400 yang muat
});

test('worst fit: celah paling besar', () => {
  const s = put(shelfWithHoles(), 'X', 150, A.WORST_FIT);
  assert.equal(layout(s), 'A100 _200 C100 X150 _250 E100 F100');
});

test('next fit: lanjut dari posisi terakhir, lalu berputar (circular)', () => {
  let s = shelfWithHoles();
  s = put(s, 'X', 150, A.NEXT_FIT); // pointer awal null -> mulai idx 0 -> celah 200
  assert.equal(layout(s), 'A100 X150 _50 C100 _400 E100 F100');
  s = put(s, 'Y', 100, A.NEXT_FIT); // lanjut dari X: sisa 50 tidak muat -> celah 400
  assert.equal(layout(s), 'A100 X150 _50 C100 Y100 _300 E100 F100');
  s = put(s, 'Z', 50, A.NEXT_FIT); // dari Y: sisa 300 muat 50
  assert.equal(layout(s), 'A100 X150 _50 C100 Y100 Z50 _250 E100 F100');
  // Cabut X lalu isi 150 dengan pointer di Z -> harus berputar balik ke celah kiri
  s = deallocate(s, 'X').state; // A100 _200 C100 Y100 Z50 _250 ...
  s = put(s, 'W', 200, A.NEXT_FIT); // dari Z: celah 250 muat 200 -> bukan celah kiri
  assert.equal(layout(s), 'A100 _200 C100 Y100 Z50 W200 _50 E100 F100');
  s = put(s, 'V', 200, A.NEXT_FIT); // dari W: sisa 50 tidak muat, E/F penuh, putar -> celah 200 kiri
  assert.equal(layout(s), 'A100 V200 C100 Y100 Z50 W200 _50 E100 F100');
});

// ---------- Fragmentasi eksternal ----------

test('dynamic: fragmentasi eksternal terdeteksi dengan pesan yang tepat', () => {
  let s = createInitialState({ mode: MODES.DYNAMIC, capacity: 1000 });
  s = put(s, 'A', 300); s = put(s, 'B', 200); s = put(s, 'C', 300); s = put(s, 'D', 200);
  s = deallocate(s, 'A').state;
  s = deallocate(s, 'C').state; // _300 B200 _300 D200
  const r = allocate(s, book('X', 400), A.FIRST_FIT);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, E.EXTERNAL_FRAGMENTATION);
  assert.deepEqual(r.error.details, { requested: 400, totalFree: 600, largestHole: 300 });
  assert.match(r.error.message, /Fragmentasi Eksternal Terdeteksi/);
  assert.equal(r.state.error.code, E.EXTERNAL_FRAGMENTATION); // juga ada di state untuk UI
  const m = computeMetrics(r.state);
  assert.equal(m.externalFrag, 300);
  assert.equal(m.externalFragPercent, 50);
  assert.equal(m.allocationAttempts, 5); // 4 sukses + 1 gagal
  assert.equal(m.successRate, 80);
});

test('dynamic: ruang memang tidak cukup -> NO_SPACE (bukan fragmentasi)', () => {
  let s = createInitialState({ mode: MODES.DYNAMIC, capacity: 500 });
  s = put(s, 'A', 400);
  const r = allocate(s, book('X', 200));
  assert.equal(r.error.code, E.NO_SPACE);
});

// ---------- Coalescing ----------

test('coalescing otomatis melebur celah bersebelahan (kiri, kanan, dan tengah)', () => {
  let s = createInitialState({ mode: MODES.DYNAMIC, capacity: 600 });
  s = put(s, 'A', 100); s = put(s, 'B', 100); s = put(s, 'C', 100); s = put(s, 'D', 100);
  s = deallocate(s, 'A').state;
  s = deallocate(s, 'C').state; // _100 B100 _100 D100 _200
  assert.equal(layout(s), '_100 B100 _100 D100 _200');
  s = deallocate(s, 'B').state; // tiga celah menyatu
  assert.equal(layout(s), '_300 D100 _200');
  s = deallocate(s, 'D').state;
  assert.equal(layout(s), '_600');
});

test('coalescing manual: autoCoalesce dimatikan lalu tombol coalesce', () => {
  let s = createInitialState({ mode: MODES.DYNAMIC, capacity: 400, autoCoalesce: false });
  s = put(s, 'A', 100); s = put(s, 'B', 100); s = put(s, 'C', 100);
  s = deallocate(s, 'A').state;
  s = deallocate(s, 'B').state;
  assert.equal(layout(s), '_100 _100 C100 _100'); // belum melebur
  const r = coalesce(s);
  assert.equal(r.merged, 1);
  assert.equal(layout(r.state), '_200 C100 _100');
  assert.equal(setAutoCoalesce(r.state, true).autoCoalesce, true);
});

test('coalescing tidak berlaku di mode fixed', () => {
  const s = createInitialState({ mode: MODES.FIXED, partitions: [100, 100] });
  const r = coalesce(s);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, E.NOT_DYNAMIC_MODE);
});

// ---------- Fixed partition ----------

test('fixed: fragmentasi internal dan partisi tidak pernah dipotong/digabung', () => {
  let s = createInitialState({ mode: MODES.FIXED, partitions: [100, 200, 500] });
  s = put(s, 'A', 60);  // first fit -> partisi 100 (sisa 40)
  s = put(s, 'B', 150); // partisi 200 (sisa 50)
  assert.equal(s.blocks.length, 3);
  const m = computeMetrics(s);
  assert.equal(m.internalFrag, 90);
  assert.equal(m.externalFrag, 0);
  assert.equal(m.usedMemory, 300); // 100 + 200 terkunci
  assert.equal(m.freeMemory, 500);
  assert.equal(m.usedMemory + m.freeMemory, m.capacity);
  s = deallocate(s, 'A').state;
  s = deallocate(s, 'B').state;
  assert.equal(layout(s), '_100 _200 _500'); // tidak digabung
});

test('fixed: best fit memilih partisi terkecil yang muat, worst fit yang terbesar', () => {
  const base = createInitialState({ mode: MODES.FIXED, partitions: [100, 200, 500] });
  assert.equal(put(base, 'A', 60, A.BEST_FIT).blocks[0].bookId, 'A');
  assert.equal(put(base, 'A', 60, A.WORST_FIT).blocks[2].bookId, 'A');
});

test('fixed: pesan error buku terlalu besar vs semua partisi penuh', () => {
  let s = createInitialState({ mode: MODES.FIXED, partitions: [100, 200] });
  assert.equal(allocate(s, book('X', 300)).error.code, E.TOO_LARGE_FOR_PARTITIONS);
  s = put(s, 'A', 150);
  assert.equal(allocate(s, book('X', 180)).error.code, E.NO_FREE_PARTITION);
});

// ---------- Validasi ----------

test('validasi input', () => {
  const s = createInitialState({ mode: MODES.DYNAMIC, capacity: 100 });
  assert.equal(allocate(s, book('A', 0)).error.code, E.INVALID_BOOK);
  assert.equal(allocate(s, book('A', -5)).error.code, E.INVALID_BOOK);
  assert.equal(allocate(s, book('A', 2.5)).error.code, E.INVALID_BOOK);
  assert.equal(allocate(s, { size: 10 }).error.code, E.INVALID_BOOK);
  const t = put(s, 'A', 10);
  assert.equal(allocate(t, book('A', 10)).error.code, E.DUPLICATE_BOOK);
  assert.equal(deallocate(t, 'ZZZ').error.code, E.BOOK_NOT_FOUND);
  assert.throws(() => createInitialState({ mode: 'x' }), RangeError);
  assert.throws(() => createInitialState({ mode: MODES.FIXED, partitions: [10, 0] }), RangeError);
  assert.throws(() => allocate(t, book('B', 5), 'random-fit'), RangeError);
});

test('state lama tidak pernah diubah (immutability)', () => {
  const s = createInitialState({ mode: MODES.DYNAMIC, capacity: 100 });
  const snapshot = JSON.stringify(s);
  const r = allocate(s, book('A', 40));
  deallocate(r.state, 'A');
  assert.equal(JSON.stringify(s), snapshot);
});

test('reducer meneruskan aksi dan error ke state', () => {
  let s = memoryReducer(undefined, { type: ACTIONS.INIT, payload: { mode: MODES.DYNAMIC, capacity: 100 } });
  s = memoryReducer(s, { type: ACTIONS.ALLOCATE, payload: { book: book('A', 80), algorithm: A.BEST_FIT } });
  s = memoryReducer(s, { type: ACTIONS.ALLOCATE, payload: { book: book('B', 50), algorithm: A.BEST_FIT } });
  assert.equal(s.error.code, E.NO_SPACE);
  s = memoryReducer(s, { type: ACTIONS.CLEAR_ERROR });
  assert.equal(s.error, null);
  s = memoryReducer(s, { type: ACTIONS.DEALLOCATE, payload: { bookId: 'A' } });
  assert.equal(layout(s), '_100');
});

// ---------- Uji acak: invariant harus selalu benar ----------

function rng(seed) { // deterministik
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}

for (const mode of [MODES.DYNAMIC, MODES.FIXED]) {
  for (const auto of [true, false]) {
    if (mode === MODES.FIXED && !auto) continue;
    test(`acak 3000 operasi, mode ${mode}, autoCoalesce ${auto}: invariant terjaga`, () => {
      const rand = rng(42);
      const algos = Object.values(A);
      let s = createInitialState({ mode, capacity: 1000, partitions: [100, 150, 250, 500], autoCoalesce: auto });
      const fixedCount = s.blocks.length;
      const present = new Set();
      let counter = 0;

      for (let i = 0; i < 3000; i += 1) {
        if (rand() < 0.55 || present.size === 0) {
          const id = `B${counter++}`;
          const r = allocate(s, book(id, 1 + Math.floor(rand() * 300)), algos[Math.floor(rand() * 4)]);
          s = r.state;
          if (r.ok) present.add(id);
        } else {
          const ids = [...present];
          const id = ids[Math.floor(rand() * ids.length)];
          s = deallocate(s, id).state;
          present.delete(id);
        }
        if (rand() < 0.05) s = coalesce(s).state;

        const m = computeMetrics(s);
        assert.equal(s.blocks.reduce((a, b) => a + b.size, 0), s.capacity, 'jumlah ukuran blok = kapasitas');
        assert.equal(m.usedMemory + m.freeMemory, m.capacity);
        assert.equal(s.blocks.filter((b) => !b.isFree).length, present.size, 'jumlah buku konsisten');
        assert.equal(new Set(s.blocks.map((b) => b.id)).size, s.blocks.length, 'id blok unik');
        assert.ok(s.blocks.every((b) => b.size > 0 && b.usedSize <= b.size));
        if (mode === MODES.FIXED) assert.equal(s.blocks.length, fixedCount, 'partisi tetap tidak berubah');
        if (mode === MODES.DYNAMIC && auto) {
          for (let k = 1; k < s.blocks.length; k += 1) {
            assert.ok(!(s.blocks[k].isFree && s.blocks[k - 1].isFree), 'tidak ada celah bersebelahan');
          }
        }
      }
    });
  }
}
