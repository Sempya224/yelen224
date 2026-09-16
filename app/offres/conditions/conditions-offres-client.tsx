"use client";

import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

// Document contractuel/informationnel dédié au fonctionnement des Offres
// Yelen (chantier CEO 03/09/2026), distinct des CGU/Politique de
// confidentialité générales (elles-mêmes encore des versions provisoires,
// non finalisées — ce document ne s'appuie sur leur contenu actuel, il ne
// fait que pointer vers elles). Rédaction volontairement conditionnelle
// sur tout ce qui touche Yelen Reward et les recommandations
// personnalisées : Yelen n'a aujourd'hui aucun système de niveaux
// gating l'affichage d'une offre (voir app/menu/recompenses/
// recompenses-client.tsx — les "paliers" débloquent une récompense via
// points à vie, sans lien avec le catalogue Offres) et aucune surface de
// recommandation individuelle distincte du catalogue — la seule
// personnalisation réelle est un réordonnancement du feed par centres
// d'intérêt déclarés (app/page.tsx, section Offres). Le texte ci-dessous
// décrit donc un cadre ("peut", jamais "recommande automatiquement") qui
// reste vrai que ce mécanisme soit construit ou non, plutôt que
// d'affirmer une fonctionnalité non vérifiée en base — décision actée
// avec Bryan avant rédaction.
const DERNIERE_MAJ = "3 septembre 2026";

type Section = { id: string; numero: string; titre: string; contenu: string };

