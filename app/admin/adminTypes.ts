// Types partagés de l'administration Yelen (chantier refonte admin
// 26/07/2026 — Lot C). Source unique, réutilisés par plusieurs pages
// admin extraites de l'ancien monolithe app/admin/page.tsx.

export interface KPIs {
  institutions_total: number
  institutions_actives: number
  institutions_en_attente: number
  institutions_suspendues: number
  citoyens_total: number
  citoyens_ce_mois: number
  citoyens_aujourd_hui: number
  rdv_total: number
  rdv_aujourd_hui: number
  rdv_ce_mois: number
  revenus_total: number
  revenus_ce_mois: number
  revenus_aujourd_hui: number
  signalements_non_traites: number
  avis_total: number
  avis_moyenne: number
  taux_presence: number
  taux_annulation: number
  paiements_en_attente: number
  documents_en_attente: number
  rdv_chart_30j: number[]
  rdv_labels_30j: string[]
  revenus_chart_12m: number[]
  revenus_labels_12m: string[]
  inscriptions_chart_30j: number[]
  secteurs: { label: string, value: number }[]
}

export interface Institution {
  id: string
  name: string
  category: string
  ville: string
  statut: string
  created_at: string
  email?: string
  phone?: string
  badge_verifie?: boolean
  avertissements?: number
  plan?: string
  document_officiel?: string
  description?: string
  whatsapp?: string
  website?: string
  adresse?: string
  moyenne_avis?: number
  nb_avis?: number
  logo?: string
  quartier?: string
}

export interface Annonce {
  id: string
  titre: string
  contenu: string
  type: string
  statut: string
  date_expiration?: string
  nb_vues: number
  nb_clics: number
  epingle: boolean
  institution_id?: string
  created_at: string
}

export interface AdminUser {
  id: string
  email: string
  nom?: string
  prenom?: string
  role: string
  is_active: boolean
  last_login?: string
  created_at: string
}

export interface Signalement {
  id: string
  type: string
  description: string
  statut: string
  created_at: string
  priorite?: string
  cible_type?: string
}

export interface ActivityItem {
  id: string
  type: string
  message: string
  created_at: string
  actor?: string
}

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}
