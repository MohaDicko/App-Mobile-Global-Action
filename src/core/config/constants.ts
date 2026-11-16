// ─── Configuration globale — chargée depuis les variables d'environnement ────
const resolveSapBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    if (window.location.hostname.includes('vercel.app')) {
      return `${window.location.origin}/api/sap`;
    }
  }
  return process.env.EXPO_PUBLIC_SAP_BASE_URL || 'https://elton-hana-client.safirconsulting.net:50000/b1s/v1';
};

export const SAP_BASE_URL = resolveSapBaseUrl();
export const SAP_COMPANY_DB = process.env.EXPO_PUBLIC_SAP_COMPANY_DB || 'DB_COPIE_PROD_21102026';
export const SAP_USER = process.env.EXPO_PUBLIC_SAP_USER || 'manager';
/** Mot de passe du compte SAP service partagé — compte technique, pas un mot de passe utilisateur */
export const SAP_PASSWORD = process.env.EXPO_PUBLIC_SAP_PASSWORD || 'S@p.2024';
export const PRINT_MODE = (process.env.EXPO_PUBLIC_PRINT_MODE ?? 'pdf') as 'pdf' | 'zpl';
export const API_TIMEOUT = Number(process.env.EXPO_PUBLIC_API_TIMEOUT) || 15000;
export const SESSION_REFRESH_MS =
  Number(process.env.EXPO_PUBLIC_SESSION_REFRESH_INTERVAL) || 1500000;
export const N_WEEKS = Number(process.env.EXPO_PUBLIC_N_WEEKS) || 8;
/** Nombre de semaines de couverture cible pour la suggestion de commande */
export const N_WEEKS_COVERAGE = Number(process.env.EXPO_PUBLIC_N_WEEKS_COVERAGE) || 4;
export const IS_DEV = process.env.EXPO_PUBLIC_ENV === 'development';

// Les entrepôts sont récupérés dynamiquement via GET /Warehouses
// Pas de liste hardcodée — voir useWarehouses() hook

/**
 * Codes utilisateurs applicatifs ayant accès à l'écran Administration.
 * Approche sans UDF SAP supplémentaire — liste maintenue ici.
 * Ajouter un code ici pour accorder les droits admin (ex: 'E.DOUEU').
 * Comparaison insensible à la casse dans le layout.
 */
export const ADMIN_USER_CODES: readonly string[] = ['ADMIN', 'E.DOUEU', 'MANAGER'];
