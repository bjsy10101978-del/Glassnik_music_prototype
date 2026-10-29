/**
 * Loads the project's real JSON datasets for the application.
 *
 * The files are imported directly from `data/` so the prototype always runs
 * against the repository data rather than a duplicated demo copy.
 */
import taxonomyJson from '../../data/taxonomy.json';
import catalogueJson from '../../data/catalogue.json';
import experiencesJson from '../../data/sample_experiences.json';
import type { Experience, Taxonomy, Track } from '../types';

interface CatalogueDocument {
  schema_version?: string;
  dataset_status?: string;
  counts?: Record<string, number>;
  important_notice?: string;
  track_schema?: Record<string, string>;
  tracks?: Track[];
}

interface ExperiencesDocument {
  schema_version?: string;
  description?: string;
  experiences?: Experience[];
}

const taxonomy = taxonomyJson as unknown as Taxonomy;
const catalogue = catalogueJson as unknown as CatalogueDocument;
const experiencesDoc = experiencesJson as unknown as ExperiencesDocument;

export const taxonomyData: Taxonomy = taxonomy;
export const tracks: Track[] = Array.isArray(catalogue.tracks) ? catalogue.tracks : [];
export const experiences: Experience[] = Array.isArray(experiencesDoc.experiences)
  ? experiencesDoc.experiences
  : [];

export const datasetStatus: string = catalogue.dataset_status ?? 'unknown';
export const datasetNotice: string = catalogue.important_notice ?? '';
export const datasetDescription: string = experiencesDoc.description ?? '';