const SECTIONS: Section[] = [
  {
    id: "objet",
    numero: "1",
    titre: "Objet et champ d'application",
    contenu: `Les présentes Conditions des Offres Yelen (ci-après les "Conditions") définissent les règles applicables à la présentation, à la consultation, à la recommandation et à l'accès aux offres proposées par les établissements et partenaires présents sur Yelen (ci-après les "Offres").

Elles précisent notamment le rôle de Yelen, le fonctionnement du catalogue et des recommandations, les conditions liées à Yelen Reward, les modalités d'accès aux offres externes ainsi que les responsabilités respectives de Yelen et des partenaires.

Les présentes Conditions complètent les Conditions Générales d'Utilisation et la Politique de confidentialité de Yelen, sans s'y substituer. En cas de contradiction sur un point spécifique aux Offres, les présentes Conditions prévalent pour ce point.

En consultant ou en utilisant une Offre Yelen, l'utilisateur reconnaît avoir pris connaissance des présentes Conditions.`,
  },
  {
    id: "definitions",
    numero: "2",
    titre: "Définitions",
    contenu: `« Yelen » désigne la plateforme numérique exploitée sous la marque Yelen, permettant notamment aux citoyens de découvrir des établissements, services, informations et offres proposés par des partenaires.

« Offre » désigne toute proposition commerciale, promotionnelle ou avantage proposée par un partenaire et présentée sur Yelen.

« Partenaire » désigne l'établissement, l'entreprise, l'organisation ou le professionnel ayant proposé l'Offre présentée sur Yelen.

« Citoyen » désigne l'utilisateur utilisant Yelen à titre personnel.

« Yelen Reward » désigne le système de récompenses de Yelen permettant, lorsque les conditions applicables sont remplies, de débloquer certains avantages.

« Établissement vérifié » désigne un établissement ayant satisfait aux procédures de vérification de Yelen en vigueur au moment de son contrôle.

« Site partenaire » désigne le site internet, l'application ou tout autre service externe vers lequel Yelen peut rediriger l'utilisateur afin qu'il consulte ou utilise l'Offre.`,
  },
  {
    id: "fonctionnement",
    numero: "3",
    titre: "Fonctionnement des Offres",
    contenu: `Rôle de Yelen

Yelen permet aux citoyens de découvrir des Offres proposées par des partenaires. Sauf indication contraire expresse affichée sur une Offre donnée, Yelen n'est pas le vendeur, le fournisseur ou l'exécutant du produit ou service faisant l'objet d'une Offre : Yelen agit comme plateforme de présentation et de mise en relation entre le citoyen et le partenaire.

L'Offre est proposée par le partenaire et les conditions applicables à sa fourniture sont déterminées par celui-ci, sous réserve des règles et engagements applicables sur Yelen.

Consultation du catalogue

Indépendamment de toute recommandation individuelle, le citoyen peut consulter librement les Offres disponibles depuis l'onglet Offres, selon les fonctionnalités proposées par Yelen à un instant donné. La consultation du catalogue n'est pas assimilée à une recommandation personnalisée : elle donne accès à l'ensemble des Offres publiées, sans filtrage individuel autre que les catégories et la recherche choisies par le citoyen lui-même.`,
  },
  {
    id: "reward",
    numero: "4",
    titre: "Yelen Reward et recommandations personnalisées",
    contenu: `Yelen Reward

Yelen Reward est un système de récompenses distinct du catalogue Offres. Le déblocage d'un palier ou d'un avantage Yelen Reward donne accès aux avantages associés à ce palier conformément aux conditions applicables au moment considéré ; il ne constitue pas une garantie qu'une Offre particulière du catalogue sera, de ce seul fait, disponible, mise en avant ou recommandée. Les avantages Yelen Reward peuvent être soumis à des conditions, périodes de validité, disponibilités ou restrictions spécifiques, précisées le cas échéant sur l'écran Yelen Reward lui-même.

Recommandations personnalisées

Yelen peut, selon les fonctionnalités effectivement disponibles à un instant donné, mettre en avant ou recommander individuellement certaines Offres à un citoyen. Une telle recommandation, lorsqu'elle existe, peut notamment tenir compte de signaux réels liés à l'utilisation de la plateforme — par exemple les centres d'intérêt déclarés par le citoyen, les catégories consultées, ou l'établissement d'origine de l'Offre lorsqu'il s'agit d'un établissement vérifié — ainsi que, le cas échéant, du niveau Yelen Reward débloqué par le citoyen.

Le simple fait qu'une Offre existe sur Yelen, qu'un partenaire ait le statut de partenaire, ou qu'un citoyen ait débloqué un palier Yelen Reward, ne constitue pas à lui seul un motif suffisant pour qu'une Offre soit recommandée individuellement à ce citoyen. Yelen peut recommander une Offre dans les conditions qui précèdent ; elle ne recommande pas automatiquement une Offre à chaque citoyen, et ne garantit pas qu'une recommandation sera proposée à un moment donné.`,
  },
  {
    id: "verification",
    numero: "5",
    titre: "Établissements vérifiés",
    contenu: `Lorsqu'un établissement affiche un badge de vérification Yelen, cela signifie que cet établissement a satisfait aux critères de vérification applicables au moment de son contrôle.

Cette vérification ne constitue pas une garantie absolue concernant la qualité, la disponibilité, le prix, la légalité ou l'exécution de chaque produit ou service proposé par cet établissement. Elle atteste du résultat d'un contrôle réalisé à un instant donné, et non d'une supervision continue de l'activité du partenaire.`,
  },
  {
    id: "redirection",
    numero: "6",
    titre: "Accès aux offres externes et transaction avec le partenaire",
    contenu: `Une Offre Yelen n'est pas intégrée dans Yelen : elle peut contenir un lien permettant d'accéder au site internet, à l'application ou au service numérique du partenaire. Lorsque le citoyen sélectionne ce lien, il en est informé et est redirigé vers un environnement qui n'est pas exploité par Yelen.

Lorsqu'une Offre redirige vers un service externe, toute commande, réservation, paiement, souscription ou autre transaction effectuée après cette redirection est conclue directement entre le citoyen et le partenaire, sauf indication contraire clairement affichée par Yelen sur l'Offre concernée. Yelen n'est pas partie au contrat ainsi conclu.

Les conditions d'utilisation, politiques de confidentialité, modalités de paiement, conditions de livraison, d'annulation et de remboursement applicables à ce service sont celles du partenaire concerné. Le citoyen doit vérifier les conditions applicables directement auprès du partenaire avant toute transaction.

Yelen ne présente jamais visuellement une Offre externe comme si le citoyen effectuait son achat directement auprès de Yelen.`,
  },
  {
    id: "prix",
    numero: "7",
    titre: "Prix, conditions et durée des Offres",
    contenu: `Les informations affichées sur Yelen sont destinées à permettre au citoyen de comprendre l'Offre proposée. Les prix, disponibilités, modalités et conditions d'une Offre peuvent être modifiés par le partenaire. Lorsqu'une transaction est effectuée sur le service du partenaire, le citoyen doit vérifier le prix et les conditions finales affichés par celui-ci avant de confirmer la transaction.

Une Offre peut être limitée dans le temps (date de début, date d'expiration, statut). Une Offre expirée, suspendue ou retirée ne doit pas être présentée comme une Offre actuellement disponible.

Un partenaire peut modifier ou retirer une Offre conformément aux règles applicables. Yelen peut également suspendre ou retirer une Offre, notamment lorsqu'une information apparaît incorrecte, lorsque l'Offre arrive à expiration, lorsqu'un partenaire ne respecte plus les conditions applicables, ou lorsqu'une mesure de protection des utilisateurs le justifie.`,
  },
  {
    id: "responsabilites",
    numero: "8",
    titre: "Responsabilités",
    contenu: `Responsabilité du partenaire

Le partenaire demeure responsable de l'Offre qu'il propose et de l'exécution de ses obligations envers le citoyen, notamment : l'exactitude des informations fournies, le prix annoncé, la disponibilité et les stocks lorsqu'ils existent, les modalités de réservation et de livraison lorsqu'elle existe, la qualité du produit ou service et l'exécution de la prestation, les conditions d'annulation, de remboursement et les garanties applicables, ainsi que la conformité de son activité aux réglementations qui lui sont applicables.

Limites de la responsabilité de Yelen

Sauf engagement exprès contraire de Yelen sur une Offre donnée, la présentation d'une Offre ne constitue pas une garantie que le citoyen obtiendra le produit, le service, le prix, la disponibilité ou le résultat présenté. Yelen ne peut notamment garantir qu'un partenaire exécutera une transaction conformément à l'ensemble de ses engagements.

Cette limitation ne prive pas le citoyen des droits qui lui sont accordés par les dispositions légales impératives applicables.`,
  },
  {
    id: "offres-interdites",
    numero: "9",
    titre: "Offres interdites",
    contenu: `Yelen peut refuser, suspendre ou retirer toute Offre qui :

• contient des informations trompeuses ou manifestement inexactes ;
• présente un risque important pour les utilisateurs ;
• est contraire aux lois ou réglementations applicables ;
• utilise frauduleusement l'identité d'un établissement ;
• contient des pratiques abusives ;
• ne respecte pas les règles de Yelen ;
• ou présente tout autre risque justifiant son retrait.`,
  },
  {
    id: "tiers",
    numero: "10",
    titre: "Liens et services de tiers",
    contenu: `Les services externes accessibles depuis Yelen peuvent être soumis à des conditions distinctes de celles de Yelen. Yelen ne contrôle pas nécessairement le contenu, la disponibilité, les pratiques ou les politiques des services externes exploités par les partenaires, et ne peut en conséquence en être tenue responsable dans les limites permises par la loi applicable.`,
  },
  {
    id: "signalement",
    numero: "11",
    titre: "Protection du citoyen et signalement",
    contenu: `Tout citoyen peut signaler à Yelen une Offre qui lui paraît incorrecte, trompeuse, expirée, frauduleuse ou contraire aux règles de la plateforme, en contactant Yelen. Yelen peut examiner le signalement et prendre les mesures qu'elle estime appropriées conformément à ses procédures internes et aux règles applicables.`,
  },
  {
    id: "transparence",
    numero: "12",
    titre: "Relation entre Yelen et les partenaires",
    contenu: `Certains partenaires peuvent avoir une relation commerciale avec Yelen. Lorsqu'une telle relation est susceptible d'être pertinente pour la compréhension de la présentation d'une Offre, Yelen applique les obligations de transparence qui lui sont applicables plutôt que de la dissimuler.`,
  },
  {
    id: "donnees",
    numero: "13",
    titre: "Données personnelles et personnalisation",
    contenu: `Lorsque Yelen personnalise la présentation des Offres, certains éléments liés à l'utilisation du service peuvent être utilisés afin d'améliorer la pertinence de cette présentation. Les traitements de données personnelles associés sont encadrés par la Politique de confidentialité de Yelen.`,
  },
  {
    id: "modification",
    numero: "14",
    titre: "Modification des présentes Conditions",
    contenu: `Yelen peut faire évoluer les présentes Conditions afin de tenir compte de l'évolution de ses services, de ses partenaires, de ses fonctionnalités ou du cadre juridique applicable. La version applicable est celle publiée sur Yelen à la date de consultation, sous réserve des dispositions impératives applicables.`,
  },
  {
    id: "droit-applicable",
    numero: "15",
    titre: "Droit applicable et règlement des différends",
    contenu: `[Clause à finaliser par le conseil juridique de Yelen selon l'entité contractante, son siège, les activités concernées et les règles impératives applicables : droit applicable, juridiction ou mode de règlement des différends, limitation de responsabilité, indemnisation, arbitrage, médiation, droit de rétractation, protection des consommateurs et fiscalité.]`,
  },
];

