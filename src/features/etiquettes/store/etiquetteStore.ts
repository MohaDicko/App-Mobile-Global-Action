// ─── Store Zustand — Liste d'étiquettes à imprimer + Historique persistant ───
import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import type { ILabelData } from '../services/etiquetteService';

// ─── Storage résilient (Native FileSystem / SecureStore / Web localStorage / Memory fallback)
const memoryFallback = new Map<string, string>();

const getFilePath = (name: string): string | null => {
  const dir = FileSystem.documentDirectory;
  if (!dir) return null;
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${dir}${safeName}.json`;
};

const safeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(name);
      }
      const filePath = getFilePath(name);
      if (filePath) {
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists) {
          return await FileSystem.readAsStringAsync(filePath);
        }
      }
      return await SecureStore.getItemAsync(name);
    } catch {
      return memoryFallback.get(name) ?? null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    memoryFallback.set(name, value);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(name, value);
        return;
      }
      const filePath = getFilePath(name);
      if (filePath) {
        await FileSystem.writeAsStringAsync(filePath, value);
        return;
      }
      await SecureStore.setItemAsync(name, value);
    } catch {
      // Déjà conservé en mémoire dans memoryFallback
    }
  },
  removeItem: async (name: string): Promise<void> => {
    memoryFallback.delete(name);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(name);
        return;
      }
      const filePath = getFilePath(name);
      if (filePath) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
      await SecureStore.deleteItemAsync(name);
    } catch {
      // Ignorer
    }
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ILabelHistoryItem extends ILabelData {
  /** Date/heure ISO du dernier flash/ajout de cet article */
  scannedAt: string;
}

interface IEtiquetteState {
  /** Liste active des étiquettes sélectionnées pour l'impression (conservée même en cas d'incident) */
  labels: ILabelData[];
  /** Historique des articles flashés/sélectionnés (consultable et vidable manuellement) */
  history: ILabelHistoryItem[];
}

interface IEtiquetteActions {
  addLabel: (label: ILabelData) => void;
  removeLabel: (itemCode: string) => void;
  updateQuantity: (itemCode: string, quantity: number) => void;
  /** Vide manuellement la sélection active */
  clearLabels: () => void;
  /** Ré-ajoute un article de l'historique dans la sélection active */
  restoreFromHistory: (itemCode: string) => void;
  /** Recharge tout l'historique dans la sélection active */
  restoreAllHistory: () => void;
  /** Supprime une entrée précise de l'historique */
  removeHistoryItem: (itemCode: string) => void;
  /** Vide manuellement tout l'historique des étiquettes */
  clearHistory: () => void;
}

type IEtiquetteStore = IEtiquetteState & IEtiquetteActions;

const MAX_HISTORY_ITEMS = 200;

// ─── Store ───────────────────────────────────────────────────────────────────

export const useEtiquetteStore = create<IEtiquetteStore>()(
  persist(
    (set, get) => ({
      labels: [],
      history: [],

      addLabel: (label) => {
        const { labels, history } = get();
        const nowIso = new Date().toISOString();

        // 1. Mise à jour de la sélection active
        const existingLabel = labels.find((l) => l.itemCode === label.itemCode);
        const nextLabels = existingLabel
          ? labels.map((l) =>
              l.itemCode === label.itemCode
                ? {
                    ...l,
                    itemName: label.itemName || l.itemName,
                    barcode: label.barcode ?? l.barcode,
                    price: label.price > 0 ? label.price : l.price,
                    pcb: label.pcb ?? l.pcb,
                    quantity: l.quantity + label.quantity,
                  }
                : l
            )
          : [...labels, label];

        // 2. Enregistrement / mise à jour dans l'historique (plus récent en tête)
        const existingHistory = history.find((h) => h.itemCode === label.itemCode);
        const historyEntry: ILabelHistoryItem = existingHistory
          ? {
              ...existingHistory,
              itemName: label.itemName || existingHistory.itemName,
              barcode: label.barcode ?? existingHistory.barcode,
              price: label.price > 0 ? label.price : existingHistory.price,
              pcb: label.pcb ?? existingHistory.pcb,
              quantity: label.quantity,
              scannedAt: nowIso,
            }
          : {
              ...label,
              scannedAt: nowIso,
            };

        const nextHistory = [
          historyEntry,
          ...history.filter((h) => h.itemCode !== label.itemCode),
        ].slice(0, MAX_HISTORY_ITEMS);

        set({ labels: nextLabels, history: nextHistory });
      },

      removeLabel: (itemCode) => {
        set({ labels: get().labels.filter((l) => l.itemCode !== itemCode) });
      },

      updateQuantity: (itemCode, quantity) => {
        if (quantity <= 0) {
          get().removeLabel(itemCode);
          return;
        }
        set({
          labels: get().labels.map((l) =>
            l.itemCode === itemCode ? { ...l, quantity } : l
          ),
        });
      },

      clearLabels: () => {
        set({ labels: [] });
      },

      restoreFromHistory: (itemCode) => {
        const { history, labels } = get();
        const entry = history.find((h) => h.itemCode === itemCode);
        if (!entry) return;

        const existing = labels.find((l) => l.itemCode === entry.itemCode);
        const cleanLabel: ILabelData = {
          itemCode: entry.itemCode,
          itemName: entry.itemName,
          barcode: entry.barcode,
          price: entry.price,
          pcb: entry.pcb,
          quantity: entry.quantity > 0 ? entry.quantity : 1,
        };

        if (existing) {
          set({
            labels: labels.map((l) =>
              l.itemCode === entry.itemCode
                ? { ...l, quantity: l.quantity + cleanLabel.quantity }
                : l
            ),
          });
        } else {
          set({ labels: [...labels, cleanLabel] });
        }
      },

      restoreAllHistory: () => {
        const { history, labels } = get();
        if (history.length === 0) return;

        const merged = [...labels];
        for (const entry of history) {
          const idx = merged.findIndex((l) => l.itemCode === entry.itemCode);
          if (idx === -1) {
            merged.push({
              itemCode: entry.itemCode,
              itemName: entry.itemName,
              barcode: entry.barcode,
              price: entry.price,
              pcb: entry.pcb,
              quantity: entry.quantity > 0 ? entry.quantity : 1,
            });
          }
        }
        set({ labels: merged });
      },

      removeHistoryItem: (itemCode) => {
        set({ history: get().history.filter((h) => h.itemCode !== itemCode) });
      },

      clearHistory: () => {
        set({ history: [] });
      },
    }),
    {
      name: 'global_action_etiquettes_storage',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
