<script>
  import { onDestroy, onMount } from 'svelte';
  import MacroPanel from '../components/MacroPanel.svelte';
  import {
    addNote,
    getRecipe,
    listNotes,
    MAX_NOTE_PHOTOS,
    NOTE_PHOTO_ACCEPT,
    updateNote,
  } from '../lib/supabase.js';
  import {
    buildStepSegments,
    formatIngredientLine,
    formatTimestamp,
  } from '../lib/recipeUtils.js';

  let { recipeId, onBack, onEdit } = $props();

  let recipe = $state(null);
  let notes = $state([]);
  let currentServings = $state(1);
  let loading = $state(true);
  let error = $state('');
  let noteText = $state('');
  let notePhotoDrafts = $state([]);
  let noteError = $state('');
  let savingNote = $state(false);
  let editingNoteId = $state(null);
  let editNoteText = $state('');
  let editKeptAttachments = $state([]);
  let editPhotoDrafts = $state([]);
  let savingEditNote = $state(false);
  let selectedPhoto = $state(null);
  let cookMode = $state(false);
  let wakeError = $state('');
  let wakeLock = null;

  const acceptedPhotoTypes = NOTE_PHOTO_ACCEPT.split(',');

  let scale = $derived(recipe ? Number(currentServings || 1) / Number(recipe.base_servings || 1) : 1);

  onMount(load);

  onDestroy(() => {
    releaseWakeLock();
    clearPhotoDrafts(notePhotoDrafts);
    clearPhotoDrafts(editPhotoDrafts);
  });

  $effect(() => {
    async function handleVisibility() {
      if (cookMode && document.visibilityState === 'visible' && !wakeLock) {
        await requestWakeLock();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  });

  $effect(() => {
    if (!selectedPhoto) return;

    function handleKeydown(event) {
      if (event.key === 'Escape') selectedPhoto = null;
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  async function load() {
    loading = true;
    error = '';
    try {
      recipe = await getRecipe(recipeId);
      currentServings = recipe.base_servings || 1;
      notes = await listNotes(recipeId);
    } catch (err) {
      error = err.message;
    }
    loading = false;
  }

  async function toggleCookMode() {
    if (cookMode) {
      cookMode = false;
      await releaseWakeLock();
      return;
    }

    cookMode = true;
    await requestWakeLock();
  }

  async function requestWakeLock() {
    wakeError = '';
    if (!('wakeLock' in navigator)) {
      wakeError = 'Wake lock is not supported in this browser.';
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      wakeError = err.message;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    const current = wakeLock;
    wakeLock = null;
    try {
      await current.release();
    } catch {
      // The browser may already have released the lock.
    }
  }

  async function saveNote() {
    if (!hasNoteContent(noteText, notePhotoDrafts)) return;
    savingNote = true;
    noteError = '';
    try {
      const saved = await addNote(recipeId, noteText, notePhotoDrafts.map((draft) => draft.file));
      notes = [saved, ...notes];
      noteText = '';
      clearPhotoDrafts(notePhotoDrafts);
      notePhotoDrafts = [];
    } catch (err) {
      noteError = err.message;
    }
    savingNote = false;
  }

  function startEditNote(note) {
    cancelEditNote();
    editingNoteId = note.id;
    editNoteText = note.body || '';
    editKeptAttachments = [...(note.attachments || [])];
    noteError = '';
  }

  function cancelEditNote() {
    clearPhotoDrafts(editPhotoDrafts);
    editingNoteId = null;
    editNoteText = '';
    editKeptAttachments = [];
    editPhotoDrafts = [];
    savingEditNote = false;
    noteError = '';
  }

  async function saveEditedNote(note) {
    if (!hasNoteContent(editNoteText, editPhotoDrafts, editKeptAttachments)) return;
    savingEditNote = true;
    noteError = '';
    try {
      const saved = await updateNote(note, {
        body: editNoteText,
        keptAttachments: editKeptAttachments,
        newFiles: editPhotoDrafts.map((draft) => draft.file),
      });
      notes = notes.map((currentNote) => currentNote.id === saved.id ? saved : currentNote);
      cancelEditNote();
    } catch (err) {
      noteError = err.message;
      savingEditNote = false;
    }
  }

  function addNotePhotos(event) {
    notePhotoDrafts = [
      ...notePhotoDrafts,
      ...buildPhotoDrafts(event.currentTarget.files, notePhotoDrafts.length),
    ];
    event.currentTarget.value = '';
  }

  function addEditPhotos(event) {
    editPhotoDrafts = [
      ...editPhotoDrafts,
      ...buildPhotoDrafts(
        event.currentTarget.files,
        editKeptAttachments.length + editPhotoDrafts.length,
      ),
    ];
    event.currentTarget.value = '';
  }

  function buildPhotoDrafts(fileList, currentCount) {
    noteError = '';
    const remaining = MAX_NOTE_PHOTOS - currentCount;
    if (remaining <= 0) {
      noteError = `Notes can have up to ${MAX_NOTE_PHOTOS} photos.`;
      return [];
    }

    const files = Array.from(fileList || []);
    const acceptedFiles = files.filter((file) => acceptedPhotoTypes.includes(file.type));
    if (acceptedFiles.length !== files.length) {
      noteError = 'Photos must be JPG, PNG, or WebP files.';
    }

    if (acceptedFiles.length > remaining) {
      noteError = `Notes can have up to ${MAX_NOTE_PHOTOS} photos.`;
    }

    return acceptedFiles.slice(0, remaining).map((file) => ({
      id: makeLocalId(),
      file,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
  }

  function removeNotePhotoDraft(id) {
    const draft = notePhotoDrafts.find((photoDraft) => photoDraft.id === id);
    if (draft) URL.revokeObjectURL(draft.url);
    notePhotoDrafts = notePhotoDrafts.filter((photoDraft) => photoDraft.id !== id);
  }

  function removeEditPhotoDraft(id) {
    const draft = editPhotoDrafts.find((photoDraft) => photoDraft.id === id);
    if (draft) URL.revokeObjectURL(draft.url);
    editPhotoDrafts = editPhotoDrafts.filter((photoDraft) => photoDraft.id !== id);
  }

  function removeEditAttachment(path) {
    editKeptAttachments = editKeptAttachments.filter((attachment) => attachment.path !== path);
  }

  function clearPhotoDrafts(drafts) {
    drafts.forEach((draft) => URL.revokeObjectURL(draft.url));
  }

  function hasNoteContent(body, photoDrafts = [], attachments = []) {
    return Boolean(body.trim() || photoDrafts.length || attachments.length);
  }

  function openPhoto(photo) {
    if (!photo.url) return;
    selectedPhoto = photo;
  }

  function makeLocalId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function handleBack() {
    cookMode = false;
    releaseWakeLock();
    onBack();
  }
</script>

<main class="detail-view">
  <header>
    <button class="icon-button" onclick={handleBack} aria-label="Back to recipes">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <h1>{recipe?.title || 'Recipe'}</h1>
    {#if recipe}
      <button class="icon-button" onclick={() => onEdit(recipe)} aria-label="Edit recipe">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
        </svg>
      </button>
    {:else}
      <span></span>
    {/if}
  </header>

  {#if loading}
    <p class="status">Loading recipe...</p>
  {:else if error && !recipe}
    <p class="status error">{error}</p>
  {:else if recipe}
    <section class="hero">
      <p>{formatTimestamp(recipe.created_at)}</p>
      <div class="servings">
        <span>Serves</span>
        <div class="stepper">
          <button onclick={() => currentServings = Math.max(1, Number(currentServings || 1) - 1)} aria-label="Decrease servings">-</button>
          <input type="number" min="1" step="1" bind:value={currentServings} />
          <button onclick={() => currentServings = Number(currentServings || 1) + 1} aria-label="Increase servings">+</button>
        </div>
      </div>
      <button class:active={cookMode} class="cook" onclick={toggleCookMode}>
        {cookMode ? 'Cook mode on' : 'Cook mode'}
      </button>
      {#if wakeError}
        <p class="wake-error">{wakeError}</p>
      {/if}
    </section>

    <MacroPanel macroEstimate={recipe.macro_estimate} />

    <section class="section">
      <h2>Ingredients</h2>
      {#if recipe.ingredients?.length}
        <ul class="ingredients">
          {#each recipe.ingredients as ingredient}
            <li>{formatIngredientLine(ingredient, scale)}</li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No ingredients yet</p>
      {/if}
    </section>

    <section class="section">
      <h2>Procedure</h2>
      {#if recipe.steps?.length}
        <ol class="steps">
          {#each recipe.steps as step}
            <li>
              <p>
                {#each buildStepSegments(step, recipe.ingredients || [], scale) as segment}
                  {#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}
                {/each}
              </p>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">No steps yet</p>
      {/if}
    </section>

    <section class="section notes">
      <h2>Notes</h2>
      <div class="note-form">
        <textarea rows="3" placeholder="Add a note" bind:value={noteText}></textarea>
        <div class="photo-toolbar">
          <label class:disabled={notePhotoDrafts.length >= MAX_NOTE_PHOTOS || savingNote} class="photo-picker">
            <input
              type="file"
              accept={NOTE_PHOTO_ACCEPT}
              multiple
              onchange={addNotePhotos}
              disabled={notePhotoDrafts.length >= MAX_NOTE_PHOTOS || savingNote}
            />
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 8h4l1.5-2h5L16 8h4v11H4V8Z"></path>
              <circle cx="12" cy="13.5" r="3"></circle>
            </svg>
            <span>Add photos</span>
          </label>
          <span class="photo-count">{notePhotoDrafts.length}/{MAX_NOTE_PHOTOS}</span>
        </div>

        {#if notePhotoDrafts.length}
          <div class="draft-photo-grid">
            {#each notePhotoDrafts as draft (draft.id)}
              <div class="draft-photo">
                <img src={draft.url} alt={draft.name || 'Selected attachment'} />
                <button type="button" onclick={() => removeNotePhotoDraft(draft.id)} aria-label="Remove photo">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <button class="note-submit" onclick={saveNote} disabled={!hasNoteContent(noteText, notePhotoDrafts) || savingNote}>
          {savingNote ? 'Saving...' : 'Add note'}
        </button>
      </div>

      {#if noteError}
        <p class="note-error">{noteError}</p>
      {/if}

      <div class="note-list">
        {#each notes as note (note.id)}
          <article class="note">
            {#if editingNoteId === note.id}
              <div class="note-edit">
                <textarea rows="3" bind:value={editNoteText}></textarea>

                <div class="photo-toolbar">
                  <label class:disabled={editKeptAttachments.length + editPhotoDrafts.length >= MAX_NOTE_PHOTOS || savingEditNote} class="photo-picker">
                    <input
                      type="file"
                      accept={NOTE_PHOTO_ACCEPT}
                      multiple
                      onchange={addEditPhotos}
                      disabled={editKeptAttachments.length + editPhotoDrafts.length >= MAX_NOTE_PHOTOS || savingEditNote}
                    />
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M4 8h4l1.5-2h5L16 8h4v11H4V8Z"></path>
                      <circle cx="12" cy="13.5" r="3"></circle>
                    </svg>
                    <span>Add photos</span>
                  </label>
                  <span class="photo-count">{editKeptAttachments.length + editPhotoDrafts.length}/{MAX_NOTE_PHOTOS}</span>
                </div>

                {#if editKeptAttachments.length || editPhotoDrafts.length}
                  <div class="draft-photo-grid">
                    {#each editKeptAttachments as attachment (attachment.path)}
                      <div class="draft-photo">
                        {#if attachment.url}
                          <img src={attachment.url} alt="Note attachment" />
                        {:else}
                          <span>Unavailable</span>
                        {/if}
                        <button type="button" onclick={() => removeEditAttachment(attachment.path)} aria-label="Remove photo">
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M18 6 6 18M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    {/each}
                    {#each editPhotoDrafts as draft (draft.id)}
                      <div class="draft-photo">
                        <img src={draft.url} alt={draft.name || 'Selected attachment'} />
                        <button type="button" onclick={() => removeEditPhotoDraft(draft.id)} aria-label="Remove photo">
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M18 6 6 18M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}

                <div class="note-edit-actions">
                  <button
                    class="note-save"
                    onclick={() => saveEditedNote(note)}
                    disabled={!hasNoteContent(editNoteText, editPhotoDrafts, editKeptAttachments) || savingEditNote}
                  >
                    {savingEditNote ? 'Saving...' : 'Save'}
                  </button>
                  <button class="note-cancel" onclick={cancelEditNote} disabled={savingEditNote}>Cancel</button>
                </div>
              </div>
            {:else}
              {#if note.body}
                <p class="note-body">{note.body}</p>
              {/if}

              {#if note.attachments?.length}
                <div class="note-photos">
                  {#each note.attachments as attachment (attachment.path)}
                    <button
                      type="button"
                      class="note-photo"
                      onclick={() => openPhoto(attachment)}
                      disabled={!attachment.url}
                      aria-label="Open note attachment"
                    >
                      {#if attachment.url}
                        <img src={attachment.url} alt="Note attachment" loading="lazy" />
                      {:else}
                        <span>Unavailable</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}

              <div class="note-meta">
                <time>{formatTimestamp(note.created_at)}</time>
                <button type="button" onclick={() => startEditNote(note)}>Edit</button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>

{#if selectedPhoto}
  <div class="photo-viewer" role="dialog" aria-modal="true" aria-label="Note attachment">
    <button class="photo-backdrop" onclick={() => selectedPhoto = null} aria-label="Close photo"></button>
    <div class="photo-frame">
      <button class="photo-close" onclick={() => selectedPhoto = null} aria-label="Close photo">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
      <img src={selectedPhoto.url} alt="Note attachment" />
    </div>
  </div>
{/if}

<style>
  .detail-view {
    min-height: 100dvh;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: max(14px, env(safe-area-inset-top)) 16px 44px;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    gap: 8px;
    padding: 4px 0 10px;
    background: color-mix(in srgb, var(--color-bg) 94%, transparent);
    backdrop-filter: blur(8px);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    min-width: 0;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 21px;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 19px;
  }

  .icon-button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .icon-button svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .status {
    margin-top: 48px;
    color: var(--color-muted);
    text-align: center;
  }

  .hero,
  .section {
    margin-bottom: 14px;
  }

  .hero {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--color-surface-strong);
    color: var(--color-text-inverse);
  }

  .hero > p {
    color: var(--color-hero-muted);
    font-size: 13px;
  }

  .servings {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .servings > span {
    font-weight: 800;
  }

  .stepper {
    display: grid;
    grid-template-columns: 42px 84px 42px;
    gap: 6px;
  }

  .stepper button,
  .stepper input,
  .cook {
    min-height: 42px;
    border-radius: 8px;
    border: none;
  }

  .stepper button {
    background: var(--color-gold);
    color: var(--color-surface-strong);
    font-size: 20px;
    font-weight: 900;
  }

  .stepper input {
    width: 84px;
    padding: 0 8px;
    text-align: center;
  }

  .cook {
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 900;
    cursor: pointer;
  }

  .cook.active {
    background: var(--color-gold);
  }

  .wake-error,
  .error {
    color: var(--color-danger-soft);
    font-size: 13px;
  }

  .section {
    padding: 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .ingredients,
  .steps {
    padding-left: 22px;
    line-height: 1.5;
  }

  .ingredients li + li,
  .steps li + li {
    margin-top: 9px;
  }

  .steps strong {
    color: var(--color-accent-text);
  }

  .muted {
    color: var(--color-muted);
  }

  .note-form {
    display: grid;
    gap: 10px;
  }

  .note-form textarea,
  .note-edit textarea {
    width: 100%;
    padding: 12px;
  }

  .photo-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .photo-picker {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .photo-picker.disabled {
    opacity: 0.6;
    cursor: default;
  }

  .photo-picker input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .photo-picker svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .photo-count {
    color: var(--color-muted);
    font-size: 13px;
    font-weight: 800;
  }

  .draft-photo-grid,
  .note-photos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .draft-photo,
  .note-photo {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface-alt);
  }

  .draft-photo img,
  .note-photo img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .draft-photo > span,
  .note-photo > span {
    min-height: 100%;
    display: grid;
    place-items: center;
    color: var(--color-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .draft-photo button {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 50%;
    background: rgba(23, 32, 23, 0.78);
    color: var(--color-text-inverse);
    cursor: pointer;
  }

  .draft-photo button svg,
  .photo-close svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .note-submit,
  .note-save {
    min-height: 42px;
    border: none;
    border-radius: 8px;
    background: var(--color-accent);
    color: var(--color-text-inverse);
    font-weight: 800;
    cursor: pointer;
  }

  .note-submit:disabled,
  .note-save:disabled,
  .note-cancel:disabled {
    opacity: 0.6;
  }

  .note-error {
    margin-top: 10px;
    color: var(--color-danger);
    font-size: 13px;
  }

  .note-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .note {
    padding: 12px;
    border-radius: 8px;
    background: var(--color-bg);
  }

  .note-body {
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .note-photos {
    margin-top: 10px;
  }

  .note-photo {
    width: 100%;
    padding: 0;
    cursor: pointer;
  }

  .note-photo:disabled {
    cursor: default;
  }

  .note-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
  }

  .note time {
    display: block;
    color: var(--color-muted);
    font-size: 12px;
  }

  .note-meta button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .note-edit {
    display: grid;
    gap: 10px;
  }

  .note-edit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .note-cancel {
    min-height: 42px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 800;
    cursor: pointer;
  }

  .photo-viewer {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
  }

  .photo-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: var(--color-overlay);
    cursor: pointer;
  }

  .photo-frame {
    position: relative;
    z-index: 1;
    max-width: min(920px, 100%);
    max-height: 100%;
  }

  .photo-frame img {
    max-width: 100%;
    max-height: calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: block;
    border-radius: 8px;
    box-shadow: var(--shadow-floating);
    object-fit: contain;
  }

  .photo-close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 50%;
    background: rgba(23, 32, 23, 0.78);
    color: var(--color-text-inverse);
    cursor: pointer;
  }

  @media (min-width: 520px) {
    .draft-photo-grid,
    .note-photos {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