function ArticleBlock({ section, t1, t2, brd, card }: { section: Section; t1: string; t2: string; brd: string; card: string }) {
  return (
    <section
      id={section.id}
      style={{ scrollMarginTop: "84px", background: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "18px", marginBottom: "12px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "28px", height: "28px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontSize: "14px", fontWeight: 900 }}>
          {section.numero}
        </div>
        <h2 style={{ color: t1, fontSize: "15px", fontWeight: 800, margin: 0, letterSpacing: "-0.2px" }}>{section.titre}</h2>
      </div>
      <div style={{ color: t2, fontSize: "13px", lineHeight: 1.75, whiteSpace: "pre-line" }}>{section.contenu}</div>
    </section>
  );
}

function SommaireItem({ numero, titre, t1, t2, brd, onClick }: { numero: string; titre: string; t1: string; t2: string; brd: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap"
      style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${brd}`, padding: "10px 2px", cursor: "pointer" }}
    >
      <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: 900, width: "16px", flexShrink: 0 }}>{numero}</span>
      <span style={{ color: t1, fontSize: "13px", fontWeight: 600 }}>{titre}</span>
      <span style={{ marginLeft: "auto", color: t2, flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </button>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ConditionsOffresClient() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <CompteHeader titre="Conditions des Offres"/>

      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ padding: "4px 4px 4px" }}>
          <p style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, margin: "0 0 8px" }}>
            Les présentes Conditions des Offres Yelen expliquent comment fonctionnent les Offres proposées par nos partenaires, le rôle de Yelen Reward, les recommandations et les redirections vers des sites externes.
          </p>
          <p style={{ color: t2, fontSize: "12px", margin: 0 }}>Dernière mise à jour : {DERNIERE_MAJ}</p>
        </div>

        {/* Sommaire */}
        <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "14px 14px 4px", margin: "20px 0" }}>
          <p style={{ color: t2, fontSize: "10px", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", margin: "0 0 4px 2px" }}>Sommaire</p>
          {SECTIONS.map(s => (
            <SommaireItem key={s.id} numero={s.numero} titre={s.titre} t1={t1} t2={t2} brd={brd} onClick={() => scrollToSection(s.id)}/>
          ))}
        </div>

        {SECTIONS.map(s => (
          <ArticleBlock key={s.id} section={s} t1={t1} t2={t2} brd={brd} card={card}/>
        ))}

        {/* Avertissement final */}
        <div style={{ background: "#F5A623", borderRadius: "18px", padding: "18px", marginTop: "8px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style={{ color: "#080812", fontSize: "13px", fontWeight: 800 }}>Important</span>
          </div>
          <p style={{ color: "rgba(8,8,18,0.75)", fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 8px" }}>
            Les présentes Conditions des Offres Yelen décrivent le fonctionnement du service Yelen et la relation entre Yelen, les citoyens et les partenaires. Elles ne remplacent pas les conditions contractuelles propres à un produit ou service proposé par un partenaire.
          </p>
          <p style={{ color: "rgba(8,8,18,0.75)", fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
            Avant toute transaction, le citoyen doit consulter les conditions applicables directement auprès du partenaire.
          </p>
        </div>

        {/* Liens associés */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", padding: "4px 4px 0" }}>
          <Link href="/cgu" style={{ color: t2, fontSize: "11.5px", textDecoration: "none" }}>Conditions générales Yelen</Link>
          <Link href="/confidentialite" style={{ color: t2, fontSize: "11.5px", textDecoration: "none" }}>Politique de confidentialité</Link>
          <Link href="/menu/recompenses" style={{ color: t2, fontSize: "11.5px", textDecoration: "none" }}>Yelen Reward</Link>
          <Link href="/contact" style={{ color: t2, fontSize: "11.5px", textDecoration: "none" }}>Contacter Yelen</Link>
        </div>
      </main>
    </div>
  );
}
