import { useState, useEffect, useCallback } from 'react';
import en from './en.json';
import nl from './nl.json';
import fr from './fr.json';
import de from './de.json';

type Translations = typeof en;

// Flatten keys for easier access, e.g. "common.save"
const flattenKeys = (obj: any, prefix = ''): Record<string, string> => {
    return Object.keys(obj).reduce((acc: any, k: string) => {
        const pre = prefix.length ? prefix + '.' : '';
        if (typeof obj[k] === 'object' && obj[k] !== null) {
            Object.assign(acc, flattenKeys(obj[k], pre + k));
        } else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {});
};

const defaultTranslations = flattenKeys(en);
const nlTranslations = flattenKeys(nl);
const frTranslations = flattenKeys(fr);
const deTranslations = flattenKeys(de);

type ReplacementMap = Record<string, string | number>;

export const useTranslation = () => {
    const [language, setLanguage] = useState('en');
    const [translations, setTranslations] = useState<Record<string, string>>(defaultTranslations);

    useEffect(() => {
        switch (language) {
            case 'en':
                setTranslations(defaultTranslations);
                break;
            case 'nl':
                setTranslations(nlTranslations);
                break;
            case 'fr':
                setTranslations(frTranslations);
                break;
            case 'de':
                setTranslations(deTranslations);
                break;
            default:
                setTranslations(defaultTranslations);
        }
    }, [language]);

    const t = useCallback((key: string, replacements?: ReplacementMap) => {
        let value = translations[key] || key;

        if (replacements) {
            for (const [replacementKey, replacementValue] of Object.entries(replacements)) {
                const pattern = new RegExp(`{{\\s*${replacementKey}\\s*}}`, 'g');
                value = value.replace(pattern, String(replacementValue));
            }
        }

        return value;
    }, [translations]);

    return { t, language, setLanguage };
};
