// ============================================
// Static Data - Tiendas y categorias estaticas
// ============================================

import type { Store, CategoryConfig } from '../types';

export const stores: Store[] = [
  { id: 'mexx', name: 'Mexx', logo: '/pixel-box.svg', url: 'https://www.mexx.com.ar', color: '#f97316' },
  { id: 'venex', name: 'Venex', logo: '/pixel-box.svg', url: 'https://www.venex.com.ar', color: '#fb8c00' },
  { id: 'fullh4rd', name: 'FullH4rd', logo: '/pixel-box.svg', url: 'https://www.fullh4rd.com.ar', color: '#22c55e' },
  { id: 'compragamer', name: 'CompraGamer', logo: '/pixel-box.svg', url: 'https://www.compragamer.com', color: '#06b6d4' },
  { id: 'maximus', name: 'Maximus', logo: '/pixel-box.svg', url: 'https://www.maximus.com.ar', color: '#3b82f6' },
  { id: 'gezatek', name: 'Gezatek', logo: '/pixel-box.svg', url: 'https://www.gezatek.com.ar', color: '#14b8a6' },
  { id: 'compugarden', name: 'Compugarden', logo: '/pixel-box.svg', url: 'https://www.compugarden.com.ar', color: '#16a34a' },
  { id: 'katech', name: 'Katech', logo: '/pixel-box.svg', url: 'https://katech.com.ar', color: '#64748b' },
  { id: 'dinobyte', name: 'Dinobyte', logo: '/pixel-box.svg', url: 'https://dinobyte.ar', color: '#8b5cf6' },
  { id: 'maxtecno', name: 'MaxTecno', logo: '/pixel-box.svg', url: 'https://maxtecno.com.ar', color: '#ec4899' },
  { id: 'thegamershop', name: 'The Gamer Shop', logo: '/pixel-box.svg', url: 'https://thegamershop.com.ar', color: '#ef4444' },
  { id: 'hardcore', name: 'Hardcore', logo: '/pixel-box.svg', url: 'https://hardcorecomputacion.com.ar', color: '#f43f5e' },
  { id: 'goldentechstore', name: 'Golden Tech', logo: '/pixel-box.svg', url: 'https://goldentechstore.com.ar', color: '#f59e0b' },
];

export const categories: CategoryConfig[] = [
  { id: 'procesadores', name: 'Procesadores', icon: 'cpu', slug: 'procesadores' },
  { id: 'tarjetas-graficas', name: 'Tarjetas Graficas', icon: 'monitor', slug: 'tarjetas-graficas' },
  { id: 'motherboards', name: 'Motherboards', icon: 'hard-drive', slug: 'motherboards' },
  { id: 'memoria-ram', name: 'Memoria RAM', icon: 'memory', slug: 'memoria-ram' },
  { id: 'almacenamiento', name: 'Almacenamiento', icon: 'hdd', slug: 'almacenamiento' },
  { id: 'fuentes-alimentacion', name: 'Fuentes de Alimentacion', icon: 'zap', slug: 'fuentes' },
  { id: 'gabinetes', name: 'Gabinetes', icon: 'box', slug: 'gabinetes' },
  { id: 'refrigeracion', icon: 'thermometer', name: 'Refrigeracion', slug: 'refrigeracion' },
  { id: 'perifericos', icon: 'keyboard', name: 'Perifericos', slug: 'perifericos' },
];
