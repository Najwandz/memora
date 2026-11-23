import axios from 'axios';

// Saat testing lokal gunakan localhost:8000. 
// Nanti saat sudah di-deploy ke Render/Railway, ganti dengan URL publik Backend Anda.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 1. Cek apakah user sudah berstatus Premium (untuk membuka kunci Compaction Mode)
export const checkUserPremiumStatus = async (userId = 'user-test-123') => {
  const response = await apiClient.get(`/users/${userId}/status`);
  return response.data; // Mengembalikan { user_id, username, is_premium }
};

// 2. Simpan hasil simulasi memori ke database
export const saveSimulationHistory = async (simulationData) => {
  // simulationData berisi: { user_id, algorithm, total_memory, fragmentation_rate, simulation_state }
  const response = await apiClient.post('/simulations/save', simulationData);
  return response.data; // Mengembalikan { status: "success", history_id }
};

// 3. Buat tagihan QRIS Xendit saat tombol "Buka Mode Compaction (Premium)" diklik
export const createQrisPayment = async (userId = 'user-test-123', grossAmount = 15000) => {
  const response = await apiClient.post('/payment/create-qris', {
    user_id: userId,
    gross_amount: grossAmount,
  });
  return response.data; // Mengembalikan { status, order_id, gross_amount, qris_url, ... }
};

export default apiClient;
