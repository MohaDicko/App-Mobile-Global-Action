// ─── Sélecteur de bon de commande à réceptionner (optimisé & virtualisé) ─────
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  TouchableOpacity,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@core/config/theme';
import { useOpenOrdersForReception } from '../hooks/useReception';
import type { IPurchaseOrder } from '@shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (sapDate: string) => {
  if (!sapDate) return '';
  return new Date(sapDate).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatTotal = (total?: number) => {
  if (total == null) return '';
  return total.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' FCFA';
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface IOrderSelectorProps {
  selectedDocEntry: number | null;
  onSelect: (order: IPurchaseOrder) => void;
  warehouseCode?: string;
}

// ─── Sous-composant mémorisé : item enrichi de liste ─────────────────────────

const OrderMenuItem = React.memo(
  ({
    order,
    isSelected,
    onPress,
  }: {
    order: IPurchaseOrder;
    isSelected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.menuItem, isSelected && styles.menuItemSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Ligne 1 : N° BC + date comptabilisation */}
      <View style={styles.menuItemHeader}>
        <Text style={[styles.menuItemNum, isSelected && styles.menuItemNumSelected]}>
          BC {order.DocNum}
        </Text>
        <View style={styles.menuItemDates}>
          <Text style={styles.menuItemDate}>📅 {formatDate(order.DocDate)}</Text>
          {order.DocDueDate && (
            <Text style={styles.menuItemDueDate}>🚚 {formatDate(order.DocDueDate)}</Text>
          )}
        </View>
      </View>

      {/* Ligne 2 : Fournisseur */}
      <Text style={styles.menuItemSupplier} numberOfLines={1}>
        {order.CardCode} — {order.CardName}
      </Text>

      {/* Ligne 3 : Réf fournisseur + total */}
      <View style={styles.menuItemFooter}>
        {order.NumAtCard ? (
          <Text style={styles.menuItemRef}>Réf frs : {order.NumAtCard}</Text>
        ) : (
          <Text style={styles.menuItemRefEmpty}>Sans réf. fournisseur</Text>
        )}
        {order.DocTotal != null && (
          <Text style={styles.menuItemTotal}>{formatTotal(order.DocTotal)}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
);

// ─── Composant principal ──────────────────────────────────────────────────────

const OrderSelector = ({ selectedDocEntry, onSelect, warehouseCode }: IOrderSelectorProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const { data: orders = [], isLoading } = useOpenOrdersForReception(warehouseCode);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.DocEntry === selectedDocEntry),
    [orders, selectedDocEntry]
  );

  const displayText = selectedOrder
    ? `BC ${selectedOrder.DocNum} — ${selectedOrder.CardName}`
    : 'Sélectionner un bon de commande';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        String(o.DocNum).includes(q) ||
        (o.CardName ?? '').toLowerCase().includes(q) ||
        (o.CardCode ?? '').toLowerCase().includes(q) ||
        (o.NumAtCard ?? '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const handleSelectOrder = useCallback(
    (order: IPurchaseOrder) => {
      setModalVisible(false);
      setSearch('');
      onSelect(order);
    },
    [onSelect]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Bon de commande</Text>

      <Pressable
        style={styles.selector}
        onPress={() => {
          setSearch('');
          setModalVisible(true);
        }}
      >
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingHint}>Chargement des bons de commande...</Text>
          </View>
        ) : (
          <>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={20}
              color={COLORS.textSecondary}
            />
            <View style={styles.selectorTextWrap}>
              <Text
                style={[styles.selectorText, !selectedOrder && styles.placeholder]}
                numberOfLines={1}
              >
                {displayText}
              </Text>
              {selectedOrder && (
                <Text style={styles.selectorSub} numberOfLines={1}>
                  {formatDate(selectedOrder.DocDate)}
                  {selectedOrder.NumAtCard ? `  •  Réf: ${selectedOrder.NumAtCard}` : ''}
                  {selectedOrder.DocTotal != null ? `  •  ${formatTotal(selectedOrder.DocTotal)}` : ''}
                </Text>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-down"
              size={24}
              color={COLORS.textSecondary}
            />
          </>
        )}
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setModalVisible(false);
          setSearch('');
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              setModalVisible(false);
              setSearch('');
            }}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={styles.modalTitle}>
                  Bons de commande ouverts ({filtered.length})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSearch('');
                }}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
              <RNTextInput
                style={styles.searchInput}
                placeholder="N° BC, fournisseur, réf..."
                placeholderTextColor={COLORS.placeholder}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.DocEntry)}
              style={styles.orderList}
              contentContainerStyle={styles.orderListContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={15}
              windowSize={5}
              renderItem={({ item }) => (
                <OrderMenuItem
                  order={item}
                  isSelected={item.DocEntry === selectedDocEntry}
                  onPress={() => handleSelectOrder(item)}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyMenu}>
                  <MaterialCommunityIcons
                    name="file-search-outline"
                    size={36}
                    color={COLORS.textDisabled}
                  />
                  <Text style={styles.emptyText}>Aucun bon de commande ouvert trouvé</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  selectorTextWrap: {
    flex: 1,
    gap: 2,
  },
  selectorText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  selectorSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  placeholder: {
    color: COLORS.placeholder,
    fontWeight: '400',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  orderList: {
    flexGrow: 0,
    maxHeight: 380,
  },
  orderListContent: {
    paddingBottom: 8,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F9FAFB',
    gap: 4,
  },
  menuItemSelected: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuItemNum: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  menuItemNumSelected: {
    color: COLORS.primary,
  },
  menuItemDates: {
    alignItems: 'flex-end',
    gap: 2,
  },
  menuItemDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  menuItemDueDate: {
    fontSize: 11,
    color: COLORS.orange,
    fontWeight: '600',
  },
  menuItemSupplier: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  menuItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  menuItemRef: {
    fontSize: 12,
    color: COLORS.blue,
    fontStyle: 'italic',
  },
  menuItemRefEmpty: {
    fontSize: 12,
    color: COLORS.placeholder,
    fontStyle: 'italic',
  },
  menuItemTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptyMenu: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default OrderSelector;
