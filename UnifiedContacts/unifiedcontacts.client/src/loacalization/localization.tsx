import LocalizedStringsModule, { LocalizedStringsMethods } from "react-localization";

// Vite 8 resolves this CJS default import to module.exports instead of exports.default
const LocalizedStrings =
  (LocalizedStringsModule as unknown as { default?: typeof LocalizedStringsModule }).default ??
  LocalizedStringsModule;

export interface IStrings extends LocalizedStringsMethods {
  searchPageHeadline: string;
  search: string;
  welcomeText: string;
  adminGrantTitle: string;
  adminGrantContent: string;
  adminGrantContentNotAllPermissionsGranted: string;
  adminGrantButton: string;
  adminGrantCloseButton: string;
  adminInfoButton: string;
  searchResultString: string;
  resultsString: string;
  videoCall: string;
  call: string;
  message: string;
  email: string;
  emptyPageSubTitle: string;
  foundIn: string;
  resultsStringSingular: string;
  sourcesStillLoadingAlert: string;
  sourcesSuccessFinishedLoadingAlert: string;
  resortButton: string;
  teamsMessageCurrentUserError: string;
  teamsCallCurrentUserError: string;
  name: string;
  actionNotSupported: string;
  errorOccurred: string;
  contacts: string;
  backendFrontendOutOfSyncTooltip: string;
  sourceLoadingFailedAlert: string;
  platformNotSupported: string;
}

