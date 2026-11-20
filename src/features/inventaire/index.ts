// ─── Module Inventaire — exports ─────────────────────────────────────────────
export { inventaireService } from './services/inventaireService';
export {
  useOpenCountings,
  useCountingDetail,
  useBinLocations,
  useWarehouseBins,
  useUpdateCountedLine,
  useSaveCountedLines,
  useAddCountedItem,
} from './hooks/useInventaire';
export { useInventaireStore } from './store/inventaireStore';
