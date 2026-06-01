export const VOLUME_UNITS = new Set(['tsp', 'tbsp', 'cup', 'cups', 'ml', 'l']);
export const MASS_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'oz', 'lb']);

export function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function normalizeRecipe(recipe) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  return {
    title: (recipe?.title || 'Untitled recipe').trim(),
    base_servings: Math.max(Number(recipe?.base_servings) || 1, 1),
    ingredients: ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index)),
    steps: steps.map((step, index) => normalizeStep(step, index)),
    source_text: recipe?.source_text || recipe?.sourceText || '',
    macro_estimate: recipe?.macro_estimate || null,
  };
}

export function normalizeIngredient(ingredient, index = 0) {
  return {
    id: ingredient?.id || `ing_${index + 1}`,
    name: (ingredient?.name || '').trim() || 'Ingredient',
    amount: toNullableNumber(ingredient?.amount),
    unit: normalizeUnit(ingredient?.unit || ''),
    grams: toNullableNumber(ingredient?.grams),
    note: (ingredient?.note || '').trim(),
    original_text: (ingredient?.original_text || ingredient?.originalText || '').trim(),
    estimated_density: Boolean(ingredient?.estimated_density),
  };
}

export function normalizeStep(step, index = 0) {
  const text = (step?.text || '').trim();
  const timers = Array.isArray(step?.timers) ? step.timers : extractTimers(text);
  return {
    id: step?.id || `step_${index + 1}`,
    text,
    ingredient_refs: Array.isArray(step?.ingredient_refs) ? step.ingredient_refs : [],
    timers: timers.map((timer, timerIndex) => ({
      id: timer?.id || `timer_${index + 1}_${timerIndex + 1}`,
      label: timer?.label || formatTimerLabel(Number(timer?.seconds) || 0),
      seconds: Math.max(Math.round(Number(timer?.seconds) || 0), 0),
    })).filter((timer) => timer.seconds > 0),
  };
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();
  if (normalized === 'grams' || normalized === 'gram') return 'g';
  if (normalized === 'tablespoon' || normalized === 'tablespoons') return 'tbsp';
  if (normalized === 'teaspoon' || normalized === 'teaspoons') return 'tsp';
  if (normalized === 'c') return 'cup';
  if (normalized === 'cups') return 'cup';
  return normalized;
}

export function buildSearchText(recipe) {
  const ingredients = (recipe.ingredients || []).map((ingredient) => ingredient.name).join(' ');
  const steps = (recipe.steps || []).map((step) => step.text).join(' ');
  return [recipe.title, ingredients, steps].filter(Boolean).join(' ').slice(0, 10000);
}

export function buildManualRecipe(sourceText = '') {
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = lines[0] || 'Untitled recipe';
  const body = lines.slice(1);
  return normalizeRecipe({
    title,
    base_servings: 1,
    ingredients: [],
    steps: body.length ? body.map((line, index) => ({ id: `step_${index + 1}`, text: line })) : [],
    source_text: sourceText,
  });
}

export function formatIngredientLine(ingredient, scale = 1) {
  const normalized = normalizeIngredient(ingredient);
  const quantity = formatQuantity(normalized, scale);
  const note = normalized.note ? `, ${normalized.note}` : '';
  if (quantity) return `${quantity} ${normalized.name}${note}`;
  if (normalized.original_text) return normalized.original_text;
  return `${normalized.name}${note}`;
}

export function formatIngredientReference(ingredient, scale = 1) {
  const normalized = normalizeIngredient(ingredient);
  const quantity = formatQuantity(normalized, scale);
  return quantity ? `${quantity} ${normalized.name}` : normalized.name;
}

