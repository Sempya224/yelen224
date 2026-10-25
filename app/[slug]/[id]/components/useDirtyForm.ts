"use client";

// Suivi "enregistré / modifié / en cours / enregistré à l'instant / échec" d'un
// formulaire (Profil Entreprise, 19/10/2026). Ne fait aucun appel réseau : le
// composant appelant garde sa propre logique d'enregistrement et se contente
// de signaler le résultat via `setSaving`, `markSaved` ou `markError`.
// Comparaison profonde champ par champ avec la dernière valeur enregistrée
// (chargement ou sauvegarde réussie), ce qui donne l'ensemble `dirtyFields`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DirtyStatus = "clean" | "dirty" | "saving" | "saved" | "error";

const SAVED_BANNER_MS = 2500;
const SAVED_FLASH_MS = 600;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function useDirtyForm<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [savedValues, setSavedValues] = useState<T | null>(null);
  const [isSaving, setIsSavingState] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [flashFields, setFlashFields] = useState<ReadonlySet<keyof T>>(new Set());
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(id => window.clearTimeout(id)); };
  }, []);

  const dirtyFields = useMemo<ReadonlySet<keyof T>>(() => {
    if (!savedValues) return new Set();
    const keys = Object.keys(values) as (keyof T)[];
    return new Set(keys.filter(k => !deepEqual(values[k], savedValues[k])));
  }, [values, savedValues]);
  const isDirty = dirtyFields.size > 0;

  // Premier chargement : la valeur chargée sert à la fois d'état courant et de
  // référence "enregistrée".
  const init = useCallback((loaded: T) => {
    setValues(loaded);
    setSavedValues(loaded);
    setHasError(false);
    setJustSaved(false);
  }, []);

  const setSaving = useCallback((saving: boolean) => {
    setIsSavingState(saving);
    if (saving) { setHasError(false); setJustSaved(false); }
  }, []);

  const markSaved = useCallback((saved: T) => {
    const flashed = new Set((Object.keys(saved) as (keyof T)[]).filter(k => !savedValues || !deepEqual(saved[k], savedValues[k])));
    setSavedValues(saved);
    setLastSavedAt(new Date());
    setHasError(false);
    setJustSaved(true);
    setFlashFields(flashed);
    timers.current.push(window.setTimeout(() => setJustSaved(false), SAVED_BANNER_MS));
    timers.current.push(window.setTimeout(() => setFlashFields(new Set()), SAVED_FLASH_MS));
  }, [savedValues]);

  const markError = useCallback(() => setHasError(true), []);

  const reset = useCallback(() => {
    if (savedValues) setValues(savedValues);
    setHasError(false);
  }, [savedValues]);

  let status: DirtyStatus = "clean";
  if (isSaving) status = "saving";
  else if (hasError && isDirty) status = "error";
  else if (justSaved && !isDirty) status = "saved";
  else if (isDirty) status = "dirty";

  return { values, setValues, savedValues, init, isDirty, dirtyFields, flashFields, isSaving, setSaving, lastSavedAt, status, markSaved, markError, reset };
}
