import { createClient } from '@supabase/supabase-js';
import { buildSearchText, normalizeRecipe } from './recipeUtils.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const NOTE_PHOTO_BUCKET = 'recipe-note-photos';
const NOTE_PHOTO_SIGNED_URL_SECONDS = 60 * 60 * 12;
const NOTE_PHOTO_MAX_EDGE = 1600;
const NOTE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const NOTE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const MAX_NOTE_PHOTOS = 4;
export const NOTE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function listRecipes(query = '') {
  let request = supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (query.trim()) {
    request = request.ilike('search_text', `%${query.trim()}%`);
  }

  const { data, error } = await request.limit(100);
  if (error) throw error;
  return data || [];
}

export async function getRecipe(id) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createRecipe(recipe) {
  const normalized = normalizeRecipe(recipe);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: user.id,
      title: normalized.title,
      base_servings: normalized.base_servings,
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      source_text: normalized.source_text,
      search_text: buildSearchText(normalized),
      macro_estimate: normalized.macro_estimate,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecipe(id, recipe) {
  const normalized = normalizeRecipe(recipe);
  const { data, error } = await supabase
    .from('recipes')
    .update({
      title: normalized.title,
      base_servings: normalized.base_servings,
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      source_text: normalized.source_text,
      search_text: buildSearchText(normalized),
      macro_estimate: normalized.macro_estimate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listNotes(recipeId) {
  const { data, error } = await supabase
    .from('recipe_notes')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data || []).map(signNoteAttachments));
}

export async function addNote(recipeId, body, photoFiles = []) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const noteId = makeUuid();
  const cleanBody = normalizeNoteBody(body);
  const uploadedAttachments = await uploadNotePhotos(user.id, recipeId, noteId, photoFiles);
  validateNoteContent(cleanBody, uploadedAttachments);

  try {
    const { data, error } = await supabase
      .from('recipe_notes')
      .insert({
        id: noteId,
        recipe_id: recipeId,
        user_id: user.id,
        body: cleanBody,
        attachments: uploadedAttachments,
      })
      .select()
      .single();
    if (error) throw error;
    return signNoteAttachments(data);
  } catch (err) {
    await removeNotePhotoPaths(uploadedAttachments.map((attachment) => attachment.path));
    throw err;
  }
}

export async function updateNote(note, { body, keptAttachments = [], newFiles = [] }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const currentAttachments = normalizeAttachments(note.attachments);
  const currentByPath = new Map(currentAttachments.map((attachment) => [attachment.path, attachment]));
  const cleanKeptAttachments = keptAttachments
    .map((attachment) => currentByPath.get(attachment.path))
    .filter(Boolean)
    .map(toStoredAttachment);

  if (cleanKeptAttachments.length + newFiles.length > MAX_NOTE_PHOTOS) {
    throw new Error(`Notes can have up to ${MAX_NOTE_PHOTOS} photos.`);
  }

  const uploadedAttachments = await uploadNotePhotos(user.id, note.recipe_id, note.id, newFiles);
  const attachments = [...cleanKeptAttachments, ...uploadedAttachments];
  const cleanBody = normalizeNoteBody(body);
  validateNoteContent(cleanBody, attachments);

  try {
    const { data, error } = await supabase
      .from('recipe_notes')
      .update({
        body: cleanBody,
        attachments,
      })
      .eq('id', note.id)
      .select()
      .single();
    if (error) throw error;

    const keptPaths = new Set(attachments.map((attachment) => attachment.path));
    const removedPaths = currentAttachments
      .filter((attachment) => !keptPaths.has(attachment.path))
      .map((attachment) => attachment.path);
    await removeNotePhotoPaths(removedPaths);

    return signNoteAttachments(data);
  } catch (err) {
    await removeNotePhotoPaths(uploadedAttachments.map((attachment) => attachment.path));
    throw err;
  }
}

export async function callFunction(name, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }

  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return body;
}

