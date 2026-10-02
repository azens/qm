import { LOCALE_LABELS, availableLocales, currentLocale, onLocaleChange, setLocale, translate } from "./i18n.ts";

export interface LocaleSwitcher {
  element: HTMLSelectElement;
  dispose(): void;
}

export function createLocaleSwitcher(doc: Document = document): LocaleSwitcher {
  const select = doc.createElement("select");
  select.className = "qm-locale-switcher";
  select.id = "qm-locale-switcher";
  select.setAttribute("aria-label", translate("Language"));

  for (const locale of availableLocales()) {
    const option = doc.createElement("option");
    option.value = locale;
    option.textContent = LOCALE_LABELS[locale] ?? locale;
    option.lang = locale;
    select.append(option);
  }
  select.value = currentLocale();

  const onChange = (): void => {
    setLocale(select.value);
  };
  select.addEventListener("change", onChange);

  const unsubscribe = onLocaleChange(() => {
    const next = currentLocale();
    if (select.value !== next) select.value = next;
    select.setAttribute("aria-label", translate("Language"));
  });

  return {
    element: select,
    dispose: () => {
      select.removeEventListener("change", onChange);
      unsubscribe();
      select.remove();
    },
  };
}
