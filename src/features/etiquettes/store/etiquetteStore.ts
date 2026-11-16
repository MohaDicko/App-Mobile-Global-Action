// ─── Store Zustand — Liste d'étiquettes à imprimer + Historique persistant ───
import { Platform } from 'react-native';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { ILabelData } from '../services/etiquetteService';

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

const STORAGE_KEY = 'global_action_etiquettes_storage';
const MAX_HISTORY_ITEMS = 100;

// ─── Persistance compatible Web (localStorage) + Mobile (SecureStore) sans zustand/middleware ───

const readInitialWebState = (): IEtiquetteState => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IEtiquetteState>;
        return {
          labels: Array.isArray(parsed.labels) ? parsed.labels : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      }
    }
  } catch {
    // Ignorer
  }
  return { labels: [], history: [] };
};

const savePersistedState = (state: IEtiquetteState): void => {
  try {
    const serialized = JSON.stringify({
      labels: state.labels,
      history: state.history,
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      return;
    }
    void SecureStore.setItemAsync(STORAGE_KEY, serialized).catch(() => {});
  } catch {
    // Ignorer
  }
};

// ─── Store ───────────────────────────────────────────────────────────────────

const initialState = readInitialWebState();

export const useEtiquetteStore = create<IEtiquetteStore>((set, get) => ({
  labels: initialState.labels,
  history: initialState.history,

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

    const nextState = { labels: nextLabels, history: nextHistory };
    set(nextState);
    savePersistedState(nextState);
  },

  removeLabel: (itemCode) => {
    const nextLabels = get().labels.filter((l) => l.itemCode !== itemCode);
    set({ labels: nextLabels });
    savePersistedState({ labels: nextLabels, history: get().history });
  },

  updateQuantity: (itemCode, quantity) => {
    if (quantity <= 0) {
      get().removeLabel(itemCode);
      return;
    }
    const nextLabels = get().labels.map((l) =>
      l.itemCode === itemCode ? { ...l, quantity } : l
    );
    set({ labels: nextLabels });
    savePersistedState({ labels: nextLabels, history: get().history });
  },

  clearLabels: () => {
    set({ labels: [] });
    savePersistedState({ labels: [], history: get().history });
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

    const nextLabels = existing
      ? labels.map((l) =>
          l.itemCode === entry.itemCode
            ? { ...l, quantity: l.quantity + cleanLabel.quantity }
            : l
        )
      : [...labels, cleanLabel];

    set({ labels: nextLabels });
    savePersistedState({ labels: nextLabels, history });
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
    savePersistedState({ labels: merged, history });
  },

  removeHistoryItem: (itemCode) => {
    const nextHistory = get().history.filter((h) => h.itemCode !== itemCode);
    set({ history: nextHistory });
    savePersistedState({ labels: get().labels, history: nextHistory });
  },

  clearHistory: () => {
    set({ history: [] });
    savePersistedState({ labels: get().labels, history: [] });
  },
}));

// Hydratation asynchrone sur mobile (Android / iOS) au chargement du module
if (Platform.OS !== 'web') {
  SecureStore.getItemAsync(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<IEtiquetteState>;
      const current = useEtiquetteStore.getState();
      if (current.labels.length === 0 && current.history.length === 0) {
        useEtiquetteStore.setState({
          labels: Array.isArray(parsed.labels) ? parsed.labels : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
        });
      }
    })
    .catch(() => {});
}
