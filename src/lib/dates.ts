/** BCP-47 locale for a configured Entries language.
 *
 *  Only the date FORMAT follows this. Words like "Today" stay English; Intl
 *  handles the month, weekday and separator differences per locale. */
export function dayLocale(lang: string): string {
	return lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-GB';
}
