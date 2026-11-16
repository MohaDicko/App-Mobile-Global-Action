// ─── Écran Impression Étiquettes ──────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Text, Portal, Modal, Divider, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@core/config/theme';
import { QuantityStepper, AppButton, AppModal } from '@shared/components/ui';
import { ArticleSearchBar } from '@shared/components';
import type { IArticle } from '@shared/types';
import { itemService } from '@shared/services';
import { useEtiquetteStore, type ILabelHistoryItem } from '@features/etiquettes/store/etiquetteStore';
import { etiquetteService } from '@features/etiquettes/services/etiquetteService';
import { extractSapErrorMessage } from '@shared/utils';
import LabelItem from '@features/etiquettes/components/LabelItem';

const formatHistoryDate = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

// ─── Composant ───────────────────────────────────────────────────────────────

const EtiquettesScreen = () => {
  // ── State local ──
  const [selectedArticle, setSelectedArticle] = useState<IArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [labelQty, setLabelQty] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [confirmClearListVisible, setConfirmClearListVisible] = useState(false);
  const [confirmClearHistoryVisible, setConfirmClearHistoryVisible] = useState(false);

  // ── Store Zustand (persistant) ──
  const labels = useEtiquetteStore((s) => s.labels);
  const history = useEtiquetteStore((s) => s.history);
  const addLabel = useEtiquetteStore((s) => s.addLabel);
  const removeLabel = useEtiquetteStore((s) => s.removeLabel);
  const updateQuantity = useEtiquetteStore((s) => s.updateQuantity);
  const clearLabels = useEtiquetteStore((s) => s.clearLabels);
  const restoreFromHistory = useEtiquetteStore((s) => s.restoreFromHistory);
  const restoreAllHistory = useEtiquetteStore((s) => s.restoreAllHistory);
  const removeHistoryItem = useEtiquetteStore((s) => s.removeHistoryItem);
  const clearHistory = useEtiquetteStore((s) => s.clearHistory);

  // ── Handlers ──
  // Récupère l'article complet (avec prix depuis ItemPrices) car la
  // recherche collection ne retourne pas ItemPrices
  const handleArticleSelect = useCallback(async (article: IArticle) => {
    setLoadingArticle(true);
    try {
      const full = await itemService.getByCode(article.ItemCode);
      setSelectedArticle(full);
    } catch {
      setSelectedArticle(article); // fallback si SAP inaccessible
    } finally {
      setLoadingArticle(false);
    }
    setLabelQty(1);
  }, []);

  const handleAddLabel = () => {
    if (!selectedArticle) return;

    addLabel({
      itemCode: selectedArticle.ItemCode,
      itemName: selectedArticle.ItemName,
      barcode: selectedArticle.BarCode,
      price: selectedArticle.price ?? 0,
      pcb: selectedArticle.U_PCB ?? null,
      quantity: labelQty,
    });

    setSelectedArticle(null);
    setLabelQty(1);
  };

  const handlePrint = async () => {
    if (labels.length === 0) return;
    setPrinting(true);
    try {
      await etiquetteService.printLabels(labels);
      // Ne jamais vider automatiquement les étiquettes après impression :
      // en cas de problème d'impression ou d'incident, l'utilisateur conserve sa liste.
      Toast.show({
        type: 'success',
        text1: 'Impression lancée',
        text2: 'Liste conservée — utilisez « Vider la liste » une fois terminé',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Erreur impression',
        text2: extractSapErrorMessage(error),
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleSharePDF = async () => {
    if (labels.length === 0) return;
    setPrinting(true);
    try {
      await etiquetteService.shareLabelsAsPDF(labels);
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Erreur PDF',
        text2: extractSapErrorMessage(error),
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleConfirmClearList = () => {
    clearLabels();
    setConfirmClearListVisible(false);
    Toast.show({
      type: 'info',
      text1: 'Liste vidée',
      text2: "Les articles restent disponibles dans l'Historique",
    });
  };

  const handleConfirmClearHistory = () => {
    clearHistory();
    setConfirmClearHistoryVisible(false);
    Toast.show({
      type: 'info',
      text1: 'Historique vidé',
      text2: "L'historique des étiquettes a été effacé",
    });
  };

  const handleRestoreOne = (entry: ILabelHistoryItem) => {
    restoreFromHistory(entry.itemCode);
    Toast.show({
      type: 'success',
      text1: 'Article restauré',
      text2: `${entry.itemCode} ajouté à la liste d'impression`,
    });
  };

  const handleRestoreAll = () => {
    restoreAllHistory();
    setHistoryVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Historique restauré',
      text2: "Tous les articles de l'historique ont été chargés",
    });
  };

  const totalLabels = labels.reduce((sum, l) => sum + l.quantity, 0);

  // ── Render ──
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerBrand, { backgroundColor: COLORS.pink }]} />
          <View style={styles.headerContent}>
            <View style={[styles.headerIconWrap, { backgroundColor: `${COLORS.pink}18` }]}>
              <MaterialCommunityIcons name="printer" size={22} color={COLORS.pink} />
            </View>
            <Text style={styles.headerTitle}>Impression Étiquettes</Text>
            <Pressable
              onPress={() => setHistoryVisible(true)}
              style={({ pressed }) => [
                styles.historyHeaderBtn,
                pressed && styles.historyHeaderBtnPressed,
              ]}
            >
              <MaterialCommunityIcons name="history" size={18} color={COLORS.primary} />
              <Text style={styles.historyHeaderBtnText}>
                Historique ({history.length})
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={labels}
          keyExtractor={(item) => item.itemCode}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <LabelItem
              label={item}
              onRemove={removeLabel}
              onUpdateQuantity={updateQuantity}
            />
          )}
          ListHeaderComponent={
            <View style={styles.formSection}>

              {/* Recherche article */}
              <View style={styles.searchSection}>
                <ArticleSearchBar
                  onArticleSelect={handleArticleSelect}
                  placeholder="Scanner ou rechercher un article..."
                />
              </View>

              {/* Chargement prix article */}
              {loadingArticle && (
                <Text style={styles.loadingPrice}>Récupération du prix...</Text>
              )}

              {/* Article sélectionné */}
              {selectedArticle && !loadingArticle && (
                <View style={styles.selectedSection}>
                  <View style={styles.articleInfo}>
                    <Text style={styles.articleCode}>
                      {selectedArticle.ItemCode}
                    </Text>
                    <Text style={styles.articleName} numberOfLines={2}>
                      {selectedArticle.ItemName}
                    </Text>
                    {(selectedArticle.price ?? 0) > 0 && (
                      <Text style={styles.articlePrice}>
                        {Math.round(selectedArticle.price!).toLocaleString('fr-FR')} FCFA
                      </Text>
                    )}
                    {selectedArticle.BarCode ? (
                      <View style={styles.barcodeRow}>
                        <MaterialCommunityIcons
                          name="barcode"
                          size={18}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.barcodeText}>
                          {selectedArticle.BarCode}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.noBarcode}>
                        Pas de code-barres associé
                      </Text>
                    )}
                  </View>

                  <QuantityStepper
                    value={labelQty}
                    onChange={setLabelQty}
                    min={1}
                    max={100}
                    label="Nombre d'étiquettes"
                  />

                  <View style={styles.addButtonContainer}>
                    <AppButton
                      label="AJOUTER À L'IMPRESSION"
                      onPress={handleAddLabel}
                      variant="primary"
                      icon="plus-circle"
                      fullWidth
                    />
                  </View>
                </View>
              )}

              {/* Titre liste + bouton Vider la liste manuellement */}
              {labels.length > 0 && (
                <View style={styles.cartHeader}>
                  <View style={styles.cartHeaderLeft}>
                    <MaterialCommunityIcons
                      name="tag-multiple"
                      size={20}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.cartTitle}>
                      Étiquettes à imprimer ({totalLabels})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setConfirmClearListVisible(true)}
                    style={({ pressed }) => [
                      styles.clearListBtn,
                      pressed && styles.clearListBtnPressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={16}
                      color={COLORS.danger}
                    />
                    <Text style={styles.clearListBtnText}>Vider la liste</Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            !selectedArticle ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="tag-outline"
                  size={48}
                  color={COLORS.textDisabled}
                />
                <Text style={styles.emptyTitle}>Aucune étiquette dans la liste</Text>
                <Text style={styles.emptySubtitle}>
                  Scannez un article ou consultez l'historique ({history.length}) pour recharger vos articles précédents
                </Text>
                {history.length > 0 && (
                  <View style={styles.emptyHistoryBtnWrap}>
                    <AppButton
                      label={`CONSULTER L'HISTORIQUE (${history.length})`}
                      onPress={() => setHistoryVisible(true)}
                      variant="outline"
                      icon="history"
                    />
                  </View>
                )}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />

        {/* Barre du bas — impression */}
        {labels.length > 0 && (
          <View style={styles.bottomBar}>
            <View style={styles.bottomInfo}>
              <Text style={styles.bottomLabel}>
                {labels.length} article{labels.length > 1 ? 's' : ''} — {totalLabels} étiquette{totalLabels > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <View style={styles.buttonFlex}>
                <AppButton
                  label="PARTAGER PDF"
                  onPress={handleSharePDF}
                  variant="outline"
                  loading={printing}
                  fullWidth
                  icon="file-pdf-box"
                />
              </View>
              <View style={styles.buttonFlex}>
                <AppButton
                  label="IMPRIMER"
                  onPress={handlePrint}
                  variant="primary"
                  loading={printing}
                  fullWidth
                  icon="printer"
                />
              </View>
            </View>
          </View>
        )}

        {/* Modale Historique des étiquettes flashées */}
        <Portal>
          <Modal
            visible={historyVisible}
            onDismiss={() => setHistoryVisible(false)}
            contentContainerStyle={styles.historyModal}
          >
            <View style={styles.historyModalHeader}>
              <View style={styles.historyModalTitleRow}>
                <MaterialCommunityIcons name="history" size={22} color={COLORS.primary} />
                <Text style={styles.historyModalTitle}>
                  Historique des étiquettes ({history.length})
                </Text>
              </View>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setHistoryVisible(false)}
              />
            </View>

            <Text style={styles.historyModalSubtitle}>
              Les articles flashés sont conservés automatiquement en cas d'incident d'impression. Vous pouvez les recharger ou vider l'historique manuellement.
            </Text>

            {history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <MaterialCommunityIcons
                  name="history"
                  size={40}
                  color={COLORS.textDisabled}
                />
                <Text style={styles.historyEmptyText}>
                  Aucun article dans l'historique
                </Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={history}
                  keyExtractor={(item) => item.itemCode}
                  style={styles.historyList}
                  ItemSeparatorComponent={() => <Divider />}
                  renderItem={({ item }) => (
                    <View style={styles.historyItem}>
                      <View style={styles.historyItemInfo}>
                        <Text style={styles.historyItemCode}>{item.itemCode}</Text>
                        <Text style={styles.historyItemName} numberOfLines={1}>
                          {item.itemName}
                        </Text>
                        <Text style={styles.historyItemMeta}>
                          {item.price > 0 ? `${Math.round(item.price).toLocaleString('fr-FR')} FCFA · ` : ''}
                          Qté : x{item.quantity}
                          {item.scannedAt ? ` · ${formatHistoryDate(item.scannedAt)}` : ''}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleRestoreOne(item)}
                        style={({ pressed }) => [
                          styles.restoreOneBtn,
                          pressed && styles.restoreOneBtnPressed,
                        ]}
                      >
                        <MaterialCommunityIcons name="plus-circle-outline" size={16} color={COLORS.primary} />
                        <Text style={styles.restoreOneBtnText}>Ajouter</Text>
                      </Pressable>
                      <IconButton
                        icon="trash-can-outline"
                        iconColor={COLORS.danger}
                        size={18}
                        onPress={() => removeHistoryItem(item.itemCode)}
                      />
                    </View>
                  )}
                />

                <View style={styles.historyModalActions}>
                  <AppButton
                    label="TOUT RESTAURER DANS LA LISTE"
                    onPress={handleRestoreAll}
                    variant="primary"
                    icon="restore"
                    fullWidth
                  />
                  <AppButton
                    label="VIDER L'HISTORIQUE"
                    onPress={() => setConfirmClearHistoryVisible(true)}
                    variant="outline"
                    icon="delete-sweep-outline"
                    fullWidth
                  />
                </View>
              </>
            )}
          </Modal>
        </Portal>

        {/* Confirmation vidage liste active */}
        <AppModal
          visible={confirmClearListVisible}
          title="Vider la liste d'impression ?"
          message={`Voulez-vous retirer les ${labels.length} article${labels.length > 1 ? 's' : ''} (${totalLabels} étiquette${totalLabels > 1 ? 's' : ''}) de la liste à imprimer ?\n\nVous pourrez toujours les retrouver dans l'Historique.`}
          confirmLabel="Vider la liste"
          onConfirm={handleConfirmClearList}
          onCancel={() => setConfirmClearListVisible(false)}
        />

        {/* Confirmation vidage historique */}
        <AppModal
          visible={confirmClearHistoryVisible}
          title="Vider tout l'historique ?"
          message={`Voulez-vous effacer définitivement l'historique des ${history.length} article${history.length > 1 ? 's' : ''} flashé${history.length > 1 ? 's' : ''} ?`}
          confirmLabel="Effacer l'historique"
          onConfirm={handleConfirmClearHistory}
          onCancel={() => setConfirmClearHistoryVisible(false)}
        />
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: COLORS.surface,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  headerBrand: { height: 4 },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  historyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}10`,
  },
  historyHeaderBtnPressed: {
    backgroundColor: `${COLORS.primary}24`,
  },
  historyHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  listContent: {
    flexGrow: 1,
  },
  formSection: {
    paddingHorizontal: 16,
  },
  searchSection: {
    marginBottom: 12,
  },
  selectedSection: {
    marginBottom: 16,
    gap: 12,
  },
  articleInfo: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
  },
  articleCode: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  articleName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  loadingPrice: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  articlePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  barcodeText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  noBarcode: {
    fontSize: 12,
    color: COLORS.textDisabled,
    fontStyle: 'italic',
    marginTop: 4,
  },
  addButtonContainer: {
    marginTop: 4,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  clearListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: `${COLORS.danger}10`,
  },
  clearListBtnPressed: {
    backgroundColor: `${COLORS.danger}24`,
  },
  clearListBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textDisabled,
    textAlign: 'center',
  },
  emptyHistoryBtnWrap: {
    marginTop: 12,
  },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bottomInfo: {
    marginBottom: 10,
  },
  bottomLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonFlex: {
    flex: 1,
  },
  historyModal: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  historyModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  historyModalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  historyEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  historyEmptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  historyList: {
    maxHeight: 340,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  historyItemInfo: {
    flex: 1,
  },
  historyItemCode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  historyItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  historyItemMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  restoreOneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}10`,
  },
  restoreOneBtnPressed: {
    backgroundColor: `${COLORS.primary}24`,
  },
  restoreOneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  historyModalActions: {
    marginTop: 14,
    gap: 8,
  },
});

export default EtiquettesScreen;
