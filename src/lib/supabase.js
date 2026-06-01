import { createClient } from '@supabase/supabase-js';
import { buildSearchText, normalizeRecipe } from './recipeUtils.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  return data || [];
}

export async function addNote(recipeId, body) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('recipe_notes')
    .insert({ recipe_id: recipeId, user_id: user.id, body })
    .select()
    .single();
  if (error) throw error;
  return data;
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
