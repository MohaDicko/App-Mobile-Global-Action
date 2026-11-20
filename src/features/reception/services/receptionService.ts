import { apiClient } from '@core/api/client';
import { ENDPOINTS } from '@core/api/endpoints';
import type {
  IPurchaseOrder,
  IPurchaseOrderLine,
  IPurchaseDeliveryNote,
  IPurchaseDeliveryNoteLine,
  ISapResponse,
} from '@shared/types';
import { buildPurchaseDeliveryNote } from '@shared/utils';

type ISapPurchaseOrderLine = IPurchaseOrderLine & {
  WhsCode?: string;
  OpenQty?: number;
  OpenQuantity?: number;
  OpenCreQty?: number;
  ReceivedQuantity?: number;
  LineStatus?: string;
};

// Cache mémoire court (2 min) pour éviter les appels N+1 répétés sur les détails de BC
const ORDER_DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;
const orderDetailCache = new Map<number, { data: IPurchaseOrder; timestamp: number }>();

const getCachedOrderDetail = (docEntry: number): IPurchaseOrder | null => {
  const cached = orderDetailCache.get(docEntry);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > ORDER_DETAIL_CACHE_TTL_MS) {
    orderDetailCache.delete(docEntry);
    return null;
  }
  return cached.data;
};

const setCachedOrderDetail = (order: IPurchaseOrder): void => {
  if (order?.DocEntry != null && Array.isArray(order.DocumentLines)) {
    orderDetailCache.set(order.DocEntry, { data: order, timestamp: Date.now() });
  }
};

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getLineWarehouseCode = (line: ISapPurchaseOrderLine): string => {
  const raw = line.WarehouseCode ?? line.WhsCode ?? '';
  return String(raw).trim().toUpperCase();
};

const getLineRemainingQty = (line: ISapPurchaseOrderLine): number => {
  if (line.LineStatus === 'bost_Close') return 0;

  const directCandidates = [
    line.RemainingOpenQuantity,
    line.OpenQty,
    line.OpenQuantity,
    line.OpenCreQty,
  ];

  for (const candidate of directCandidates) {
    const qty = toFiniteNumber(candidate);
    if (qty > 0) return qty;
  }

  const quantity = toFiniteNumber(line.Quantity);
  const delivered = toFiniteNumber(line.DeliveredQuantity ?? line.ReceivedQuantity);
  const computed = quantity - delivered;
  return computed > 0 ? computed : 0;
};

const hasOpenLineInWarehouse = (order: IPurchaseOrder, normalizedWhs: string): boolean => {
  const lines = (order.DocumentLines ?? []) as ISapPurchaseOrderLine[];
  return lines.some((line) => {
    const lineWhs = getLineWarehouseCode(line);
    const remainingQty = getLineRemainingQty(line);
    return lineWhs === normalizedWhs && remainingQty > 0;
  });
};

const fetchOpenOrdersList = async (): Promise<IPurchaseOrder[]> => {
  try {
    const { data } = await apiClient.get<ISapResponse<IPurchaseOrder>>(ENDPOINTS.PURCHASE_ORDERS_OPEN);
    const orders = data.value ?? [];
    orders.forEach(setCachedOrderDetail);
    return orders;
  } catch {
    const { data } = await apiClient.get<ISapResponse<IPurchaseOrder>>(ENDPOINTS.PURCHASE_ORDERS_OPEN_HEADERS);
    return data.value ?? [];
  }
};

const getOrderDetail = async (docEntry: number, forceRefresh = false): Promise<IPurchaseOrder> => {
  if (!forceRefresh) {
    const cached = getCachedOrderDetail(docEntry);
    if (cached && Array.isArray(cached.DocumentLines) && cached.DocumentLines.length > 0) {
      return cached;
    }
  }
  const { data } = await apiClient.get<IPurchaseOrder>(ENDPOINTS.PURCHASE_ORDER_DETAIL(docEntry));
  setCachedOrderDetail(data);
  return data;
};

const getOpenOrders = async (warehouseCode?: string): Promise<IPurchaseOrder[]> => {
  const hasWarehouse = !!warehouseCode?.trim();
  const normalizedWhs = hasWarehouse ? warehouseCode!.trim().toUpperCase() : '';

  const openOrders = await fetchOpenOrdersList();
  if (openOrders.length === 0) return [];

  if (!hasWarehouse) {
    return openOrders;
  }

  // Chemin rapide (0 requête supplémentaire) si SAP a déjà inclus DocumentLines dans la liste
  const ordersWithInlineLines: IPurchaseOrder[] = [];
  const ordersMissingLines: IPurchaseOrder[] = [];

  for (const order of openOrders) {
    if (Array.isArray(order.DocumentLines) && order.DocumentLines.length > 0) {
      ordersWithInlineLines.push(order);
    } else {
      const cached = getCachedOrderDetail(order.DocEntry);
      if (cached && Array.isArray(cached.DocumentLines) && cached.DocumentLines.length > 0) {
        ordersWithInlineLines.push(cached);
      } else {
        ordersMissingLines.push(order);
      }
    }
  }

  const matchedInline = ordersWithInlineLines.filter((o) =>
    hasOpenLineInWarehouse(o, normalizedWhs)
  );

  if (ordersMissingLines.length === 0) {
    return matchedInline;
  }

  // Repli par lots de 6 requêtes max en parallèle pour ne pas saturer SAP Service Layer
  const BATCH_SIZE = 6;
  const matchedFetched: IPurchaseOrder[] = [];

  for (let i = 0; i < ordersMissingLines.length; i += BATCH_SIZE) {
    const batch = ordersMissingLines.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (order) => {
        try {
          const detail = await getOrderDetail(order.DocEntry);
          return hasOpenLineInWarehouse(detail, normalizedWhs) ? detail : null;
        } catch {
          return null;
        }
      })
    );
    for (const res of results) {
      if (res) matchedFetched.push(res);
    }
  }

  return [...matchedInline, ...matchedFetched];
};

const createDeliveryNote = async (
  cardCode: string,
  lines: IPurchaseDeliveryNoteLine[],
  userName?: string,
  invoiceNumber?: string
): Promise<IPurchaseDeliveryNote> => {
  const body = buildPurchaseDeliveryNote(cardCode, lines, userName, invoiceNumber);
  const { data } = await apiClient.post<IPurchaseDeliveryNote>(
    ENDPOINTS.PURCHASE_DELIVERY_NOTES,
    body
  );
  orderDetailCache.clear();
  return data;
};

export const receptionService = {
  getOpenOrders,
  getOrderDetail,
  createDeliveryNote,
};
