import { expect, it, vi } from 'vitest';
import { planReviewOf } from './PlanReview';
vi.mock('react-native', () => ({}));
vi.mock('@expo/vector-icons', () => ({}));
vi.mock('../state/app', () => ({}));
vi.mock('./Dialog', () => ({}));
vi.mock('./MessageMarkdown', () => ({}));
vi.mock('./ui', () => ({}));
vi.mock('./Loader', () => ({}));
vi.mock('../lib/harness', () => ({}));

// Exact request shape built by dsh-plan-mode's exit_plan_mode tool.
const frame = { eventId: 'e1', clientId: 'c1', request: { questions: [{ id: 'plan-review', header: 'Plan review', question: 'Approve this plan and leave plan mode?', detail: '# Add README\n\n1. Create README.md', options: [{ label: 'Approve' }, { label: 'Keep planning' }], intent: { kind: 'plan-review', approve: 'Approve', callId: 't1' } }] } } as any;

it('detects a plan review request and extracts the plan', () => {
  expect(planReviewOf(frame)).toEqual({ id: 'plan-review', plan: '# Add README\n\n1. Create README.md', approve: 'Approve' });
});
it('ignores ordinary questions', () => {
  expect(planReviewOf({ request: { questions: [{ id: 'q', question: 'Pick one', options: [] }] } } as any)).toBeNull();
});