export function formatQuantity(ingredient, scale = 1) {
  const amount = toNullableNumber(ingredient.amount);
  const grams = toNullableNumber(ingredient.grams);
  const unit = normalizeUnit(ingredient.unit);

  if (amount === null && grams === null) return '';

  if (unit === 'kg') return `${formatNumber((amount || 0) * scale * 1000)} g`;
  if (unit === 'oz') return `${formatNumber((amount || 0) * scale * 28.3495)} g`;
  if (unit === 'lb') return `${formatNumber((amount || 0) * scale * 453.592)} g`;

  if (unit === 'g' || (!unit && grams !== null)) {
    const value = (unit === 'g' && amount !== null ? amount : grams) * scale;
    return `${formatNumber(value)} g`;
  }

  if (unit === 'l') {
    const value = (amount || 0) * scale * 1000;
    const gramText = grams !== null ? ` (${formatNumber(grams * scale)} g)` : '';
    return `${formatNumber(value)} ml${gramText}`;
  }

  if (VOLUME_UNITS.has(unit)) {
    const value = (amount || 0) * scale;
    const displayUnit = unit === 'cup' && Math.abs(value - 1) !== 0 ? 'cups' : unit;
    const gramText = grams !== null ? ` (${formatNumber(grams * scale)} g)` : '';
    return `${formatNumber(value)} ${displayUnit}${gramText}`;
  }

  if (amount !== null) {
    return `${formatNumber(amount * scale)}${unit ? ` ${unit}` : ''}`;
  }

  return grams !== null ? `${formatNumber(grams * scale)} g` : '';
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 100) return String(Math.round(value));
  if (abs >= 10) return String(Math.round(value * 10) / 10).replace(/\.0$/, '');
  if (abs >= 1) return String(Math.round(value * 10) / 10).replace(/\.0$/, '');
  return String(Math.round(value * 100) / 100).replace(/\.00?$/, '');
}

export function recipePreviewLines(recipe, maxLines = 10) {
  const lines = [];
  for (const ingredient of recipe.ingredients || []) {
    lines.push(formatIngredientLine(ingredient, 1));
    if (lines.length >= maxLines) return lines;
  }
  for (const step of recipe.steps || []) {
    lines.push(step.text);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}

export function buildStepSegments(step, ingredients, scale = 1) {
  const refs = Array.isArray(step?.ingredient_refs) ? step.ingredient_refs : [];
  const refIngredients = refs
    .map((id) => ingredients.find((ingredient) => ingredient.id === id))
    .filter(Boolean);

  if (!refIngredients.length) {
    return [{ text: step?.text || '', bold: false }];
  }

  const text = step?.text || '';
  const matches = [];
  for (const ingredient of refIngredients) {
    const name = ingredient.name.trim();
    if (!name) continue;
    const quantityPattern = String.raw`(?:\b\d+(?:[./]\d+)?(?:\.\d+)?\s*(?:g|grams?|kg|ml|l|tsp|tbsp|cups?|oz|lb)\s+)?`;
    const pattern = new RegExp(`${quantityPattern}${escapeRegExp(name)}`, 'i');
    const found = text.match(pattern);
    if (found?.index !== undefined) {
      matches.push({ index: found.index, length: found[0].length, ingredient });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  const nonOverlapping = [];
  let cursor = -1;
  for (const match of matches) {
    if (match.index >= cursor) {
      nonOverlapping.push(match);
      cursor = match.index + match.length;
    }
  }

  if (!nonOverlapping.length) return [{ text, bold: false }];

  const segments = [];
  let position = 0;
  for (const match of nonOverlapping) {
    if (match.index > position) {
      segments.push({ text: text.slice(position, match.index), bold: false });
    }
    segments.push({ text: formatIngredientReference(match.ingredient, scale), bold: true });
    position = match.index + match.length;
  }
  if (position < text.length) {
    segments.push({ text: text.slice(position), bold: false });
  }
  return segments;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rebuildStepReferences(stepText, ingredients, index = 0) {
  const lower = stepText.toLowerCase();
  const refs = ingredients
    .filter((ingredient) => ingredient.name && lower.includes(ingredient.name.toLowerCase()))
    .map((ingredient) => ingredient.id);

  return normalizeStep({
    id: `step_${index + 1}`,
    text: stepText,
    ingredient_refs: refs,
    timers: extractTimers(stepText),
  }, index);
}

export function extractTimers(text = '') {
  const timers = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const first = Number(match[1]);
    const second = match[2] ? Number(match[2]) : null;
    const value = second || first;
    const unit = match[3].toLowerCase();
    const seconds = unit.startsWith('hour') || unit.startsWith('hr')
      ? value * 3600
      : unit.startsWith('sec')
        ? value
        : value * 60;
    timers.push({
      label: match[0],
      seconds: Math.round(seconds),
    });
  }
  return timers;
}

export function formatTimerLabel(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins && secs) return `${mins}m ${secs}s`;
  if (mins) return `${mins} min`;
  return `${secs}s`;
}

export function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(ts) {
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatTimestamp(ts);
}
