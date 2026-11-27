import express from 'express';
import { createClient } from '@supabase/supabase-js';

type ModerationResult = { classification: 'appropriate' | 'flagged' | 'blocked'; confidence: 'high' | 'medium' | 'low'; reason: string };
type OpenAIModerationResponse = {
  results?: Array<{
    flagged?: unknown;
    categories?: Record<string, unknown>;
    category_scores?: Record<string, unknown>;
  }>;
};
type ModerationSignal = NonNullable<OpenAIModerationResponse['results']>[number];
class ModerationUnavailableError extends Error {}

const flagThreshold = 0.5;
const targetedAbuseCategories = ['harassment', 'harassment/threatening', 'hate', 'hate/threatening'];
const targetedAbuseFlagThreshold = 0.15;
const blockThresholds: Record<string, number> = {
  hate: 0.25,
  'hate/threatening': 0.25,
  'harassment/threatening': 0.25,
  sexual: 0.35,
  'sexual/minors': 0.15,
  'self-harm': 0.35,
  'self-harm/instructions': 0.25,
  'self-harm/intent': 0.25,
  violence: 0.35,
  'violence/graphic': 0.35,
};

function configuredHardBlockTerms(env: NodeJS.ProcessEnv): string[] {
  return [...new Set((env.COURSE_REVIEW_HARD_BLOCK_TERMS ?? '')
    .split(/[\r\n,]+/)
    .map(term => term.trim())
    .filter(Boolean))];
}const leetCharacters: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a',
  '5': 's', '7': 't', '@': 'a', '$': 's',
};

function normalizeForWordFilter(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[01!3457@$]/g, (character) => leetCharacters[character] ?? character)
    .replace(/(\p{L})\1+/gu, '$1');
}

function findHardBlockTerm(input: string, hardBlockTerms: readonly string[]): string | undefined {
  const normalized = normalizeForWordFilter(input);
  for (const term of hardBlockTerms) {
    const canonicalTerm = normalizeForWordFilter(term);
    const separatedLetters = [...canonicalTerm].join('[^\\p{L}\\p{N}]*');
    const wholeTerm = new RegExp('(?:^|[^\\p{L}\\p{N}])' + separatedLetters + '(?=$|[^\\p{L}\\p{N}])', 'u');
    if (wholeTerm.test(normalized)) return term;
  }
  return undefined;
}

function buildModerationInputs(review: string): string[] {
  const clauses = review
    .split(/(?<=[.!?;,:])\s+|\s+(?:and|but|yet)\s+/iu)
    .map(clause => clause.trim())
    .filter(Boolean);
  const candidates = [review.trim()];
  for (let index = 0; index < clauses.length; index++) {
    const clause = clauses[index];
    if (!clause) continue;
    if (clause.length >= 12) candidates.push(clause);
    const next = clauses[index + 1];
    if (next) candidates.push(`${clause}. ${next}`);
  }
  const unique = [...new Set(candidates)];
  if (unique.length <= 25) return unique;

  // Keep the full review at index zero and sample the remaining fragments
  // across the text so long reviews retain coverage at both ends and middle.
  const fragments = unique.slice(1);
  const selected = Array.from({ length: 24 }, (_, index) =>
    fragments[Math.round(index * (fragments.length - 1) / 23)],
  ).filter((fragment): fragment is string => typeof fragment === 'string');
  return [review.trim(), ...new Set(selected)];
}

