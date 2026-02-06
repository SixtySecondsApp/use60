/**
 * Activity Tracker Validation Tests
 *
 * Verifies that the QuickAdd validation hook correctly validates all activity types.
 *
 * Contact rules:
 * - Contact is REQUIRED for meeting and proposal
 * - Contact is optional for outbound and sale
 * - Company name or website required for meeting/proposal/sale
 * - Meeting type required for meetings
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuickAddValidation } from '@/components/quick-add/hooks/useQuickAddValidation';
import type { QuickAddFormData } from '@/components/quick-add/types';

const makeFormData = (overrides: Partial<QuickAddFormData> = {}): QuickAddFormData => ({
  type: '',
  client_name: '',
  details: '',
  amount: '',
  oneOffRevenue: '',
  monthlyMrr: '',
  saleType: '',
  outboundCount: '1',
  outboundType: 'Call',
  contactIdentifier: '',
  contactIdentifierType: 'email',
  status: 'completed',
  title: '',
  description: '',
  task_type: 'general',
  priority: 'medium',
  due_date: '',
  contact_name: '',
  company_website: '',
  deal_id: null,
  deal_name: '',
  selectedDeal: null,
  roadmap_type: 'feature',
  roadmap_priority: 'medium',
  ...overrides,
});

const mockContact = {
  id: 'contact-1',
  full_name: 'John Doe',
  email: 'john@example.com',
};

const getValidate = () => {
  const { result } = renderHook(() => useQuickAddValidation());
  return result.current.validateForm;
};

describe('Activity Tracker Validation', () => {
  // ─── OUTBOUND ───────────────────────────────────────────────

  describe('Outbound', () => {
    it('passes without a contact selected', () => {
      const validate = getValidate();
      const result = validate('outbound', makeFormData({ outboundType: 'Call', outboundCount: '5' }), null);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('passes with a contact selected', () => {
      const validate = getValidate();
      const result = validate('outbound', makeFormData({ outboundType: 'Email', outboundCount: '3' }), mockContact);
      expect(result.isValid).toBe(true);
    });
  });

  // ─── MEETING ────────────────────────────────────────────────

  describe('Meeting', () => {
    it('passes with contact and company name', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({ client_name: 'Acme Inc', details: 'Follow-up' }), mockContact);
      expect(result.isValid).toBe(true);
    });

    it('passes with contact and website', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({ company_website: 'www.acme.com', details: 'Demo' }), mockContact);
      expect(result.isValid).toBe(true);
    });

    it('fails without a contact', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({ client_name: 'Acme Inc', details: 'Discovery' }), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.contact).toBeDefined();
    });

    it('fails when neither company name nor website is provided', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({ details: 'Discovery' }), mockContact);
      expect(result.isValid).toBe(false);
      expect(result.errors.client_name).toBeDefined();
    });

    it('fails when meeting type is not selected', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({ client_name: 'Acme Inc', details: '' }), mockContact);
      expect(result.isValid).toBe(false);
      expect(result.errors.details).toBeDefined();
    });

    it('fails when contact, company, and meeting type are all missing', () => {
      const validate = getValidate();
      const result = validate('meeting', makeFormData({}), null);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── PROPOSAL ───────────────────────────────────────────────

  describe('Proposal', () => {
    it('passes with contact and company', () => {
      const validate = getValidate();
      const result = validate('proposal', makeFormData({ client_name: 'BigCorp' }), mockContact);
      expect(result.isValid).toBe(true);
    });

    it('passes with contact and website', () => {
      const validate = getValidate();
      const result = validate('proposal', makeFormData({ company_website: 'www.bigcorp.com' }), mockContact);
      expect(result.isValid).toBe(true);
    });

    it('fails without a contact', () => {
      const validate = getValidate();
      const result = validate('proposal', makeFormData({ client_name: 'BigCorp' }), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.contact).toBeDefined();
    });

    it('fails when neither company name nor website is provided', () => {
      const validate = getValidate();
      const result = validate('proposal', makeFormData({}), mockContact);
      expect(result.isValid).toBe(false);
      expect(result.errors.client_name).toBeDefined();
    });
  });

  // ─── SALE ───────────────────────────────────────────────────

  describe('Sale', () => {
    it('passes without a contact when company name is provided', () => {
      const validate = getValidate();
      const result = validate('sale', makeFormData({ client_name: 'WonDeal Ltd' }), null);
      expect(result.isValid).toBe(true);
    });

    it('passes with contact and company', () => {
      const validate = getValidate();
      const result = validate('sale', makeFormData({ client_name: 'WonDeal Ltd' }), mockContact);
      expect(result.isValid).toBe(true);
    });

    it('passes with website instead of company name', () => {
      const validate = getValidate();
      const result = validate('sale', makeFormData({ company_website: 'www.wondeal.com' }), null);
      expect(result.isValid).toBe(true);
    });

    it('fails when neither company name nor website is provided', () => {
      const validate = getValidate();
      const result = validate('sale', makeFormData({}), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.client_name).toBeDefined();
    });
  });

  // ─── TASK ───────────────────────────────────────────────────

  describe('Task', () => {
    it('passes with a title', () => {
      const validate = getValidate();
      const result = validate('task', makeFormData({ title: 'Follow up with client' }), null);
      expect(result.isValid).toBe(true);
    });

    it('fails without a title', () => {
      const validate = getValidate();
      const result = validate('task', makeFormData({ title: '' }), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('fails with whitespace-only title', () => {
      const validate = getValidate();
      const result = validate('task', makeFormData({ title: '   ' }), null);
      expect(result.isValid).toBe(false);
    });
  });

  // ─── ROADMAP ────────────────────────────────────────────────

  describe('Roadmap', () => {
    it('passes with title, description, and type', () => {
      const validate = getValidate();
      const result = validate('roadmap', makeFormData({
        title: 'Dark mode',
        description: 'Add dark mode',
        roadmap_type: 'feature',
      }), null);
      expect(result.isValid).toBe(true);
    });

    it('fails without a description', () => {
      const validate = getValidate();
      const result = validate('roadmap', makeFormData({
        title: 'Dark mode',
        description: '',
        roadmap_type: 'feature',
      }), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toBeDefined();
    });

    it('fails without a title', () => {
      const validate = getValidate();
      const result = validate('roadmap', makeFormData({
        title: '',
        description: 'Add dark mode',
        roadmap_type: 'feature',
      }), null);
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });
  });

  // ─── CONTACT OPTIONAL FOR OUTBOUND & SALE ───────────────────

  describe('Contact is optional for outbound and sale', () => {
    const optionalContactTypes = ['outbound', 'sale'];

    optionalContactTypes.forEach((type) => {
      it(`${type}: validation does not require contact`, () => {
        const validate = getValidate();
        const formData = makeFormData({
          client_name: 'Test Company',
          details: type === 'meeting' ? 'Discovery' : 'Test details',
          outboundType: 'Call',
          outboundCount: '1',
        });
        const result = validate(type, formData, null); // null contact
        expect(result.errors.contact).toBeUndefined();
      });
    });
  });

  // ─── CONTACT REQUIRED FOR MEETING & PROPOSAL ──────────────

  describe('Contact is required for meeting and proposal', () => {
    const requiredContactTypes = ['meeting', 'proposal'];

    requiredContactTypes.forEach((type) => {
      it(`${type}: validation requires contact`, () => {
        const validate = getValidate();
        const formData = makeFormData({
          client_name: 'Test Company',
          details: type === 'meeting' ? 'Discovery' : 'Test details',
        });
        const result = validate(type, formData, null); // null contact
        expect(result.errors.contact).toBeDefined();
      });

      it(`${type}: passes with contact provided`, () => {
        const validate = getValidate();
        const formData = makeFormData({
          client_name: 'Test Company',
          details: type === 'meeting' ? 'Discovery' : 'Test details',
        });
        const result = validate(type, formData, mockContact);
        expect(result.errors.contact).toBeUndefined();
      });
    });
  });
});
