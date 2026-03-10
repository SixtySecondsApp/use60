import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, User } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogFooter,
  DialogTitle,
  DialogDescription 
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useForm, FormProvider } from 'react-hook-form';
import { toast } from 'sonner';
import { useContacts } from '@/lib/hooks/useContacts';
import { useCompanies } from '@/lib/hooks/useCompanies';
import type { Contact } from '@/lib/database/models';
import logger from '@/lib/utils/logger';

interface ContactEditModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  contact: Contact;
  onClose?: () => void;
}

const ContactEditModal: React.FC<ContactEditModalProps> = ({ 
  open, 
  setOpen, 
  contact,
  onClose
}) => {

  const { updateContact } = useContacts();
  const { companies } = useCompanies();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Create a form instance
  const methods = useForm({
    defaultValues: {
      first_name: contact?.first_name || '',
      last_name: contact?.last_name || '',
      email: contact?.email || '',
      phone: contact?.phone || '',
      title: contact?.title || '',
      linkedin_url: contact?.linkedin_url || '',
      company_id: contact?.company_id || '',
      is_primary: contact?.is_primary || false,
      category: (contact as any)?.category || 'prospect',
    }
  });
  
  // Refs for focus management
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  
  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };
  
  const handleClose = () => {
    setOpen(false);
    if (onClose) {
      onClose();
    }
  };
  
  // Handle save with form validation
  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      const formIsValid = await methods.trigger();
      if (!formIsValid) {
        const errors = methods.formState.errors;
        logger.error("Form validation errors:", errors);
        toast.error("Please fix the highlighted fields.");
        setIsSaving(false);
        return;
      }
      
      const formData = methods.getValues();
      
      // Prepare data for update
      const dataToSave = {
        first_name: formData.first_name || undefined,
        last_name: formData.last_name || undefined,
        email: formData.email,
        phone: formData.phone || undefined,
        title: formData.title || undefined,
        linkedin_url: formData.linkedin_url || undefined,
        company_id: formData.company_id || undefined,
        is_primary: formData.is_primary,
        category: formData.category || 'prospect',
      };
      
      logger.log("Saving contact with data:", dataToSave);
      await updateContact(contact.id, dataToSave);
      
      toast.success("Contact has been successfully updated.");
      
      handleClose();
    } catch (error) {
      logger.error("Error saving contact:", error);
      toast.error("There was a problem saving your changes.");
    } finally {
      setIsSaving(false);
    }
  };
  
  // Reset form when modal opens
  useEffect(() => {
    if (open && contact) {
      methods.reset({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        title: contact.title || '',
        linkedin_url: contact.linkedin_url || '',
        company_id: contact.company_id || '',
        is_primary: contact.is_primary || false,
        category: (contact as any)?.category || 'prospect',
      });
      
      // Focus the first interactive element after opening
      setTimeout(() => {
        if (initialFocusRef.current) {
          initialFocusRef.current.focus();
        }
      }, 100);
    }
  }, [open, contact, methods]);

  if (!contact) return null;

  return (
    <FormProvider {...methods}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          ref={dialogContentRef}
          className="max-w-[600px] p-0 overflow-hidden bg-gray-950 border border-gray-800 rounded-xl"
          onKeyDown={handleKeyDown}
        >
          <DialogHeader className="p-4 border-b border-gray-800 relative flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <User className="w-4 h-4" />
              </div>
              <DialogTitle className="text-xl font-semibold text-white">
                Edit Contact
              </DialogTitle>
            </div>
            
            <button
              ref={closeButtonRef}
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-opacity-50 rounded-md"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          <DialogDescription className="sr-only">
            Edit the contact details including name, email, phone, and company information.
          </DialogDescription>
          
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name" className="text-sm font-medium text-gray-300 mb-1">
                  First Name
                </Label>
                <Input
                  {...methods.register('first_name')}
                  ref={initialFocusRef}
                  id="first_name"
                  type="text"
                  className="w-full"
                  placeholder="John"
                />
              </div>
              
              <div>
                <Label htmlFor="last_name" className="text-sm font-medium text-gray-300 mb-1">
                  Last Name
                </Label>
                <Input
                  {...methods.register('last_name')}
                  id="last_name"
                  type="text"
                  className="w-full"
                  placeholder="Doe"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-300 mb-1">
                Email <span className="text-red-400">*</span>
              </Label>
              <Input
                {...methods.register('email', { 
                  required: 'Email is required',
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: 'Invalid email address'
                  }
                })}
                id="email"
                type="email"
                className="w-full"
                placeholder="john.doe@example.com"
              />
              {methods.formState.errors.email && (
                <p className="mt-1 text-sm text-red-400">{methods.formState.errors.email.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="phone" className="text-sm font-medium text-gray-300 mb-1">
                Phone
              </Label>
              <Input
                {...methods.register('phone')}
                id="phone"
                type="tel"
                className="w-full"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            
            <div>
              <Label htmlFor="title" className="text-sm font-medium text-gray-300 mb-1">
                Job Title
              </Label>
              <Input
                {...methods.register('title')}
                id="title"
                type="text"
                className="w-full"
                placeholder="Sales Manager"
              />
            </div>
            
            <div>
              <Label htmlFor="company_id" className="text-sm font-medium text-gray-300 mb-1">
                Company
              </Label>
              <select
                {...methods.register('company_id')}
                id="company_id"
                className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">No Company</option>
                {companies?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <Label htmlFor="category" className="text-sm font-medium text-gray-300 mb-1">
                Category
              </Label>
              <select
                {...methods.register('category')}
                id="category"
                className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
                <option value="partner">Partner</option>
                <option value="supplier">Supplier</option>
                <option value="employee">Employee</option>
                <option value="investor">Investor</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="linkedin_url" className="text-sm font-medium text-gray-300 mb-1">
                LinkedIn URL
              </Label>
              <Input
                {...methods.register('linkedin_url')}
                id="linkedin_url"
                type="url"
                className="w-full"
                placeholder="https://linkedin.com/in/johndoe"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                {...methods.register('is_primary')}
                id="is_primary"
                type="checkbox"
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-gray-900"
              />
              <Label htmlFor="is_primary" className="text-sm font-medium text-gray-300 cursor-pointer">
                Primary Contact
              </Label>
            </div>
          </div>
          
          <DialogFooter className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-end">
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="py-2 px-4 rounded-lg text-gray-300 bg-gray-800 hover:bg-gray-700
                  transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-opacity-50"
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                ref={saveButtonRef}
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 
                  text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                  disabled:bg-blue-600/70 disabled:cursor-not-allowed"
                aria-label="Save contact"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin mr-1">
                      <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </>
                )}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
};

export default ContactEditModal;