function hasTargetedMisfortuneWish(review: string): boolean {
  const text = normalizeForWordFilter(review);
  const expressesWish = /\b(?:i|we)\s+(?:really\s+)?(?:hope|wish|pray|want)\b|\b(?:hopefully|may)\b/i.test(text);
  const identifiesPerson = /\b(?:prof(?:essor)?|instructor|teacher|lecturer)\b|\b(?:wife|husband|spouse|partner|children|kids|family)\b/i.test(text);
  const wishesSeriousMisfortune =
    /\b(?:get|gets|got|have|has|develop|develops|diagnosed with|come down with|suffer from)\s+(?:(?:a|an|serious|terminal|incurable)\s+)*(?:cancer|tumou?r|disease|illness)\b/i.test(text)
    || /\b(?:die|dies|death|deathbed|killed|kill|die alone|dies alone)\b/i.test(text)
    || /\b(?:cheat|cheats|cheated|cheating) on\b/i.test(text)
    || /\b(?:abandon|abandons|abandoned|abandoning)\b/i.test(text)
    || /\b(?:alone with no|without any)\s+(?:family|friends)\b/i.test(text);
  return expressesWish && identifiesPerson && wishesSeriousMisfortune;
}

function containsDirectThreat(review: string): boolean {
  return /\b(?:i|we)\s+(?:(?:am|are)\s+going to|will|plan to|intend to|want to)\s+(?:hurt|harm|kill|rape|attack|shoot|stab|poison)\b/i.test(review);
}

function validateModerationSignal(value: ModerationSignal): value is ModerationSignal & {
  flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number>
} {
  return typeof value.flagged === 'boolean'
    && !!value.category_scores && !!value.categories
    && Object.values(value.categories).every(item => typeof item === 'boolean')
    && Object.values(value.category_scores).every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1);
}

export async function classifyCourseReview(review: string, env: NodeJS.ProcessEnv = process.env): Promise<ModerationResult> {
  if (findHardBlockTerm(review, configuredHardBlockTerms(env))) {
    return { classification: 'blocked', confidence: 'high', reason: 'explicit-language' };
  }
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new ModerationUnavailableError('OpenAI moderation is not configured.');
  const inputs = buildModerationInputs(review);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: inputs }),
    });
    if (!response.ok) throw new ModerationUnavailableError('OpenAI moderation request failed.');
    const payload = await response.json() as OpenAIModerationResponse;
    const results = payload.results;
    if (!Array.isArray(results) || results.length !== inputs.length || results.some(result => !validateModerationSignal(result))) {
      throw new ModerationUnavailableError('Invalid OpenAI moderation response.');
    }
    const signals = results as Array<ModerationSignal & { flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }>;
    const scoreFor = (category: string) => Math.max(0, ...signals.map(signal => signal.category_scores[category] ?? 0));
    const targetedAbuseScore = Math.max(...targetedAbuseCategories.map(scoreFor));
    const highestScore = Math.max(0, ...signals.flatMap(signal => Object.values(signal.category_scores)));
    const strongestCategory = signals.flatMap(signal => Object.entries(signal.category_scores))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    const blockingCategory = Object.entries(blockThresholds)
      .find(([name, threshold]) => scoreFor(name) >= threshold)?.[0];
    const targetedMisfortuneWish = hasTargetedMisfortuneWish(review);
    const directThreat = containsDirectThreat(review);
    const wishRelatedBlock = ['harassment/threatening', 'violence', 'violence/graphic'].includes(blockingCategory ?? '');
    if (directThreat) {
      return { classification: 'blocked', confidence: 'high', reason: 'direct-threat' };
    }
    if (targetedMisfortuneWish && !directThreat && (!blockingCategory || wishRelatedBlock)) {
      return { classification: 'flagged', confidence: 'medium', reason: 'targeted-misfortune-wish' };
    }
    if (blockingCategory) {
      return { classification: 'blocked', confidence: 'high', reason: blockingCategory };
    }
    const apiFlagged = signals.some(signal => signal.flagged);
    const targetedAbuseFlagged = targetedAbuseCategories.some(name => signals.some(signal => signal.categories[name]));
    if (apiFlagged || highestScore >= flagThreshold || targetedAbuseFlagged || targetedAbuseScore >= targetedAbuseFlagThreshold) {
      return { classification: 'flagged', confidence: highestScore >= flagThreshold || targetedAbuseScore >= targetedAbuseFlagThreshold ? 'medium' : 'low', reason: strongestCategory };
    }
    return { classification: 'appropriate', confidence: 'high', reason: 'none' };
  } catch (error) {
    if (error instanceof ModerationUnavailableError) throw error;
    throw new ModerationUnavailableError('OpenAI moderation could not be reached.');
  } finally { clearTimeout(timeout); }
}

