import { describe, expect, it } from 'vitest';
import {
  canCountersignLabNotebookEntry,
  canDeleteLabNotebookEntry,
  canEditLabNotebookEntry,
  canResyncLabNotebookEntry,
  validateLabNotebookStatusUpdate,
} from '@/lib/labNotebook/access';

const draft = { status: 'Draft', created_by: 'author-1' };
const submitted = { status: 'Submitted', created_by: 'author-1' };
const countersigned = { status: 'Countersigned', created_by: 'author-1' };
const author = { id: 'author-1', role: 'scientist' };
const otherScientist = { id: 'scientist-2', role: 'scientist' };
const fellow = { id: 'fellow-1', role: 'research_fellow' };

describe('lab notebook access policy', () => {
  it('allows only the author to edit a draft', () => {
    expect(canEditLabNotebookEntry(draft, author, 'author@example.com').allowed).toBe(true);
    expect(canEditLabNotebookEntry(draft, otherScientist, 'user@example.com').allowed).toBe(false);
    expect(canEditLabNotebookEntry(submitted, author, 'author@example.com').allowed).toBe(false);
  });

  it('allows drafts to be submitted but not directly countersigned by update', () => {
    expect(validateLabNotebookStatusUpdate('Draft', 'Submitted').allowed).toBe(true);
    expect(validateLabNotebookStatusUpdate('Draft', 'Countersigned').allowed).toBe(false);
    expect(validateLabNotebookStatusUpdate('Submitted', 'Draft').allowed).toBe(false);
  });

  it('allows eligible reviewers to countersign submitted entries only', () => {
    expect(canCountersignLabNotebookEntry(submitted, fellow, 'fellow@example.com').allowed).toBe(true);
    expect(canCountersignLabNotebookEntry(draft, fellow, 'fellow@example.com').allowed).toBe(false);
    expect(canCountersignLabNotebookEntry(submitted, author, 'author@example.com').allowed).toBe(false);
  });

  it('allows draft deletion by author but not unrelated scientists', () => {
    expect(canDeleteLabNotebookEntry(draft, author, 'author@example.com').allowed).toBe(true);
    expect(canDeleteLabNotebookEntry(draft, otherScientist, 'user@example.com').allowed).toBe(false);
    expect(canDeleteLabNotebookEntry(submitted, fellow, 'fellow@example.com').allowed).toBe(false);
  });

  it('blocks resync after countersignature', () => {
    expect(canResyncLabNotebookEntry(submitted, fellow, 'fellow@example.com').allowed).toBe(true);
    expect(canResyncLabNotebookEntry(countersigned, fellow, 'fellow@example.com').allowed).toBe(false);
  });
});
