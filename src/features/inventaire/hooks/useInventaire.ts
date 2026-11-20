import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { inventaireService } from '../services/inventaireService';
import { extractSapErrorMessage } from '@shared/utils';

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Liste des documents d'inventaire ouverts — filtrés par magasin si fourni */
export const useOpenCountings = (warehouseCode?: string) =>
  useQuery({
    queryKey: ['inventaire', 'open', warehouseCode ?? 'all'],
    queryFn: () => inventaireService.getCountings(warehouseCode),
    staleTime: 30_000,
  });

/** Détail d'un document (lignes incluses) */
export const useCountingDetail = (docEntry: number | null) =>
  useQuery({
    queryKey: ['inventaire', 'detail', docEntry],
    queryFn: () => inventaireService.getCountingDetail(docEntry!),
    enabled: docEntry !== null,
    staleTime: 10_000,
  });

/** Map BinEntry → BinCode pour les emplacements du document courant */
export const useBinLocations = (binEntries: number[]) =>
  useQuery({
    queryKey: ['binLocations', [...binEntries].sort((a, b) => a - b)],
    queryFn: () => inventaireService.getBinLocations(binEntries),
    enabled: binEntries.length > 0,
    staleTime: 5 * 60_000,
  });

/** Emplacements d'un entrepôt — pour le sélecteur lors du comptage */
export const useWarehouseBins = (warehouseCode: string) =>
  useQuery({
    queryKey: ['warehouseBins', warehouseCode],
    queryFn: () => inventaireService.getBinLocationsForWarehouse(warehouseCode),
    enabled: warehouseCode.length > 0,
    staleTime: 5 * 60_000,
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Met à jour la quantité d'une ligne déjà comptée (recomptage / cumul / qté 0) */
export const useUpdateCountedLine = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      docEntry,
      lineNumber,
      quantity,
    }: {
      docEntry: number;
      lineNumber: number;
      quantity: number;
    }) => inventaireService.updateCountedLine(docEntry, lineNumber, quantity),
    onSuccess: (_, { docEntry }) => {
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'detail', docEntry] });
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'open'] });
      Toast.show({
        type: 'success',
        text1: 'Comptage enregistré',
        text2: 'La ligne a été validée dans SAP',
      });
    },
    onError: (error: Error) => {
      Toast.show({
        type: 'error',
        text1: 'Erreur SAP',
        text2: extractSapErrorMessage(error),
      });
    },
  });
};

/** Valide / enregistre plusieurs lignes du document au fur et à mesure dans SAP */
export const useSaveCountedLines = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      docEntry,
      updates,
    }: {
      docEntry: number;
      updates: Array<{ lineNumber: number; quantity: number }>;
    }) => inventaireService.saveCountedLines(docEntry, updates),
    onSuccess: (_, { docEntry, updates }) => {
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'detail', docEntry] });
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'open'] });
      Toast.show({
        type: 'success',
        text1: 'Document validé au fur et à mesure',
        text2: `${updates.length} ligne${updates.length > 1 ? 's' : ''} enregistrée${updates.length > 1 ? 's' : ''} dans SAP`,
      });
    },
    onError: (error: Error) => {
      Toast.show({
        type: 'error',
        text1: 'Erreur SAP',
        text2: extractSapErrorMessage(error),
      });
    },
  });
};

/** Ajoute un article compté au document (gère le retrait du placeholder) */
export const useAddCountedItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      docEntry: number;
      itemCode: string;
      quantity: number;
      binEntry?: number;
      warehouseCode: string;
    }) =>
      inventaireService.addCountedItem(params.docEntry, {
        itemCode: params.itemCode,
        quantity: params.quantity,
        binEntry: params.binEntry,
        warehouseCode: params.warehouseCode,
      }),
    onSuccess: (_, { docEntry, itemCode }) => {
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'detail', docEntry] });
      queryClient.invalidateQueries({ queryKey: ['inventaire', 'open'] });
      Toast.show({
        type: 'success',
        text1: 'Article enregistré',
        text2: `${itemCode} ajouté au comptage`,
      });
    },
    onError: (error: Error, { itemCode }) => {
      const sapError = (
        error as {
          response?: { data?: { error?: { code?: number; message?: { value?: string } } } };
        }
      ).response?.data?.error;
      const isDuplicateInOpenDoc =
        sapError?.code === -5002 &&
        (sapError.message?.value ?? '').includes('already been added');

      Toast.show({
        type: 'error',
        text1: isDuplicateInOpenDoc ? 'Article déjà en cours de comptage' : 'Erreur SAP',
        text2: isDuplicateInOpenDoc
          ? `${itemCode} figure déjà dans un autre inventaire ouvert de ce magasin`
          : extractSapErrorMessage(error),
      });
    },
  });
};