export function courseReviewRouter(env: NodeJS.ProcessEnv = process.env, dependencies: {
  createClient?: typeof createClient;
  classify?: typeof classifyCourseReview;
} = {}) {
  const router = express.Router();
  const supabase = dependencies.createClient ?? createClient;
  const classify = dependencies.classify ?? classifyCourseReview;
  async function managementContext(authorization: string | undefined) {
    const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return { error: { status: 401, message: 'Sign in to manage your reviews.' } } as const;
    const url = env.SUPABASE_URL, publishableKey = env.SUPABASE_PUBLISHABLE_KEY, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey || !serviceKey) return { error: { status: 503, message: 'Review management is not configured on the server.' } } as const;
    const userClient = supabase(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return { error: { status: 401, message: 'Sign in again to manage your reviews.' } } as const;
    const { data: eligible, error: eligibilityError } = await userClient.rpc('account_is_eligible');
    if (eligibilityError || eligible !== true) return { error: { status: 403, message: 'An eligible student account is required to manage reviews.' } } as const;
    const admin = supabase(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return { admin, userId: auth.user.id } as const;
  }
  router.get('/mine', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const context = await managementContext(req.headers.authorization);
      if ('error' in context) { res.status(context.error.status).json({ error: context.error.message }); return; }
      const { data, error } = await context.admin.from('course_reviews')
        .select('id,offering_id,weekly_hours,difficulty,class_rating,would_recommend,review,moderation_status,created_at')
        .eq('user_id', context.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ reviews: data ?? [] });
    } catch {
      res.status(503).json({ error: 'Your reviews could not be loaded. Please retry.' });
    }
  });
  router.patch('/:reviewId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const reviewId = req.params.reviewId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
      res.status(404).json({ error: 'Review not found.' }); return;
    }
    const { weeklyHours, difficulty, classRating, wouldRecommend, review } = req.body ?? {};
    if (typeof weeklyHours !== 'number' || !Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 40 ||
        !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 ||
        !Number.isInteger(classRating) || classRating < 1 || classRating > 5 || typeof wouldRecommend !== 'boolean' ||
        typeof review !== 'string' || review.length > 1000) {
      res.status(400).json({ error: 'Check the hours, ratings, recommendation, and review length.' }); return;
    }
    try {
      const context = await managementContext(req.headers.authorization);
      if ('error' in context) { res.status(context.error.status).json({ error: context.error.message }); return; }
      const moderation = review.trim() ? await classify(review.trim(), env) : { classification: 'appropriate' as const, confidence: 'high' as const, reason: 'none' };
      if (moderation.classification === 'blocked') {
        res.status(422).json({ error: 'This review was blocked because it contains explicit language or appears to contain severe abuse or hateful content. Edit it and try again.' }); return;
      }
      const { data, error } = await context.admin.from('course_reviews').update({
        weekly_hours: weeklyHours, difficulty, class_rating: classRating,
        would_recommend: wouldRecommend, review: review.trim(), moderation_status: moderation.classification,
      }).eq('id', reviewId).eq('user_id', context.userId)
        .select('id,offering_id,weekly_hours,difficulty,class_rating,would_recommend,review,moderation_status,created_at').maybeSingle();
      if (error) throw error;
      if (!data) { res.status(404).json({ error: 'Review not found.' }); return; }
      res.json({ review: data, moderationStatus: moderation.classification });
    } catch (error) {
      if (error instanceof ModerationUnavailableError || (error instanceof Error && error.name === 'AbortError')) {
        res.status(503).json({ error: 'OpenAI moderation is unavailable. Your saved review is unchanged; retry your edit later.' }); return;
      }
      res.status(503).json({ error: 'Your review could not be updated. Your saved review is unchanged; please retry.' });
    }
  });
  router.delete('/:reviewId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const reviewId = req.params.reviewId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
      res.status(404).json({ error: 'Review not found.' }); return;
    }
    try {
      const context = await managementContext(req.headers.authorization);
      if ('error' in context) { res.status(context.error.status).json({ error: context.error.message }); return; }
      const { data, error } = await context.admin.from('course_reviews').delete()
        .eq('id', reviewId).eq('user_id', context.userId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) { res.status(404).json({ error: 'Review not found.' }); return; }
      res.status(204).end();
    } catch {
      res.status(503).json({ error: 'Your review could not be deleted. It remains saved; please retry.' });
    }
  });
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in to publish a review.' }); return; }
    const { offeringId, weeklyHours, difficulty, classRating, wouldRecommend, review } = req.body ?? {};
    if (typeof offeringId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(offeringId) ||
        typeof weeklyHours !== 'number' || !Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 40 ||
        !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 ||
        !Number.isInteger(classRating) || classRating < 1 || classRating > 5 || typeof wouldRecommend !== 'boolean' ||
        typeof review !== 'string' || review.length > 1000) {
      res.status(400).json({ error: 'Check the offering, hours, ratings, recommendation, and review length.' }); return;
    }
    const url = env.SUPABASE_URL, publishableKey = env.SUPABASE_PUBLISHABLE_KEY, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey || !serviceKey) { res.status(503).json({ error: 'Review publishing is not configured on the server.' }); return; }
    try {
      const userClient = supabase(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authError } = await userClient.auth.getUser(token);
      if (authError || !auth.user) { res.status(401).json({ error: 'Sign in again before publishing.' }); return; }
      const { data: eligible, error: eligibilityError } = await userClient.rpc('account_is_eligible');
      if (eligibilityError || eligible !== true) { res.status(403).json({ error: 'An eligible student account is required to publish a review.' }); return; }
      const admin = supabase(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: enrollment, error: enrollmentError } = await admin.from('course_enrollments')
        .select('id')
        .eq('user_id', auth.user.id)
        .eq('course_offering_id', offeringId)
        .eq('verification_status', 'verified')
        .maybeSingle();
      if (enrollmentError) throw enrollmentError;
      if (!enrollment) { res.status(403).json({ error: 'A verified enrollment in this exact offering is required to publish a review.' }); return; }
      const { data: existing, error: lookupError } = await admin.from('course_reviews').select('id').eq('user_id', auth.user.id).eq('offering_id', offeringId).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) { res.status(409).json({ error: 'You have already published a review for this offering.' }); return; }
      const moderation = review.trim() ? await classify(review.trim(), env) : { classification: 'appropriate' as const, confidence: 'high' as const, reason: 'none' };
      if (moderation.classification === 'blocked') { res.status(422).json({ error: 'This review was blocked because it contains explicit language or appears to contain severe abuse or hateful content. Edit it and try again.' }); return; }
      const { error: insertError } = await admin.from('course_reviews').insert({
        offering_id: offeringId, user_id: auth.user.id, weekly_hours: weeklyHours,
        difficulty, class_rating: classRating, would_recommend: wouldRecommend,
        review: review.trim(), moderation_status: moderation.classification,
      });
      if (insertError?.code === '23505') { res.status(409).json({ error: 'You have already published a review for this offering.' }); return; }
      if (insertError) throw insertError;
      res.status(201).json({ moderationStatus: moderation.classification });
    } catch (error) {
      if (error instanceof ModerationUnavailableError || (error instanceof Error && error.name === 'AbortError')) {
        res.status(503).json({ error: 'OpenAI moderation is unavailable. Check the server API key and internet connection, then retry; your draft is still here.' }); return;
      }
      res.status(503).json({ error: 'Review could not be checked or saved. Confirm the database migration is applied, then retry.' });
    }
  });
  return router;
}
