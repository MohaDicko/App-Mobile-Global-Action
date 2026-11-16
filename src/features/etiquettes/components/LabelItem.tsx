// ─── Ligne d'étiquette à imprimer ────────────────────────────────────────────
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { COLORS } from '@core/config/theme';
import type { ILabelData } from '../services/etiquetteService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ILabelItemProps {
  label: ILabelData;
  onRemove: (itemCode: string) => void;
  onUpdateQuantity?: (itemCode: string, quantity: number) => void;
}

// ─── Composant ───────────────────────────────────────────────────────────────

const LabelItem = ({ label, onRemove, onUpdateQuantity }: ILabelItemProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.itemCode}>{label.itemCode}</Text>
        <Text style={styles.itemName} numberOfLines={1}>
          {label.itemName}
        </Text>
        {label.price > 0 && (
          <Text style={styles.price}>
            {Math.round(label.price).toLocaleString('fr-FR')} FCFA
          </Text>
        )}
        {label.barcode ? (
          <Text style={styles.barcode}>{label.barcode}</Text>
        ) : (
          <Text style={styles.noBarcode}>Pas de code-barres</Text>
        )}
      </View>

      {onUpdateQuantity ? (
        <View style={styles.stepperWrap}>
          <IconButton
            icon="minus"
            size={16}
            iconColor={COLORS.primary}
            style={styles.stepperBtn}
            onPress={() => onUpdateQuantity(label.itemCode, label.quantity - 1)}
          />
          <View style={styles.quantityBadge}>
            <Text style={styles.quantityText}>x{label.quantity}</Text>
          </View>
          <IconButton
            icon="plus"
            size={16}
            iconColor={COLORS.primary}
            style={styles.stepperBtn}
            onPress={() => onUpdateQuantity(label.itemCode, label.quantity + 1)}
          />
        </View>
      ) : (
        <View style={styles.quantityBadge}>
          <Text style={styles.quantityText}>x{label.quantity}</Text>
        </View>
      )}

      <IconButton
        icon="trash-can-outline"
        iconColor={COLORS.danger}
        size={22}
        onPress={() => onRemove(label.itemCode)}
        style={styles.deleteButton}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: 56,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  itemCode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  itemName: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 3,
  },
  barcode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  noBarcode: {
    fontSize: 11,
    color: COLORS.textDisabled,
    fontStyle: 'italic',
    marginTop: 4,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  stepperBtn: {
    margin: 0,
    width: 28,
    height: 28,
  },
  quantityBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.blue,
  },
  deleteButton: {
    margin: 0,
  },
});

export default LabelItem;
