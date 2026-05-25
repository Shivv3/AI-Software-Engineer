import axios from 'axios';

export const apiBase = import.meta.env.VITE_API_BASE || '/api';

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/auth') {
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  },
);

export default api;