export async function fixRecipe(sourceText) {
  const body = await callFunction('fix-recipe', { sourceText });
  return normalizeRecipe({ ...body.recipe, source_text: sourceText });
}

export async function calculateMacros(recipe) {
  const body = await callFunction('calculate-macros', { recipe: normalizeRecipe(recipe) });
  return body.macro_estimate;
}

async function signNoteAttachments(note) {
  const attachments = await Promise.all(normalizeAttachments(note.attachments).map(async (attachment) => {
    const { data, error } = await supabase
      .storage
      .from(NOTE_PHOTO_BUCKET)
      .createSignedUrl(attachment.path, NOTE_PHOTO_SIGNED_URL_SECONDS);

    return {
      ...attachment,
      url: error ? '' : data?.signedUrl || '',
    };
  }));

  return { ...note, attachments };
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) => attachment?.path)
    .map(toStoredAttachment);
}

function toStoredAttachment(attachment) {
  return {
    id: attachment.id || makeUuid(),
    path: attachment.path,
    width: Number(attachment.width) || null,
    height: Number(attachment.height) || null,
    mime_type: attachment.mime_type || 'image/jpeg',
    size: Number(attachment.size) || null,
    created_at: attachment.created_at || new Date().toISOString(),
  };
}

async function uploadNotePhotos(userId, recipeId, noteId, files = []) {
  const selectedFiles = Array.from(files);
  if (selectedFiles.length > MAX_NOTE_PHOTOS) {
    throw new Error(`Notes can have up to ${MAX_NOTE_PHOTOS} photos.`);
  }

  const uploaded = [];
  try {
    for (const file of selectedFiles) {
      const prepared = await prepareNotePhoto(file);
      const attachmentId = makeUuid();
      const path = `${userId}/${recipeId}/${noteId}/${attachmentId}.jpg`;
      const { error } = await supabase
        .storage
        .from(NOTE_PHOTO_BUCKET)
        .upload(path, prepared.blob, {
          cacheControl: '3600',
          contentType: prepared.mime_type,
          upsert: false,
        });

      if (error) throw error;

      uploaded.push({
        id: attachmentId,
        path,
        width: prepared.width,
        height: prepared.height,
        mime_type: prepared.mime_type,
        size: prepared.blob.size,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    await removeNotePhotoPaths(uploaded.map((attachment) => attachment.path));
    throw err;
  }

  return uploaded;
}

async function prepareNotePhoto(file) {
  if (!NOTE_PHOTO_MIME_TYPES.has(file.type)) {
    throw new Error('Photos must be JPG, PNG, or WebP files.');
  }

  const image = await loadImage(file);
  const largestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestEdge > NOTE_PHOTO_MAX_EDGE ? NOTE_PHOTO_MAX_EDGE / largestEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare photo for upload.');
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.86);
  });
  if (!blob) throw new Error('Could not prepare photo for upload.');
  if (blob.size > NOTE_PHOTO_MAX_BYTES) {
    throw new Error('Prepared photo is larger than 10 MB.');
  }

  return {
    blob,
    width,
    height,
    mime_type: 'image/jpeg',
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo.'));
    };
    image.src = url;
  });
}

async function removeNotePhotoPaths(paths) {
  const cleanPaths = paths.filter(Boolean);
  if (!cleanPaths.length) return;
  try {
    await supabase.storage.from(NOTE_PHOTO_BUCKET).remove(cleanPaths);
  } catch {
    // Cleanup is best-effort; the note save/update error should remain the visible failure.
  }
}

function validateNoteContent(body, attachments) {
  if (!body.trim() && attachments.length === 0) {
    throw new Error('Add note text or at least one photo.');
  }
}

function normalizeNoteBody(body) {
  return (body || '').trim();
}

function makeUuid() {
  const random = globalThis.crypto;
  if (random?.randomUUID) return random.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) => {
    const value = Number(character);
    const randomByte = random?.getRandomValues
      ? random.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (value ^ randomByte & 15 >> value / 4).toString(16);
  });
}
