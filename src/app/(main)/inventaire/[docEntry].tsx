// ─── Écran Comptage Inventaire — flux "terrain" & validation au fur et à mesure
import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, Portal, Modal, Button, IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { COLORS } from '@core/config/theme';
import { AppButton, QuantityStepper } from '@shared/components/ui';
import { ArticleSearchBar } from '@shared/components';
import {
  useCountingDetail,
  useBinLocations,
  useWarehouseBins,
  useAddCountedItem,
  useUpdateCountedLine,
  useSaveCountedLines,
} from '@features/inventaire/hooks/useInventaire';
import { useAuthStore } from '@core/auth/authStore';
import type { IArticle, IInventoryCountingLine } from '@shared/types';

type FilterModeT = 'all' | 'uncounted' | 'counted';

// ─── Composant ───────────────────────────────────────────────────────────────

const CountingDetailScreen = () => {
  const { docEntry: docEntryParam } = useLocalSearchParams<{ docEntry: string }>();
  const docEntry = docEntryParam ? parseInt(docEntryParam, 10) : null;

  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const userWarehouse = useAuthStore((s) => s.user?.warehouseCode ?? '');

  // ── État du formulaire de saisie (Qté minimum = 0) ──
  const listRef = useRef<FlatList<IInventoryCountingLine>>(null);
  const [selectedArticle, setSelectedArticle] = useState<IArticle | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [selectedBinEntry, setSelectedBinEntry] = useState<number | undefined>(undefined);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<FilterModeT>('all');

  // Modifications saisies directement sur les lignes pour validation au fur et à mesure
  const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});

  // Article déjà compté au même emplacement → l'opérateur choisit : additionner ou remplacer
  const [duplicate, setDuplicate] = useState<{
    line: IInventoryCountingLine;
    newQty: number;
  } | null>(null);

  // ── Données SAP ──
  const { data: doc, isLoading, refetch, isRefetching } = useCountingDetail(docEntry);

  const warehouseCode = doc?.InventoryCountingLines[0]?.WarehouseCode ?? '';

  const wrongWarehouse =
    !isAdmin && warehouseCode.length > 0 && userWarehouse !== warehouseCode;
  const { data: warehouseBins = [] } = useWarehouseBins(warehouseCode);
  const { mutate: addItem, isPending: isAdding } = useAddCountedItem();
  const { mutate: updateLine, isPending: isUpdatingLine } = useUpdateCountedLine();
  const { mutate: saveLinesBatch, isPending: isSavingBatch } = useSaveCountedLines();

  const documentLines = useMemo(() => {
    const lines = doc?.InventoryCountingLines ?? [];
    const isPlaceholderOnly =
      lines.length === 1 && lines[0].Counted === 'tNO' && lines[0].ItemCode === 'A09541';
    return isPlaceholderOnly ? [] : lines.filter((l) => l.ItemCode !== 'A09541');
  }, [doc]);

  const countedLines = useMemo(
    () => documentLines.filter((l) => l.Counted === 'tYES'),
    [documentLines]
  );

  const uncountedLines = useMemo(
    () => documentLines.filter((l) => l.Counted !== 'tYES'),
    [documentLines]
  );

  const displayedLines = useMemo(() => {
    if (filterMode === 'counted') return countedLines;
    if (filterMode === 'uncounted') return uncountedLines;
    return documentLines;
  }, [filterMode, documentLines, countedLines, uncountedLines]);

  const pendingEntries = useMemo(
    () =>
      Object.entries(pendingCounts).map(([lineNumStr, qty]) => ({
        lineNumber: Number(lineNumStr),
        quantity: qty,
      })),
    [pendingCounts]
  );

  // Résolution BinEntry → BinCode pour l'affichage des lignes comptées
  const lineBinEntries = useMemo(
    () => [
      ...new Set(
        documentLines
          .map((l) => l.BinEntry)
          .filter((b): b is number => b !== null)
      ),
    ],
    [documentLines]
  );
  const { data: binMap = new Map() } = useBinLocations(lineBinEntries);

  const hasBins = warehouseBins.length > 0;

  const shortBinLabel = useCallback((fullCode: string) => {
    const dashIdx = fullCode.indexOf('-');
    return dashIdx >= 0 ? fullCode.slice(dashIdx + 1) : fullCode;
  }, []);

  const getLineBinLabel = useCallback(
    (line: IInventoryCountingLine) => {
      if (line.BinEntry === null) return null;
      const code = binMap.get(line.BinEntry);
      return code ? shortBinLabel(code) : `#${line.BinEntry}`;
    },
    [binMap, shortBinLabel]
  );

  // ── Handlers ──
  const handleArticleSelect = useCallback(
    (article: IArticle) => {
      const matchLine = documentLines.find(
        (l) =>
          l.ItemCode === article.ItemCode &&
          (selectedBinEntry === undefined || (l.BinEntry ?? undefined) === selectedBinEntry)
      ) ?? documentLines.find((l) => l.ItemCode === article.ItemCode);

      setSelectedLineNumber(matchLine ? matchLine.LineNumber : null);
      if (matchLine?.BinEntry != null) {
        setSelectedBinEntry(matchLine.BinEntry);
      }
      setSelectedArticle(article);
      // Qté minimum fixée à 0 (et non 1)
      setQuantity(matchLine && matchLine.Counted === 'tYES' ? matchLine.CountedQuantity : 0);
    },
    [documentLines, selectedBinEntry]
  );

  const handleLinePress = useCallback(
    (line: IInventoryCountingLine) => {
      const pendingQty = pendingCounts[line.LineNumber];
      setSelectedLineNumber(line.LineNumber);
      setSelectedBinEntry(line.BinEntry ?? undefined);
      // Qté minimum à 0 : si non compté, on initialise à 0 (ou à la valeur en attente)
      setQuantity(
        pendingQty !== undefined
          ? pendingQty
          : line.Counted === 'tYES'
            ? line.CountedQuantity
            : 0
      );
      setSelectedArticle({
        ItemCode: line.ItemCode,
        ItemName: line.ItemDescription,
        BarCode: line.BarCode,
        ItemsGroupCode: 0,
        QuantityOnStock: 0,
        QuantityOrderedFromVendors: 0,
        QuantityOrderedByCustomers: 0,
        InventoryUOM: line.UoMCode ?? '',
        U_rayon: null,
        U_sous_fam: null,
        U_PCB: null,
      });
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    },
    [pendingCounts]
  );

  /** Modification rapide de la quantité directement sur une ligne (min = 0) */
  const handleInlineQtyChange = useCallback(
    (line: IInventoryCountingLine, nextQty: number) => {
      const clamped = Math.max(0, nextQty);
      setPendingCounts((prev) => ({
        ...prev,
        [line.LineNumber]: clamped,
      }));
    },
    []
  );

  /** Validation immédiate d'une ligne individuelle au fur et à mesure */
  const handleValidateSingleLine = useCallback(
    (line: IInventoryCountingLine) => {
      if (!docEntry) return;
      const qtyToSave =
        pendingCounts[line.LineNumber] !== undefined
          ? pendingCounts[line.LineNumber]
          : line.Counted === 'tYES'
            ? line.CountedQuantity
            : 0;

      updateLine(
        { docEntry, lineNumber: line.LineNumber, quantity: Math.max(0, qtyToSave) },
        {
          onSuccess: () => {
            setPendingCounts((prev) => {
              const next = { ...prev };
              delete next[line.LineNumber];
              return next;
            });
            if (selectedLineNumber === line.LineNumber) {
              setSelectedArticle(null);
              setSelectedLineNumber(null);
              setQuantity(0);
            }
          },
        }
      );
    },
    [docEntry, pendingCounts, updateLine, selectedLineNumber]
  );

  /** Validation du document au fur et à mesure (enregistre toutes les saisies en cours dans SAP) */
  const handleValidateDocumentProgress = () => {
    if (!docEntry) return;

    // Si un article est en cours de saisie dans le formulaire du haut, l'inclure aussi
    const batchMap = new Map<number, number>();
    for (const entry of pendingEntries) {
      batchMap.set(entry.lineNumber, Math.max(0, entry.quantity));
    }

    if (selectedArticle) {
      const existing =
        documentLines.find(
          (l) =>
            l.ItemCode === selectedArticle.ItemCode &&
            (l.BinEntry ?? undefined) === selectedBinEntry
        ) ??
        (selectedLineNumber !== null
          ? documentLines.find((l) => l.LineNumber === selectedLineNumber)
          : undefined);

      if (existing) {
        batchMap.set(existing.LineNumber, Math.max(0, quantity));
      }
    }

    const updates = Array.from(batchMap.entries()).map(([lineNumber, qty]) => ({
      lineNumber,
      quantity: qty,
    }));

    if (updates.length > 0) {
      saveLinesBatch(
        { docEntry, updates },
        {
          onSuccess: () => {
            setPendingCounts({});
            setSelectedArticle(null);
            setSelectedLineNumber(null);
            setQuantity(0);
          },
        }
      );
      return;
    }

    // Si aucune modification locale n'est en attente mais que des lignes déjà comptées existent
    if (countedLines.length > 0) {
      const countedUpdates = countedLines.map((l) => ({
        lineNumber: l.LineNumber,
        quantity: Math.max(0, l.CountedQuantity),
      }));
      saveLinesBatch({ docEntry, updates: countedUpdates });
      return;
    }

    Toast.show({
      type: 'info',
      text1: 'Aucune ligne à valider',
      text2: 'Saisissez ou validez au moins une ligne (même à quantité 0) pour enregistrer',
    });
  };

  const handleAdd = () => {
    if (!docEntry || !selectedArticle || !warehouseCode) return;

    const existing =
      documentLines.find(
        (l) =>
          l.ItemCode === selectedArticle.ItemCode &&
          (l.BinEntry ?? undefined) === selectedBinEntry
      ) ??
      (selectedLineNumber !== null
        ? documentLines.find((l) => l.LineNumber === selectedLineNumber)
        : undefined);

    if (existing?.Counted === 'tYES' && existing.LineNumber !== selectedLineNumber) {
      setDuplicate({ line: existing, newQty: Math.max(0, quantity) });
      return;
    }

    if (existing) {
      updateLine(
        { docEntry, lineNumber: existing.LineNumber, quantity: Math.max(0, quantity) },
        {
          onSuccess: () => {
            setPendingCounts((prev) => {
              const next = { ...prev };
              delete next[existing.LineNumber];
              return next;
            });
            setSelectedArticle(null);
            setSelectedLineNumber(null);
            setQuantity(0);
          },
        }
      );
      return;
    }

    addItem(
      {
        docEntry,
        itemCode: selectedArticle.ItemCode,
        quantity: Math.max(0, quantity),
        binEntry: selectedBinEntry,
        warehouseCode,
      },
      {
        onSuccess: () => {
          setSelectedArticle(null);
          setSelectedLineNumber(null);
          setQuantity(0);
        },
      }
    );
  };

  /** Résolution du doublon — cumul ou remplacement (y compris par 0) */
  const handleDuplicateResolve = (mode: 'add' | 'replace') => {
    if (!docEntry || !duplicate) return;
    const newQuantity =
      mode === 'add'
        ? duplicate.line.CountedQuantity + duplicate.newQty
        : Math.max(0, duplicate.newQty);
    updateLine(
      { docEntry, lineNumber: duplicate.line.LineNumber, quantity: newQuantity },
      {
        onSuccess: () => {
          setDuplicate(null);
          setSelectedArticle(null);
          setSelectedLineNumber(null);
          setQuantity(0);
        },
        onError: () => setDuplicate(null),
      }
    );
  };

  const binMissing = hasBins && selectedBinEntry === undefined;

  // Qté minimum = 0 autorisée (quantity >= 0)
  const canAdd =
    selectedArticle !== null &&
    quantity >= 0 &&
    warehouseCode.length > 0 &&
    !wrongWarehouse &&
    !binMissing &&
    !isAdding &&
    !isUpdatingLine &&
    !isSavingBatch;

  // ── Render loading / erreur ──
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Chargement du document...</Text>
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Document introuvable</Text>
        <AppButton label="Retour" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  const countDate = new Date(doc.CountDate).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const progressRatio =
    documentLines.length > 0 ? countedLines.length / documentLines.length : 0;
  const progressPercent = Math.round(progressRatio * 100);

  // ── Render ──
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerBrand, { backgroundColor: COLORS.blue }]} />
          <View style={styles.headerContent}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.textPrimary} />
            </Pressable>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>Inventaire N°{doc.DocumentNumber}</Text>
              <Text style={styles.headerSub}>
                {countDate}
                {warehouseCode ? ` · Magasin ${warehouseCode}` : ''}
              </Text>
            </View>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {countedLines.length}/{documentLines.length}
              </Text>
            </View>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={displayedLines}
          keyExtractor={(item) => String(item.LineNumber)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.blue}
              colors={[COLORS.blue]}
            />
          }
          ListHeaderComponent={
            <View style={styles.formSection}>
              {!warehouseCode || wrongWarehouse ? (
                <View style={styles.warnBox}>
                  <MaterialCommunityIcons name="alert-outline" size={16} color={COLORS.orange} />
                  <Text style={styles.warnText}>
                    {wrongWarehouse
                      ? `Cet inventaire concerne le magasin ${warehouseCode} - votre compte est rattaché à ${userWarehouse || 'aucun magasin'}.`
                      : 'Impossible de déterminer le magasin de cet inventaire (document sans ligne).'}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Recherche / scan article */}
                  <ArticleSearchBar
                    onArticleSelect={handleArticleSelect}
                    placeholder="Scanner ou rechercher l'article à compter..."
                    hideStock
                  />

                  {/* Article sélectionné → quantité (min 0) + emplacement + valider */}
                  {selectedArticle && (
                    <View style={styles.articleCard}>
                      <View style={styles.articleCardHeader}>
                        <View style={styles.articleInfo}>
                          <Text style={styles.articleCode}>{selectedArticle.ItemCode}</Text>
                          <Text style={styles.articleName} numberOfLines={2}>
                            {selectedArticle.ItemName}
                          </Text>
                          {selectedArticle.BarCode ? (
                            <Text style={styles.articleBarcode}>{selectedArticle.BarCode}</Text>
                          ) : null}
                        </View>
                        <IconButton
                          icon="close"
                          size={18}
                          onPress={() => {
                            setSelectedArticle(null);
                            setSelectedLineNumber(null);
                            setQuantity(0);
                          }}
                        />
                      </View>

                      <QuantityStepper
                        value={quantity}
                        onChange={setQuantity}
                        min={0}
                        label="Quantité comptée (min : 0)"
                      />

                      {/* Emplacement — uniquement si le magasin en a */}
                      {hasBins && (
                        <View style={styles.binSection}>
                          <Text style={styles.binLabel}>
                            Emplacement du comptage <Text style={styles.binRequired}>*</Text>
                          </Text>
                          {binMissing && (
                            <Text style={styles.binHint}>
                              Ce magasin gère les emplacements - sélectionnez celui où vous comptez
                            </Text>
                          )}
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.binChips}
                          >
                            {warehouseBins.map((bin) => {
                              const active = selectedBinEntry === bin.AbsEntry;
                              return (
                                <Pressable
                                  key={bin.AbsEntry}
                                  style={[styles.binChip, active && styles.binChipActive]}
                                  onPress={() =>
                                    setSelectedBinEntry(active ? undefined : bin.AbsEntry)
                                  }
                                >
                                  <MaterialCommunityIcons
                                    name="map-marker-outline"
                                    size={14}
                                    color={active ? COLORS.white : COLORS.blue}
                                  />
                                  <Text
                                    style={[
                                      styles.binChipText,
                                      active && styles.binChipTextActive,
                                    ]}
                                  >
                                    {shortBinLabel(bin.BinCode)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}

                      <AppButton
                        label={
                          isAdding || isUpdatingLine
                            ? 'ENREGISTREMENT...'
                            : selectedLineNumber !== null
                              ? `VALIDER CETTE LIGNE (QTÉ : ${quantity})`
                              : `AJOUTER AU COMPTAGE (QTÉ : ${quantity})`
                        }
                        onPress={handleAdd}
                        variant="primary"
                        icon="check-circle-outline"
                        fullWidth
                        disabled={!canAdd}
                      />
                    </View>
                  )}
                </>
              )}

              {/* Bloc d'avancement + filtres Comptés / Non comptés */}
              {documentLines.length > 0 && (
                <View style={styles.progressCard}>
                  <View style={styles.progressTopRow}>
                    <Text style={styles.progressTitle}>
                      Avancement du comptage ({progressPercent}%)
                    </Text>
                    <View style={styles.progressCountersRow}>
                      <View style={styles.counterBadgeCounted}>
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={14}
                          color={COLORS.primary}
                        />
                        <Text style={styles.counterTextCounted}>
                          Comptés : {countedLines.length}
                        </Text>
                      </View>
                      <View style={styles.counterBadgeUncounted}>
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={14}
                          color={COLORS.orange}
                        />
                        <Text style={styles.counterTextUncounted}>
                          Non comptés : {uncountedLines.length}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Barre de progression */}
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, Math.max(0, progressPercent))}%` },
                      ]}
                    />
                  </View>

                  {/* Onglets de filtre pour distinguer Comptés et Non comptés */}
                  <View style={styles.filterTabsRow}>
                    <Pressable
                      onPress={() => setFilterMode('all')}
                      style={[
                        styles.filterTab,
                        filterMode === 'all' && styles.filterTabActiveAll,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterTabText,
                          filterMode === 'all' && styles.filterTabTextActiveAll,
                        ]}
                      >
                        Tous ({documentLines.length})
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setFilterMode('uncounted')}
                      style={[
                        styles.filterTab,
                        filterMode === 'uncounted' && styles.filterTabActiveUncounted,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="clock-outline"
                        size={14}
                        color={filterMode === 'uncounted' ? COLORS.white : COLORS.orange}
                      />
                      <Text
                        style={[
                          styles.filterTabText,
                          filterMode === 'uncounted' && styles.filterTabTextActiveUncounted,
                        ]}
                      >
                        Non comptés ({uncountedLines.length})
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setFilterMode('counted')}
                      style={[
                        styles.filterTab,
                        filterMode === 'counted' && styles.filterTabActiveCounted,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={14}
                        color={filterMode === 'counted' ? COLORS.white : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.filterTabText,
                          filterMode === 'counted' && styles.filterTabTextActiveCounted,
                        ]}
                      >
                        Comptés ({countedLines.length})
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          }
          renderItem={({ item: line }) => {
            const binLabel = getLineBinLabel(line);
            const isCounted = line.Counted === 'tYES';
            const hasPending = pendingCounts[line.LineNumber] !== undefined;
            const currentQty = hasPending
              ? pendingCounts[line.LineNumber]
              : isCounted
                ? line.CountedQuantity
                : 0;

            return (
              <View
                style={[
                  styles.lineCard,
                  isCounted ? styles.lineCardCounted : styles.lineCardUncounted,
                  hasPending && styles.lineCardPending,
                  selectedLineNumber === line.LineNumber && styles.lineCardSelected,
                ]}
              >
                {/* Partie haute de la ligne : statut + infos article */}
                <Pressable
                  onPress={() => handleLinePress(line)}
                  style={styles.lineTopPressable}
                >
                  <View style={styles.lineCheck}>
                    <MaterialCommunityIcons
                      name={
                        hasPending
                          ? 'pencil-circle'
                          : isCounted
                            ? 'check-circle'
                            : 'clock-outline'
                      }
                      size={22}
                      color={
                        hasPending
                          ? COLORS.blue
                          : isCounted
                            ? COLORS.primary
                            : COLORS.orange
                      }
                    />
                  </View>

                  <View style={styles.lineInfo}>
                    <View style={styles.lineCodeStatusRow}>
                      <Text style={styles.lineCode}>{line.ItemCode}</Text>
                      <View
                        style={[
                          styles.statusPill,
                          hasPending
                            ? styles.statusPillPending
                            : isCounted
                              ? styles.statusPillCounted
                              : styles.statusPillUncounted,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            hasPending
                              ? styles.statusPillTextPending
                              : isCounted
                                ? styles.statusPillTextCounted
                                : styles.statusPillTextUncounted,
                          ]}
                        >
                          {hasPending
                            ? 'MODIFIÉ (À VALIDER)'
                            : isCounted
                              ? '✓ COMPTÉ'
                              : 'NON COMPTÉ'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.ItemDescription}
                    </Text>

                    {binLabel ? (
                      <View style={styles.lineMetaRow}>
                        <MaterialCommunityIcons
                          name="map-marker-outline"
                          size={12}
                          color={COLORS.textSecondary}
                        />
                        <Text style={styles.lineMeta}>{binLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>

                {/* Partie basse de la ligne : saisie directe Qté (min 0) + validation au fur et à mesure */}
                <View style={styles.lineActionsRow}>
                  <View style={styles.inlineStepper}>
                    <IconButton
                      icon="minus"
                      size={16}
                      mode="contained"
                      containerColor={COLORS.background}
                      iconColor={COLORS.textPrimary}
                      disabled={currentQty <= 0 || isUpdatingLine || isSavingBatch}
                      onPress={() => handleInlineQtyChange(line, currentQty - 1)}
                      style={styles.inlineStepBtn}
                    />
                    <Pressable
                      onPress={() => handleLinePress(line)}
                      style={styles.inlineQtyBox}
                    >
                      <Text
                        style={[
                          styles.inlineQtyValue,
                          isCounted && !hasPending && styles.inlineQtyValueCounted,
                          !isCounted && !hasPending && styles.inlineQtyValueUncounted,
                        ]}
                      >
                        {currentQty}
                      </Text>
                      <Text style={styles.inlineQtySub}>
                        {isCounted || hasPending ? 'Qté comptée' : 'Qté (min 0)'}
                      </Text>
                    </Pressable>
                    <IconButton
                      icon="plus"
                      size={16}
                      mode="contained"
                      containerColor={COLORS.primary}
                      iconColor={COLORS.white}
                      disabled={isUpdatingLine || isSavingBatch}
                      onPress={() => handleInlineQtyChange(line, currentQty + 1)}
                      style={styles.inlineStepBtn}
                    />
                  </View>

                  <Pressable
                    onPress={() => handleValidateSingleLine(line)}
                    disabled={isUpdatingLine || isSavingBatch}
                    style={({ pressed }) => [
                      styles.lineValidateBtn,
                      isCounted && !hasPending
                        ? styles.lineValidateBtnCounted
                        : styles.lineValidateBtnAction,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isCounted && !hasPending ? 'check-all' : 'check-bold'}
                      size={15}
                      color={isCounted && !hasPending ? COLORS.primary : COLORS.white}
                    />
                    <Text
                      style={[
                        styles.lineValidateBtnText,
                        isCounted && !hasPending && styles.lineValidateBtnTextCounted,
                      ]}
                    >
                      {hasPending
                        ? `Valider (${currentQty})`
                        : isCounted
                          ? `Validé (${line.CountedQuantity})`
                          : `Valider (${currentQty})`}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            warehouseCode && !wrongWarehouse ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={44}
                  color={COLORS.textDisabled}
                />
                <Text style={styles.emptyTitle}>
                  {filterMode === 'uncounted'
                    ? 'Tous les articles ont été comptés !'
                    : filterMode === 'counted'
                      ? 'Aucun article compté pour le moment'
                      : 'Aucun article dans ce document'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {filterMode === 'counted'
                    ? 'Scannez un article ou utilisez l’onglet « Non comptés » pour saisir vos quantités (à partir de 0).'
                    : 'Scannez ou recherchez un article pour continuer le comptage.'}
                </Text>
              </View>
            ) : null
          }
        />

        {/* Barre du bas — Valider le document au fur et à mesure */}
        {warehouseCode && !wrongWarehouse && documentLines.length > 0 && (
          <View style={styles.footer}>
            <View style={styles.footerInfoRow}>
              <Text style={styles.footerInfoText}>
                {countedLines.length}/{documentLines.length} comptés
                {pendingEntries.length > 0
                  ? ` · ${pendingEntries.length} ligne${pendingEntries.length > 1 ? 's' : ''} à enregistrer`
                  : ''}
              </Text>
              <Text style={styles.footerSubText}>
                Validation partielle ou complète autorisée
              </Text>
            </View>
            <AppButton
              label={
                isSavingBatch || isUpdatingLine
                  ? 'VALIDATION EN COURS...'
                  : pendingEntries.length > 0
                    ? `VALIDER AU FUR ET À MESURE (${pendingEntries.length})`
                    : `VALIDER L'AVANCEMENT (${countedLines.length}/${documentLines.length})`
              }
              onPress={handleValidateDocumentProgress}
              variant="primary"
              icon="content-save-check-outline"
              fullWidth
              loading={isSavingBatch}
              disabled={isSavingBatch || isUpdatingLine}
            />
          </View>
        )}

        {/* Article déjà compté — additionner ou remplacer */}
        <Portal>
          <Modal
            visible={duplicate !== null}
            onDismiss={() => setDuplicate(null)}
            contentContainerStyle={styles.dupModal}
          >
            <Text style={styles.dupTitle}>Article déjà compté</Text>
            <Text style={styles.dupMessage}>
              <Text style={styles.dupCode}>{duplicate?.line.ItemCode}</Text>
              {duplicate?.line.BinEntry != null
                ? ` (${getLineBinLabel(duplicate.line) ?? ''})`
                : ''}{' '}
              a déjà été compté : {duplicate?.line.CountedQuantity ?? 0}.
              {'\n'}Que faire avec la quantité {duplicate?.newQty ?? 0} saisie ?
            </Text>
            <View style={styles.dupActions}>
              <Button
                mode="outlined"
                onPress={() => setDuplicate(null)}
                disabled={isUpdatingLine}
                textColor={COLORS.textSecondary}
                style={styles.dupBtn}
              >
                Annuler
              </Button>
              <Button
                mode="outlined"
                onPress={() => handleDuplicateResolve('replace')}
                disabled={isUpdatingLine}
                textColor={COLORS.orange}
                style={styles.dupBtn}
              >
                {`Remplacer (→ ${duplicate?.newQty ?? 0})`}
              </Button>
              <Button
                mode="contained"
                onPress={() => handleDuplicateResolve('add')}
                loading={isUpdatingLine}
                disabled={isUpdatingLine}
                buttonColor={COLORS.primary}
                textColor={COLORS.white}
                style={styles.dupBtn}
              >
                {`Additionner (→ ${(duplicate?.line.CountedQuantity ?? 0) + (duplicate?.newQty ?? 0)})`}
              </Button>
            </View>
          </Modal>
        </Portal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  // ── Header ──
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
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  headerBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  // ── Formulaire ──
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  formSection: {
    padding: 16,
    gap: 12,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF8F0',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.orange,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.orange,
    lineHeight: 18,
  },
  articleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.blue,
    gap: 12,
  },
  articleCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  articleInfo: { flex: 1, gap: 2 },
  articleCode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.blue,
  },
  articleName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  articleBarcode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  // ── Emplacements ──
  binSection: { gap: 6 },
  binLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  binRequired: {
    color: COLORS.danger,
    fontWeight: '700',
  },
  binHint: {
    fontSize: 12,
    color: COLORS.orange,
    lineHeight: 16,
  },
  binChips: {
    gap: 8,
    paddingVertical: 2,
  },
  binChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: `${COLORS.blue}60`,
    backgroundColor: 'transparent',
  },
  binChipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  binChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.blue,
  },
  binChipTextActive: {
    color: COLORS.white,
  },
  // ── Carte d'avancement & Filtres Comptés / Non comptés ──
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    marginTop: 4,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  progressCountersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterBadgeCounted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F8EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  counterTextCounted: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  counterBadgeUncounted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  counterTextUncounted: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.orange,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActiveAll: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  filterTabActiveUncounted: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.orange,
  },
  filterTabActiveCounted: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  filterTabTextActiveAll: {
    color: COLORS.white,
  },
  filterTabTextActiveUncounted: {
    color: COLORS.white,
  },
  filterTabTextActiveCounted: {
    color: COLORS.white,
  },
  // ── Lignes d'inventaire (distinction visuelle Compté vs Non compté) ──
  lineCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 5,
    gap: 10,
  },
  lineCardCounted: {
    borderLeftColor: COLORS.primary,
    backgroundColor: '#F4FBF6',
    borderColor: '#C6E9CE',
  },
  lineCardUncounted: {
    borderLeftColor: COLORS.orange,
    backgroundColor: COLORS.surface,
  },
  lineCardPending: {
    borderLeftColor: COLORS.blue,
    backgroundColor: '#F0F8FF',
    borderColor: '#93C5FD',
  },
  lineCardSelected: {
    borderColor: COLORS.blue,
    borderWidth: 1.5,
  },
  lineTopPressable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  lineCheck: {
    width: 24,
    paddingTop: 2,
  },
  lineInfo: {
    flex: 1,
    gap: 3,
  },
  lineCodeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lineCode: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.blue,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillCounted: {
    backgroundColor: '#D8F3DF',
  },
  statusPillUncounted: {
    backgroundColor: '#FFE8D1',
  },
  statusPillPending: {
    backgroundColor: '#DBEAFE',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusPillTextCounted: {
    color: COLORS.primaryDark,
  },
  statusPillTextUncounted: {
    color: '#C25E00',
  },
  statusPillTextPending: {
    color: '#1D4ED8',
  },
  lineName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  lineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  lineMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  lineActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  inlineStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    margin: 0,
  },
  inlineQtyBox: {
    minWidth: 68,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  inlineQtyValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  inlineQtyValueCounted: {
    color: COLORS.primaryDark,
  },
  inlineQtyValueUncounted: {
    color: COLORS.orange,
  },
  inlineQtySub: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  lineValidateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  lineValidateBtnAction: {
    backgroundColor: COLORS.primary,
  },
  lineValidateBtnCounted: {
    backgroundColor: '#E8F8EC',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  lineValidateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },
  lineValidateBtnTextCounted: {
    color: COLORS.primaryDark,
  },
  // ── État vide ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textDisabled,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── Footer validation au fur et à mesure ──
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  footerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerInfoText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  footerSubText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  // ── Modal doublon ──
  dupModal: {
    backgroundColor: COLORS.surface,
    margin: 24,
    borderRadius: 16,
    padding: 24,
  },
  dupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  dupMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  dupCode: {
    fontWeight: '700',
    color: COLORS.blue,
  },
  dupActions: {
    gap: 10,
  },
  dupBtn: {
    borderRadius: 10,
  },
});

export default CountingDetailScreen;