const localizedStrings: IStrings = new LocalizedStrings({
  en: {
    searchPageHeadline: "Your unified search experience",
    search: "Search",
    welcomeText: "Welcome to Unified Contacts! We're glad you're here!",
    adminGrantTitle: "Additional steps required",
    adminGrantContent:
      "Your administrator must complete additional steps to finish the setup of Unified Contacts. If you are the administrator, please click the button to grant the required permissions on behalf of your organization.",
    adminGrantContentNotAllPermissionsGranted:
      "Some expected permissions are missing. This can lead to problems with certain features of Unified Contacts. If you are an administrator, review the permissions below and grant admin consent for them by clicking the confirm button.",
    adminGrantButton: "Grant",
    adminGrantCloseButton: "Close",
    adminInfoButton: "More information",
    searchResultString: "Search results for",
    resultsString: "results",
    resultsStringSingular: "result",
    videoCall: "video call",
    call: "call",
    message: "Teams message",
    email: "email",
    emptyPageSubTitle: "Use the search bar to get started.",
    foundIn: "found in ({source})",
    sourcesStillLoadingAlert:
      "There are still source(s) loading in the background ({sources}).",
    sourcesSuccessFinishedLoadingAlert:
      "Sources loaded. Found {additionalResultCount} additional result(s). Click 'Resort' to sort all Results.",
    resortButton: "Resort",
    teamsMessageCurrentUserError:
      "You cannot write a Teams message to yourself!",
    teamsCallCurrentUserError: "You cannot call yourself in MS Teams!",
    name: "Name",
    actionNotSupported: "Action not supported!",
    errorOccurred: "An error has occurred!",
    contacts: "Contact options",
    backendFrontendOutOfSyncTooltip:
      "Backend has a different version than frontend. Please clear Teams cache in case you run into issues or if you want to update instantly.",
    sourceLoadingFailedAlert:
      "An error occured during the search of {source} contacts. You will not find any results of this source. Please Contact your IT Servicedesk / Helpdesk for assistance if this error persists",
    platformNotSupported:
      "This action is not supported on your current platform.",
  },
  de: {
    searchPageHeadline: "Dein unified Sucherlebnis",
    search: "Suche",
    welcomeText:
      "Willkommen bei Unified Contacts! Wir sind froh, dass du da bist!",
    adminGrantTitle: "Zusätzliche Schritte erforderlich",
    adminGrantContent:
      "Dein Administrator muss einige zusätzliche Schritte absolvieren, um das Einrichten von Unified Contacts abzuschließen. Wenn du ein Administrator bist, klicke auf den Grant Button um die nötigen Berechtigungen zu bestätigen.",
    adminGrantContentNotAllPermissionsGranted:
      "Es fehlen einige benötigte Berechtigungen. Dies kann zu Problemen mit bestimmten Funktionen von Unified Contacts führen. Wenn du ein Administrator bist, überprüfe die unten aufgeführten Berechtigungen und erteile die Admin-Zustimmung für diese, indem du auf den Grant Button klickst.",
    adminGrantButton: "Grant",
    adminGrantCloseButton: "Schließen",
    adminInfoButton: "Mehr Informationen",
    searchResultString: "Suchergebnisse",
    resultsString: "Ergebnisse",
    resultsStringSingular: "Ergebnis",
    videoCall: "Video Anruf",
    call: "Anruf",
    message: "Teams Nachricht",
    email: "E-Mail",
    emptyPageSubTitle: "Nutze die Suchleiste, um loszulegen.",
    foundIn: "in ({source}) gefunden",
    sourcesStillLoadingAlert:
      "Im Hintergrund werden noch Quellen geladen ({sources}).",
    sourcesSuccessFinishedLoadingAlert:
      "Quellen geladen. {additionalResultCount} weitere(s) Ergebnis(se) gefunden. Klicke auf 'Neu sortieren' um alle Ergebnisse neu zu sortieren.",
    resortButton: "Neu sortieren",
    teamsMessageCurrentUserError:
      "Es ist nicht möglich sich selbst eine Teams-Nachricht zu schreiben!",
    teamsCallCurrentUserError:
      "Es ist nicht möglich sich in MS Teams selber anzurufen!",
    name: "Name",
    actionNotSupported: "Diese Aktion wird nicht unterstützt!",
    errorOccurred: "Ein Fehler ist aufgetreten!",
    contacts: "Kontaktmöglichkeiten",
    backendFrontendOutOfSyncTooltip:
      "Das Backend hat eine andere Version als das Frontend. Falls Probleme auftreten, oder du sofort auf die neue Version updaten willst, leere bitte deinen Teams Cache.",
    sourceLoadingFailedAlert:
      "Während der Suche nach {source} Kontakten ist ein Fehler aufgetreten. Es werden keine Suchergebnisse dieser Quelle angezeigt. Sollte dieser Fehler weiterhin bestehen, wende dich an dein IT Servicedesk / Helpdesk",
    platformNotSupported:
      "Diese Aktion wird auf deiner aktuellen Plattform nicht unterstützt.",
  },
  fr: {
    searchPageHeadline: "Ton expérience de recherche unifiée",
    search: "Recherche",
    welcomeText: "Bienvenue sur Unified Contacts! Contente que tu sois là!",
    adminGrantTitle: "Étapes supplémentaires nécessaires",
    adminGrantContent:
      "Ton administrateur doit suivre quelques étapes supplémentaires pour finaliser la configuration de Unified Contacts. Si tu es administrateur, clique sur le bouton Grant pour confirmer les autorisations nécessaires.",
    adminGrantContentNotAllPermissionsGranted:
      "Certaines permissions attendues sont manquantes. Cela peut entraîner des problèmes avec certaines fonctionnalités de Contacts unifiés. Si vous êtes l'administrateur, vérifiez les autorisations ci-dessous et accordez le consentement de l'administrateur pour ces autorisations en cliquant sur le bouton confirmer.",
    adminGrantButton: "Grant",
    adminGrantCloseButton: "Fermer",
    adminInfoButton: "Plus d'informations",
    searchResultString: "Résultats de la recherche",
    resultsString: "Résultats",
    resultsStringSingular: "Résultat",
    videoCall: "Appel vidéo",
    call: "Appel",
    message: "Message de Teams",
    email: "E-Mail",
    emptyPageSubTitle: "Utilise la barre de recherche pour commencer.",
    foundIn: "trouvé dans ({source})",
    sourcesStillLoadingAlert:
      "Il y a encore des sources qui se chargent en arrière-plan ({sources}).",
    sourcesSuccessFinishedLoadingAlert:
      "Sources chargées. Trouvé {additionalResultCount} résultat(s) supplémentaire(s). Cliquez sur 'Réorganiser' pour trier tous les résultats.",
    resortButton: "Réorganiser",
    teamsMessageCurrentUserError:
      "Vous ne pouvez pas écrire un message de Teams à vous-même!",
    teamsCallCurrentUserError:
      "Vous ne pouvez pas vous appeler vous-même dans Teams!",
    name: "Nom",
    actionNotSupported: "Action non supporter!",
    errorOccurred: "Une erreur s'est produite!",
    contacts: "contacts",
    backendFrontendOutOfSyncTooltip:
      "La version du backend est différente de celle du frontend. Veuillez vider le cache de Teams. Si vous rencontreriez des problèmes ou si vous souhaitez mettre à jour instantanément.",
    sourceLoadingFailedAlert:
      "Une erreur s'est produite pendant la recherche des contacts de {source}. Vous ne trouverez aucun résultat de cette source. Si l'erreur persiste, veuillez contacter votre service informatique pour obtenir de l'aide.",
    platformNotSupported:
      "Cette action n'est pas prise en charge sur votre plateforme actuelle.",
  },
  cs: {
    searchPageHeadline: "Tvůj zážitek z unified vyhledávání",
    search: "Hledat",
    welcomeText: "Vítej u Unified Contacts! Jsme rádi, že jsi zde",
    adminGrantTitle: "Dodatečné kroky jsou nutné",
    adminGrantContent:
      "Tvůj administrátor musí absolvovat přídatné kroky aby dokončil instalaci Unified Contacts. Když jsi administrátor, klikni na tlačítko Grant k potvrzení nutných oprávnění",
    adminGrantContentNotAllPermissionsGranted:
      "Chybí některe předpokládáne oprávnění. Tohle může vést k problémům s některými funkcemi aplikace Unified Contacts. Jestli jsi Administrator, zkontrolujt uvedene oprávnění a uděl jim Administrovy grant kliknutím na tlačítko 'Grant'.",
    adminGrantButton: "Grant",
    adminGrantCloseButton: "Zavřít",
    adminInfoButton: "Další informace",
    searchResultString: "Výsledky pro",
    resultsStringSingular: "Výsledek pro",
    resultsString: "Výsledky",
    videoCall: "video hovor",
    call: "volat",
    message: "Teams zpráva",
    email: "E-Mail",
    emptyPageSubTitle: "Začněte pomocí vyhledávání",
    foundIn: "nalezeno v ({source})",
    sourcesStillLoadingAlert: "Zdroje se stále načítají v pozadí ({sources}).",
    sourcesSuccessFinishedLoadingAlert:
      "Zdroje načteny. Nalezeno {additionalResultCount} dalších výsledků. Klikněte na 'Seřadit ' pro seřazeni všech výsledků.",
    resortButton: "Seřadit",
    teamsMessageCurrentUserError: "Nemůžete si poslat Teams zprávu sami sobě!",
    teamsCallCurrentUserError: "Nemůžete si zavolat sami sobě v MS Teams!",
    name: "Jméno",
    actionNotSupported: "Akce není podporována!",
    errorOccurred: "Došlo k chybě!",
    contacts: "Kontaktní údaje",
    backendFrontendOutOfSyncTooltip:
      "Backend má jinou verzi než frontend. Pokud se vyskytnou problémy, nebo pokud chcete ihned aktualizovat na novou verzi, vyprázdněte prosím Teams cache.",
    sourceLoadingFailedAlert:
      "Při vyhledávání {source} kontaktů došlo k chybě. Nebudou nalezeny žádné výsledky tohoto zdroje. Pokud tato chyba přetrvává, obrať se s žádostí o pomoc na tvůj IT Service Desk / Helpdesk.",
    platformNotSupported:
      "Tato akce není podporována na tvojí aktuální platformě.",
  },
  es: {
    searchPageHeadline: "Su experiencia de búsqueda unificada",
    search: "Búsqueda",
    welcomeText: "¡Bienvenido a Unified Contacts! ¡Nos alegra que estés aquí!",
    adminGrantTitle: "Pasos adicionales requeridos",
    adminGrantContent:
      "El administrador debe completar pasos adicionales para finalizar la configuración de Unified Contacts. Si usted tiene permiso de administrador, haga clic en el botón para conceder los permisos necesarios en nombre de su organización.",
    adminGrantContentNotAllPermissionsGranted:
      "Faltan algunos permisos esperados. Esto puede ocasionar problemas con ciertas funciones de Unified Contacts. Si usted es el administrador, revise los permisos a continuación y otorgue el consentimiento de administrador para ellos haciendo clic en el botón confirmar.",
    adminGrantButton: "Conceder",
    adminGrantCloseButton: "Cerrar",
    adminInfoButton: "Más información",
    searchResultString: "Resultados de la búsqueda para",
    resultsStringSingular: "Resultado",
    resultsString: "Resultados",
    videoCall: "Video Llamada",
    call: "Llamada",
    message: "Teams zpráva",
    email: "E-mail",
    emptyPageSubTitle: "Usa la barra de búsqueda para empezar.",
    foundIn: "Encontrado en ({source})",
    sourcesStillLoadingAlert:
      "Todavía hay fuentes cargando en segundo plano ({sources}).",
    sourcesSuccessFinishedLoadingAlert:
      "Fuentes cargadas. Se han encontrado {additionalResultCount} resultados adicionales. Haga clic en 'Actualizar' para ordenar todos los resultados.",
    resortButton: "Actualizar",
    teamsMessageCurrentUserError:
      "¡No puedes escribirte un mensaje de Teams a ti mismo!",
    teamsCallCurrentUserError: "¡No puedes llamarte a ti mismo en MS Teams!",
    name: "Nombre",
    actionNotSupported: "¡Acción no compatible/soportada!",
    errorOccurred: "¡Ocurrió un error!",
    contacts: "Opciones de contacto",
    backendFrontendOutOfSyncTooltip:
      "El Backend tiene una versión diferente a la de Frontend. Borre el caché de Teams en caso de que tenga problemas o si desea actualizar.",
    sourceLoadingFailedAlert:
      "Se ha producido un error durante la búsqueda de {source} contactos. No encontrará ningún resultado de esta fuente. Póngase en contacto con su servicio de asistencia / servicio de asistencia de TI si este error persiste.",
    platformNotSupported:
      "Cette action n'est pas prise en charge par ta plateforme actuelle.",
  },
});

export default localizedStrings;

export const supportedLanguages = ["en", "de", "fr", "cs", "es"];
