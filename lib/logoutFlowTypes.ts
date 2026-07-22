// Contrat de copie partagé entre les deux composants LogoutFlow
// (components/LogoutFlow.tsx côté citoyen,
// app/institution/[id]/dashboard/components/LogoutFlow.tsx côté institution).
// Chaque côté garde son propre JSX/CSS et sa propre voix — seul ce type
// garantit que les deux suivent la même mécanique (confirm → transition →
// succès → erreur réseau).
export type LogoutFlowCopy = {
  confirmTitle: string;
  confirmBody: string;
  confirmCancelLabel: string;
  confirmConfirmLabel: string;
  transitioningTitle: string;
  transitioningSubtitle: string;
  successTitle: string;
  successSubtitle: string;
  networkErrorTitle: string;
  networkErrorBody: string;
};
