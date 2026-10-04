import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// Texte der Anmelde-Fenster von Clerk auf Deutsch in Du-Form und mit Schweizer Rechtschreibung (Harte Regel 2).
// Die mitgelieferte deutsche Fassung siezt und schreibt «ß», darum eine eigene, kleine. Was hier fehlt, zeigt Clerk
// auf Englisch; das betrifft nur Wege, die wir nicht anbieten (Passwort, Passkey, Telefon, Organisationen).

type Localization = NonNullable<ComponentProps<typeof ClerkProvider>["localization"]>;

export const localizationDeCH: Localization = {
  locale: "de-CH",
  formButtonPrimary: "Weiter",
  formFieldLabel__emailAddress: "E-Mail-Adresse",
  formFieldInputPlaceholder__emailAddress: "Deine E-Mail-Adresse",
  dividerText: "oder",
  backButton: "Zurück",
  footerActionLink__useAnotherMethod: "Andere Möglichkeit wählen",
  footerPageLink__help: "Hilfe",
  footerPageLink__privacy: "Datenschutz",
  footerPageLink__terms: "Bedingungen",
  socialButtonsBlockButton: "Weiter mit {{provider|titleize}}",
  signIn: {
    start: {
      title: "Anmelden",
      subtitle: "Marketing-Tools von Alperna",
      titleCombined: "Anmelden oder Konto erstellen",
      subtitleCombined: "Kein Passwort nötig. Wir erhalten nur Name und E-Mail-Adresse.",
      actionText: "Noch kein Konto?",
      actionLink: "Konto erstellen",
    },
    emailCode: {
      title: "Schau in dein Postfach",
      subtitle: "Marketing-Tools von Alperna",
      formTitle: "Bestätigungscode",
      resendButton: "Code noch einmal senden",
    },
    alternativeMethods: {
      title: "Andere Möglichkeit wählen",
      subtitle: "Du kannst dich auch so anmelden.",
      blockButton__emailCode: "Code an {{identifier}} senden",
      actionText: "Klappt keine davon?",
      actionLink: "Hilfe",
      getHelp: {
        title: "Hilfe",
        content: "Wenn die Anmeldung nicht klappt, schreib uns an kontakt@alperna.ch. Wir melden uns persönlich.",
        blockButton__emailSupport: "E-Mail an Alperna",
      },
    },
    noAvailableMethods: {
      title: "Anmeldung nicht möglich",
      subtitle: "Es ist ein Fehler aufgetreten",
      message: "Die Anmeldung kann nicht fortgesetzt werden. Versuch es später noch einmal.",
    },
  },
  signUp: {
    start: {
      title: "Konto erstellen",
      subtitle: "Marketing-Tools von Alperna",
      titleCombined: "Konto erstellen",
      subtitleCombined: "Marketing-Tools von Alperna",
      actionText: "Schon ein Konto?",
      actionLink: "Anmelden",
    },
    emailCode: {
      title: "Bestätige deine E-Mail-Adresse",
      subtitle: "Marketing-Tools von Alperna",
      formTitle: "Bestätigungscode",
      formSubtitle: "Gib den Code ein, den wir dir per E-Mail geschickt haben.",
      resendButton: "Code noch einmal senden",
    },
    continue: {
      title: "Fehlende Angaben ergänzen",
      subtitle: "Marketing-Tools von Alperna",
      actionText: "Schon ein Konto?",
      actionLink: "Anmelden",
    },
  },
  unstable__errors: {
    form_code_incorrect: "Der Code stimmt nicht. Prüf ihn und versuch es noch einmal.",
    form_identifier_not_found: "Zu dieser E-Mail-Adresse gibt es noch kein Konto.",
    form_identifier_exists__email_address: "Zu dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich damit an.",
    form_param_format_invalid__email_address: "Die E-Mail-Adresse ist nicht gültig.",
    form_param_nil: "Diese Angabe fehlt.",
    form_email_address_blocked: "Diese E-Mail-Adresse kannst du nicht verwenden.",
    not_allowed_access: "Mit dieser E-Mail-Adresse ist die Anmeldung nicht möglich.",
    oauth_access_denied: "Die Anmeldung wurde abgebrochen. Du kannst es noch einmal versuchen.",
    captcha_invalid: "Die Sicherheitsprüfung ist fehlgeschlagen. Lade die Seite neu und versuch es noch einmal.",
    captcha_unavailable: "Die Sicherheitsprüfung ist nicht erreichbar. Versuch es später noch einmal.",
  },
};
