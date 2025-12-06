import { useState, useEffect, useCallback } from 'react';
import { getUiPreferences, saveUiPreferences } from '../api/client';
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
    const [language, setLanguageState] = useState('en');
    const [translations, setTranslations] = useState<Record<string, string>>(defaultTranslations);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);

    // Load language from backend on mount
    useEffect(() => {
        const loadLanguage = async () => {
            try {
                const prefs = await getUiPreferences();
                if (prefs.language) {
                    setLanguageState(prefs.language);
                }
            } catch (error) {
                console.error('Failed to load language preference:', error);
            } finally {
                setInitialLoadComplete(true);
            }
        };
        loadLanguage();
    }, []);

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

    // Enhanced setLanguage to persist to backend
    const setLanguage = useCallback(async (newLanguage: string) => {
        setLanguageState(newLanguage);

        if (initialLoadComplete) {
            try {
                const prefs = await getUiPreferences();
                await saveUiPreferences({
                    ...prefs,
                    language: newLanguage
                });
            } catch (error) {
                console.error('Failed to save language preference:', error);
            }
        }
    }, [initialLoadComplete]);

    const t = useCallback((key: string, replacements?: ReplacementMap) => {
        // First try current language, then fall back to English, then use key as last resort
        let value = translations[key] || defaultTranslations[key] || key;

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
