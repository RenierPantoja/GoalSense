/**
 * Vercel Control Plane — Sanitized Public Read Model (B66)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the sanitized `controlPlanePublicSummaries` collection (published by the
 * local worker via Admin SDK). This is the PREFERRED read path; raw collection
 * reads are a transitional fallback gated by ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK.
 */
import { getFirebaseControlPlaneEnvStatus } from './_firebaseControlPlaneEnv.js';

type FirestoreValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };

function fieldValue(value: FirestoreValue | undefined): any {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fieldValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [k, fieldValue(v)]));
  return null;
}

function docData(doc: any) {
  const fields = doc?.fields || {};
  const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldValue(v as FirestoreValue)]));
  return { id: String(doc?.name || '').split('/').pop(), ...data };
}

const PUBLIC_COLLECTION = 'controlPlanePublicSummaries';

async function readPublicSummaries() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    return { ok: false as const, status: 0, permissionDenied: false, missing: true, items: [] as any[] };
  }
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${PUBLIC_COLLECTION}`);
  url.searchParams.set('pageSize', '20');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res) return { ok: false as const, status: 0, permissionDenied: false, missing: false, items: [] };
  if (!res.ok) {
    return { ok: false as const, status: res.status, permissionDenied: res.status === 403, missing: res.status === 404, items: [] };
  }
  const json = await res.json().catch(() => ({}));
  return { ok: true as const, status: 200, permissionDenied: false, missing: false, items: (json.documents || []).map(docData) };
}

export interface PublicControlPlaneReadResult {
  publicReadModelEnabled: boolean;
  rawFallbackEnabled: boolean;
  publicSummaryReadable: boolean;
  missingPublicSummary: boolean;
  permissionDeniedPublicSummary: boolean;
  sanitizedSnapshotGeneratedAt: string | null;
  sanitizedSnapshotFreshness: string | null;
  dataMode: 'sanitized_read_model' | 'raw_fallback' | 'missing_public_summary' | 'permission_denied';
  publicExposure: 'minimal' | 'transitional_raw_read' | 'blocked' | 'unknown';
  summaries: Record<string, any>;
}

export async function getPublicControlPlaneReadModel(): Promise<PublicControlPlaneReadResult> {
  const env = getFirebaseControlPlaneEnvStatus();
  const publicReadModelEnabled = String(process.env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL ?? 'true') === 'true';
  const rawFallbackEnabled = String(process.env.ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK ?? 'false') === 'true';

  if (env.requiredMissing.length > 0) {
    return {
      publicReadModelEnabled,
      rawFallbackEnabled,
      publicSummaryReadable: false,
      missingPublicSummary: false,
      permissionDeniedPublicSummary: false,
      sanitizedSnapshotGeneratedAt: null,
      sanitizedSnapshotFreshness: null,
      dataMode: 'missing_public_summary',
      publicExposure: 'unknown',
      summaries: {},
    };
  }

  const read = await readPublicSummaries();
  const summaries: Record<string, any> = {};
  for (const item of read.items) {
    if (item?.id) summaries[item.id] = item.data ?? item;
  }
  const freshnessDoc = summaries['freshness'] || null;
  const workerDoc = summaries['latestWorkerStatus'] || null;
  const generatedAt = read.items.map((i: any) => i.generatedAt).filter(Boolean).sort().at(-1) || null;

  const publicSummaryReadable = read.ok && read.items.length > 0;
  const missingPublicSummary = read.ok ? read.items.length === 0 : read.missing;
  const permissionDeniedPublicSummary = read.permissionDenied;

  let dataMode: PublicControlPlaneReadResult['dataMode'];
  let publicExposure: PublicControlPlaneReadResult['publicExposure'];
  if (permissionDeniedPublicSummary) {
    dataMode = 'permission_denied';
    publicExposure = 'blocked';
  } else if (publicSummaryReadable) {
    dataMode = 'sanitized_read_model';
    publicExposure = 'minimal';
  } else if (rawFallbackEnabled) {
    dataMode = 'raw_fallback';
    publicExposure = 'transitional_raw_read';
  } else {
    dataMode = 'missing_public_summary';
    publicExposure = 'minimal';
  }

  return {
    publicReadModelEnabled,
    rawFallbackEnabled,
    publicSummaryReadable,
    missingPublicSummary,
    permissionDeniedPublicSummary,
    sanitizedSnapshotGeneratedAt: generatedAt,
    sanitizedSnapshotFreshness: freshnessDoc?.freshnessStatus || workerDoc?.freshnessStatus || null,
    dataMode,
    publicExposure,
    summaries,
  };
}

/**
 * B69: sanitized signal-quality view for the hosted control plane.
 * Reads latestSignalQualitySummary / latestSignalQualityCasesPreview from the
 * public summaries. Never reads raw collections.
 */
export async function getPublicSignalQualityReadModel() {
  const model = await getPublicControlPlaneReadModel();
  const summary = model.summaries?.['latestSignalQualitySummary'] || null;
  const preview = model.summaries?.['latestSignalQualityCasesPreview'] || null;
  const campaign = model.summaries?.['latestSignalQualityCampaignSummary'] || null;
  const humanReview = model.summaries?.['latestHumanReviewQueueSummary'] || null;
  const baseline = model.summaries?.['latestSignalReliabilityBaseline'] || null;
  const available = !!summary && summary.available !== false;
  return {
    observeOnly: true,
    signalQualityAvailable: available,
    controlPlaneDataMode: model.dataMode,
    publicExposure: model.publicExposure,
    rawFallbackEnabled: model.rawFallbackEnabled,
    signalQualityFreshness: model.sanitizedSnapshotFreshness,
    generatedAt: summary?.generatedAt ?? model.sanitizedSnapshotGeneratedAt ?? null,
    sampleSize: summary?.sampleSize ?? 0,
    summary: available ? summary : null,
    casesPreview: preview?.cases ?? [],
    campaign,
    humanReview,
    baseline,
    status: available ? 'sanitized_read_model' : 'missing_public_signal_quality_summary',
    limitations: available
      ? ['Observe only; sanitized public signal-quality summary.']
      : ['No sanitized signal-quality summary published yet (not a failure).'],
  };
}
