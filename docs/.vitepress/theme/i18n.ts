import { computed } from "vue";
import { useData } from "vitepress";

export type Locale = "en" | "sr";

/**
 * Picks a component's strings for the page's language. Terminal output stays
 * in English everywhere — it is what the CLI prints — so only the labels
 * around it are translated.
 */
export function useStrings<T>(strings: Record<Locale, T>) {
  const { lang } = useData();
  return computed<T>(() => (lang.value.startsWith("sr") ? strings.sr : strings.en));
}
