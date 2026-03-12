// ============================================
// Static Data - Tiendas y categorias estaticas
// ============================================

import type { Store, CategoryConfig } from '../types';

export const stores: Store[] = [
  { id: '37bytes', name: '37 Bytes', logo: '/pixel-box.svg', url: 'https://www.37bytes.com.ar', color: '#4f46e5' },
  { id: 'acuarioinsumos', name: 'Acuario Insumos', logo: '/pixel-box.svg', url: 'https://www.acuarioinsumos.com.ar', color: '#06b6d4' },
  { id: 'armytech', name: 'ArmyTech', logo: '/pixel-box.svg', url: 'https://www.armytech.com.ar', color: '#84cc16' },
  { id: 'beings', name: 'Beings', logo: '/pixel-box.svg', url: 'https://beings.com.ar', color: '#0f766e' },
  { id: 'clickgaming', name: 'Click Gaming', logo: '/pixel-box.svg', url: 'https://clickgaming.com.ar', color: '#2563eb' },
  { id: 'gamerspoint', name: 'Gamers Point', logo: '/pixel-box.svg', url: 'https://www.gamerspoint.com.ar', color: '#22c55e' },
  { id: 'hypergaming', name: 'Hyper Gaming', logo: '/pixel-box.svg', url: 'https://hypergaming.com.ar', color: '#14b8a6' },
  { id: 'hftecnologia', name: 'HF Tecnologia', logo: '/pixel-box.svg', url: 'https://hftecnologia.com.ar', color: '#0891b2' },
  { id: 'integradosargentinos', name: 'Integrados Argentinos', logo: '/pixel-box.svg', url: 'https://integradosargentinos.com', color: '#6366f1' },
  { id: 'liontech', name: 'LionTech', logo: '/pixel-box.svg', url: 'https://liontech.com.ar', color: '#ef4444' },
  { id: 'megasoft', name: 'Megasoft', logo: '/pixel-box.svg', url: 'https://megasoftargentina.com.ar', color: '#dc2626' },
  { id: 'mexx', name: 'Mexx', logo: '/pixel-box.svg', url: 'https://www.mexx.com.ar', color: '#f97316' },
  { id: 'noxie', name: 'Noxie Store', logo: '/pixel-box.svg', url: 'https://noxiestore.com', color: '#7c3aed' },
  { id: 'venex', name: 'Venex', logo: '/pixel-box.svg', url: 'https://www.venex.com.ar', color: '#fb8c00' },
  { id: 'fullh4rd', name: 'FullH4rd', logo: '/pixel-box.svg', url: 'https://www.fullh4rd.com.ar', color: '#22c55e' },
  { id: 'compragamer', name: 'CompraGamer', logo: '/pixel-box.svg', url: 'https://www.compragamer.com', color: '#06b6d4' },
  { id: 'maximus', name: 'Maximus', logo: '/pixel-box.svg', url: 'https://www.maximus.com.ar', color: '#3b82f6' },
  { id: 'gamingcity', name: 'Gaming City', logo: '/pixel-box.svg', url: 'https://www.gamingcity.com.ar', color: '#0ea5e9' },
  { id: 'gezatek', name: 'Gezatek', logo: '/pixel-box.svg', url: 'https://www.gezatek.com.ar', color: '#14b8a6' },
  { id: 'compugarden', name: 'Compugarden', logo: '/pixel-box.svg', url: 'https://www.compugarden.com.ar', color: '#16a34a' },
  { id: 'logg', name: 'Logg', logo: '/pixel-box.svg', url: 'https://logg.com.ar', color: '#f97316' },
  { id: 'katech', name: 'Katech', logo: '/pixel-box.svg', url: 'https://katech.com.ar', color: '#64748b' },
  { id: 'dinobyte', name: 'Dinobyte', logo: '/pixel-box.svg', url: 'https://dinobyte.ar', color: '#8b5cf6' },
  { id: 'maxtecno', name: 'MaxTecno', logo: '/pixel-box.svg', url: 'https://maxtecno.com.ar', color: '#ec4899' },
  { id: 'rockethard', name: 'Rocket Hard', logo: '/pixel-box.svg', url: 'https://rockethard.com.ar', color: '#e11d48' },
  { id: 'scphardstore', name: 'SCP Hardstore', logo: '/pixel-box.svg', url: 'https://www.scphardstore.com', color: '#0f766e' },
  { id: 'shopgamer', name: 'ShopGamer', logo: '/pixel-box.svg', url: 'https://www.shopgamer.com.ar', color: '#7c3aed' },
  { id: 'slotone', name: 'Slot One', logo: '/pixel-box.svg', url: 'https://www.slot-one.com.ar', color: '#2563eb' },
  { id: 'spacevideojuegos', name: 'Space', logo: '/pixel-box.svg', url: 'https://spacegamer.com.ar', color: '#6366f1' },
  { id: 'thegamershop', name: 'The Gamer Shop', logo: '/pixel-box.svg', url: 'https://thegamershop.com.ar', color: '#ef4444' },
  { id: 'hardcore', name: 'Hardcore', logo: '/pixel-box.svg', url: 'https://hardcorecomputacion.com.ar', color: '#f43f5e' },
  { id: 'goldentechstore', name: 'Golden Tech', logo: '/pixel-box.svg', url: 'https://goldentechstore.com.ar', color: '#f59e0b' },
  { id: 'vertexretail', name: 'Vertex Retail', logo: '/pixel-box.svg', url: 'https://vrx.com.ar', color: '#0284c7' },
  { id: 'wiztech', name: 'WizTech', logo: '/pixel-box.svg', url: 'https://wiztech.com.ar', color: '#14b8a6' },
  { id: 'xtpc', name: 'Xt-PC', logo: '/pixel-box.svg', url: 'https://www.xt-pc.com.ar', color: '#2563eb' },
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
