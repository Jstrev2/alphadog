"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Button, DogAvatar, Spinner } from "@/components/ui";
import { createDog, friendlyError, SIZES, updateDog, type Dog, type DogSize } from "@/lib/game";
import { uploadDogPhoto } from "@/lib/photos";

/** Create a dog, or edit one when `dog` is passed. */
export function DogForm({ dog, onDone, onCancel }: { dog?: Dog; onDone: (dog: Dog) => void; onCancel?: () => void }) {
  const { sb, refresh, setActiveDog, bump } = useGame();
  const [name, setName] = useState(dog?.name ?? "");
  const [size, setSize] = useState<DogSize | null>(dog?.size ?? null);
  const [breed, setBreed] = useState(dog?.breed ?? "");
  const [bio, setBio] = useState(dog?.bio ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);
  const pickPhoto = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPhoto(file);
    setPreview(previewRef.current);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb || !size || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: name.trim(), size, breed: breed.trim() || null, bio: bio.trim() || null };
      let saved = dog ? await updateDog(sb, dog.id, input) : await createDog(sb, input);
      if (photo) {
        const path = await uploadDogPhoto(sb, saved.id, photo, saved.photo_path);
        saved = await updateDog(sb, saved.id, { photo_path: path });
      }
      if (!dog) setActiveDog(saved.id);
      await refresh();
      bump();
      onDone(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="group relative cursor-pointer">
          {dog?.photo_path || preview || name ? (
            <DogAvatar name={name || "?"} path={dog?.photo_path} previewUrl={preview} className="size-24 text-5xl" />
          ) : (
            <span className="flex size-24 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 text-4xl" aria-hidden="true">
              🐶
            </span>
          )}
          <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 shadow ring-1 ring-zinc-200 group-hover:bg-emerald-50">
            {dog?.photo_path || preview ? "Change" : "Add photo"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="min-w-0 flex-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500" htmlFor="dog-name">
            Name
          </label>
          <input
            id="dog-name"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Biscuit"
            className="mt-1 h-11 w-full rounded-xl border border-zinc-300 px-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Size</legend>
        <p className="text-xs text-zinc-500">Leaderboards are split by size so everyone has a fair shot.</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSize(s.id)}
              aria-pressed={size === s.id}
              className={`rounded-xl px-1 py-2 text-center ring-1 transition ${
                size === s.id ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className={`block text-[10px] leading-3 ${size === s.id ? "text-emerald-50" : "text-zinc-500"}`}>{s.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500" htmlFor="dog-breed">
          Breed <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="dog-breed"
          maxLength={40}
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
          placeholder="Goldendoodle, mutt, mystery"
          className="mt-1 h-11 w-full rounded-xl border border-zinc-300 px-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500" htmlFor="dog-bio">
          About <span className="font-normal normal-case">(optional)</span>
        </label>
        <textarea
          id="dog-bio"
          maxLength={160}
          rows={2}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Hydrant connoisseur. Will trade turf for treats."
          className="mt-1 w-full resize-none rounded-xl border border-zinc-300 px-3 py-2 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <p className="text-right text-[11px] text-zinc-400">{bio.length}/160</p>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        Your dog&apos;s name, photo, size, breed and about line are public. Your name and email never are.
      </p>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button kind="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || !size || !name.trim()} className="flex-1">
          {saving ? <Spinner className="size-4" /> : dog ? "Save" : "Create profile"}
        </Button>
      </div>
    </form>
  );
}
