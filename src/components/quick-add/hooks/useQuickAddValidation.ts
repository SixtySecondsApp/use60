import { useCallback } from 'react';
import type { QuickAddFormData, ValidationErrors } from '../types';

export const useQuickAddValidation = () => {
  const validateForm = useCallback((
    selectedAction: string | null,
    formData: QuickAddFormData,
    selectedContact: any
  ): { isValid: boolean; errors: ValidationErrors } => {
    const errors: ValidationErrors = {};
    
    if (selectedAction === 'task') {
      if (!formData.title.trim()) {
        errors.title = 'Task title is required';
      }
    }
    
    if (selectedAction === 'roadmap') {
      if (!formData.title.trim()) {
        errors.title = 'Title is required';
      }
      if (!formData.description.trim()) {
        errors.description = 'Description is required';
      }
      if (!formData.roadmap_type) {
        errors.roadmap_type = 'Request type is required';
      }
    }
    
    if (selectedAction === 'meeting' || selectedAction === 'proposal') {
      // Contact is required for meetings and proposals
      if (!selectedContact) {
        errors.contact = 'Please select a contact';
      }
      if (!formData.client_name?.trim() && !formData.company_website?.trim()) {
        errors.client_name = 'Either company name or website is required';
      }
      if (selectedAction === 'meeting' && !formData.details) {
        errors.details = 'Meeting type is required';
      }
    }

    if (selectedAction === 'sale') {
      // Contact is optional for sales
      if (!formData.client_name?.trim() && !formData.company_website?.trim()) {
        errors.client_name = 'Either company name or website is required';
      }
    }
    
    if (selectedAction !== 'outbound' && selectedAction !== 'meeting' && selectedAction !== 'proposal' && selectedAction !== 'sale' && selectedAction !== 'task' && selectedAction !== 'roadmap') {
      if (!formData.contactIdentifier) {
        errors.contactIdentifier = 'Contact identifier is required';
      }
      if (formData.contactIdentifierType === 'unknown') {
        errors.contactIdentifier = 'Please enter a valid email, phone number, or LinkedIn URL';
      }
    }
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }, []);

  return { validateForm };
};