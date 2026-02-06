/**
 * Component Mediator for Complex Component Interactions
 * Implements Mediator pattern for coordinating multiple components
 * Reduces coupling by centralizing component communication
 */

import React from 'react';
import { eventBus, EventName, EventData } from './EventBus';
import { IComponentMediator, IComponentCommunication } from './ComponentInterfaces';
import { getServiceAdapter } from './ServiceAdapters';

interface ComponentRegistration {
  id: string;
  component: IComponentCommunication;
  subscriptions: Array<() => void>;
  metadata: {
    type: string;
    capabilities: string[];
    dependencies: string[];
  };
}

interface MediatorRule {
  id: string;
  fromComponent: string | '*';
  toComponent: string | '*';
  eventPattern: string;
  action: (fromId: string, toId: string, message: any) => Promise<void>;
  condition?: (fromId: string, toId: string, message: any) => boolean;
}

/**
 * Advanced Component Mediator with rule-based message routing
 */
export class ComponentMediator implements IComponentMediator {
  private static instance: ComponentMediator;
  private components = new Map<string, ComponentRegistration>();
  private rules: MediatorRule[] = [];
  private messageQueue: Array<{ fromId: string; toId: string; message: any; timestamp: number }> = [];
  private processingQueue = false;

  private constructor() {
    this.setupDefaultRules();
  }

  static getInstance(): ComponentMediator {
    if (!ComponentMediator.instance) {
      ComponentMediator.instance = new ComponentMediator();
    }
    return ComponentMediator.instance;
  }

  /**
   * Register component with the mediator
   */
  register(
    componentId: string, 
    component: IComponentCommunication,
    metadata?: {
      type?: string;
      capabilities?: string[];
      dependencies?: string[];
    }
  ): void {
    const registration: ComponentRegistration = {
      id: componentId,
      component,
      subscriptions: [],
      metadata: {
        type: metadata?.type || 'generic',
        capabilities: metadata?.capabilities || [],
        dependencies: metadata?.dependencies || []
      }
    };

    this.components.set(componentId, registration);

    // Auto-subscribe to relevant events based on component type
    this.setupComponentSubscriptions(registration);

    // Only log in development mode
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MEDIATOR === 'true') {
    }
  }

  /**
   * Unregister component
   */
  unregister(componentId: string): void {
    const registration = this.components.get(componentId);
    if (registration) {
      // Clean up subscriptions
      registration.subscriptions.forEach(unsub => unsub());
      this.components.delete(componentId);
      
      // Only log in development mode
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MEDIATOR === 'true') {
      }
    }
  }

  /**
   * Send message between specific components
   */
  async send(fromId: string, toId: string, message: any): Promise<void> {
    const fromComponent = this.components.get(fromId);
    const toComponent = this.components.get(toId);

    if (!fromComponent) {
      throw new Error(`Component ${fromId} not registered`);
    }

    if (!toComponent) {
      throw new Error(`Component ${toId} not registered`);
    }

    // Add to message queue for processing
    this.messageQueue.push({
      fromId,
      toId,
      message,
      timestamp: Date.now()
    });

    await this.processMessageQueue();
  }

  /**
   * Broadcast message to all components
   */
  async broadcast(fromId: string, message: any): Promise<void> {
    const fromComponent = this.components.get(fromId);
    if (!fromComponent) {
      throw new Error(`Component ${fromId} not registered`);
    }

    // Send to all other components
    const promises: Promise<void>[] = [];
    for (const [componentId] of this.components) {
      if (componentId !== fromId) {
        promises.push(this.send(fromId, componentId, message));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Get registered components
   */
  getComponents(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Get component metadata
   */
  getComponentMetadata(componentId: string): any {
    return this.components.get(componentId)?.metadata;
  }

  /**
   * Add custom mediation rule
   */
  addRule(rule: MediatorRule): void {
    this.rules.push(rule);
    
    // Only log in development mode
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MEDIATOR === 'true') {
    }
  }

  /**
   * Remove mediation rule
   */
  removeRule(ruleId: string): void {
    const index = this.rules.findIndex(rule => rule.id === ruleId);
    if (index > -1) {
      this.rules.splice(index, 1);
      
      // Only log in development mode  
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MEDIATOR === 'true') {
      }
    }
  }

  /**
   * Process message queue with rule application
   */
  private async processMessageQueue(): Promise<void> {
    if (this.processingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const queuedMessage = this.messageQueue.shift()!;
        await this.processMessage(queuedMessage);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process individual message through rules
   */
  private async processMessage(queuedMessage: {
    fromId: string;
    toId: string;
    message: any;
    timestamp: number;
  }): Promise<void> {
    const { fromId, toId, message } = queuedMessage;

    // Find applicable rules
    const applicableRules = this.rules.filter(rule => {
      const fromMatch = rule.fromComponent === '*' || rule.fromComponent === fromId;
      const toMatch = rule.toComponent === '*' || rule.toComponent === toId;
      const conditionMatch = !rule.condition || rule.condition(fromId, toId, message);
      
      return fromMatch && toMatch && conditionMatch;
    });

    // Execute applicable rules
    for (const rule of applicableRules) {
      try {
        await rule.action(fromId, toId, message);
      } catch (error) {
        // Always log errors but only in development show rule details
        if (import.meta.env.DEV) {
        } else {
        }
      }
    }

    // Default message forwarding if no rules handled it
    if (applicableRules.length === 0) {
      await this.defaultMessageForwarding(fromId, toId, message);
    }
  }

  /**
   * Default message forwarding when no rules match
   */
  private async defaultMessageForwarding(fromId: string, toId: string, message: any): Promise<void> {
    const toComponent = this.components.get(toId);
    if (toComponent?.component) {
      // Convert message to event if possible
      if (message.eventName && message.eventData) {
        await toComponent.component.notify(message.eventName, message.eventData);
      }
    }
  }

  /**
   * Setup component subscriptions based on type
   */
  private setupComponentSubscriptions(registration: ComponentRegistration): void {
    const { id: componentId, component, metadata } = registration;

    // Form component subscriptions
    if (metadata.type === 'form' || metadata.capabilities.includes('form')) {
      const formSub = eventBus.on('form:validated', async (data) => {
        if (data.formId === componentId) {
          await component.notify('form:validated', data);
        }
      });
      registration.subscriptions.push(formSub);
    }

    // Modal component subscriptions
    if (metadata.type === 'modal' || metadata.capabilities.includes('modal')) {
      const modalOpenSub = eventBus.on('modal:opened', async (data) => {
        if (data.type === componentId) {
          await component.notify('modal:opened', data);
        }
      });
      
      const modalCloseSub = eventBus.on('modal:closed', async (data) => {
        if (data.type === componentId) {
          await component.notify('modal:closed', data);
        }
      });

      registration.subscriptions.push(modalOpenSub, modalCloseSub);
    }

    // Business component subscriptions
    if (metadata.type === 'business' || metadata.capabilities.includes('business-logic')) {
      const businessSubs = [
        'deal:created',
        'deal:updated',
        'contact:selected',
        'activity:created'
      ].map(eventName => {
        return eventBus.on(eventName as EventName, async (data) => {
          await component.notify(eventName as EventName, data);
        });
      });

      registration.subscriptions.push(...businessSubs);
    }

    // Data component subscriptions
    if (metadata.type === 'data' || metadata.capabilities.includes('data-management')) {
      const dataSub = eventBus.on('ui:refresh', async (data) => {
        if (data.component === componentId || data.component === 'all') {
          await component.notify('ui:refresh', data);
        }
      });
      registration.subscriptions.push(dataSub);
    }
  }

  /**
   * Setup default mediation rules
   */
  private setupDefaultRules(): void {
    // Form-to-Business Logic coordination
    this.addRule({
      id: 'form-business-validation',
      fromComponent: '*',
      toComponent: '*',
      eventPattern: 'form:submit',
      action: async (fromId, toId, message) => {
        if (fromId.includes('form') && toId.includes('business')) {
          // Coordinate form submission with business logic
          await eventBus.emit('business:validation-required', {
            entity: message.entityType || 'unknown',
            data: message.formData
          });
        }
      },
      condition: (fromId, toId, message) => 
        fromId.includes('form') && toId.includes('business') && message.type === 'submit'
    });

    // Modal-to-Modal coordination (prevent conflicts)
    this.addRule({
      id: 'modal-conflict-prevention',
      fromComponent: '*',
      toComponent: '*',
      eventPattern: 'modal:open',
      action: async (fromId, toId, message) => {
        if (fromId !== toId && message.type === 'open' && 
            this.getComponentMetadata(fromId)?.type === 'modal' &&
            this.getComponentMetadata(toId)?.type === 'modal') {
          
          // Close other modal before opening new one
          await eventBus.emit('modal:closed', {
            type: toId,
            result: { reason: 'replaced-by-other-modal' }
          });
        }
      }
    });

    // Service error coordination
    this.addRule({
      id: 'service-error-coordination',
      fromComponent: '*',
      toComponent: '*',
      eventPattern: 'service:error',
      action: async (fromId, toId, message) => {
        // Coordinate error handling across components
        await eventBus.emit('ui:notification', {
          message: message.error || 'Service error occurred',
          type: 'error'
        });

        // Reset related form states on service errors
        if (message.relatedForm) {
          await eventBus.emit('form:reset', {
            formId: message.relatedForm
          });
        }
      }
    });

    // Data refresh coordination
    this.addRule({
      id: 'data-refresh-coordination',
      fromComponent: '*',
      toComponent: '*',
      eventPattern: 'data:changed',
      action: async (fromId, toId, message) => {
        // When data changes, refresh related components
        const affectedComponents = this.findComponentsByDependency(message.entityType);
        
        for (const componentId of affectedComponents) {
          await eventBus.emit('ui:refresh', {
            component: componentId
          });
        }
      }
    });

    // Workflow step coordination
    this.addRule({
      id: 'workflow-step-coordination',
      fromComponent: '*',
      toComponent: '*',
      eventPattern: 'workflow:step',
      action: async (fromId, toId, message) => {
        // Coordinate multi-step workflows
        if (message.workflow && message.step) {
          await eventBus.emit('business:workflow-step', {
            workflow: message.workflow,
            step: message.step,
            data: message.data
          });
        }
      }
    });
  }

  /**
   * Find components that depend on a specific entity type
   */
  private findComponentsByDependency(entityType: string): string[] {
    const dependentComponents: string[] = [];

    for (const [componentId, registration] of this.components) {
      if (registration.metadata.dependencies.includes(entityType)) {
        dependentComponents.push(componentId);
      }
    }

    return dependentComponents;
  }

  /**
   * Get mediation statistics for debugging
   */
  getMediationStats(): {
    componentsRegistered: number;
    rulesActive: number;
    messageQueueLength: number;
    componentTypes: Record<string, number>;
  } {
    const componentTypes: Record<string, number> = {};
    
    for (const [, registration] of this.components) {
      const type = registration.metadata.type;
      componentTypes[type] = (componentTypes[type] || 0) + 1;
    }

    return {
      componentsRegistered: this.components.size,
      rulesActive: this.rules.length,
      messageQueueLength: this.messageQueue.length,
      componentTypes
    };
  }

  /**
   * Debug method to trace message flow
   */
  enableMessageTracing(): () => void {
    let isTracing = true;

    const originalSend = this.send.bind(this);
    this.send = async (fromId: string, toId: string, message: any) => {
      if (isTracing && import.meta.env.DEV) {
      }
      return originalSend(fromId, toId, message);
    };

    const originalBroadcast = this.broadcast.bind(this);
    this.broadcast = async (fromId: string, message: any) => {
      if (isTracing && import.meta.env.DEV) {
      }
      return originalBroadcast(fromId, message);
    };

    return () => {
      isTracing = false;
    };
  }
}

/**
 * Singleton access and convenience functions
 */
export const componentMediator = ComponentMediator.getInstance();

export function registerComponent(
  componentId: string,
  component: IComponentCommunication,
  metadata?: {
    type?: string;
    capabilities?: string[];
    dependencies?: string[];
  }
): () => void {
  componentMediator.register(componentId, component, metadata);
  
  return () => {
    componentMediator.unregister(componentId);
  };
}

export function sendComponentMessage(
  fromId: string,
  toId: string,
  message: any
): Promise<void> {
  return componentMediator.send(fromId, toId, message);
}

export function broadcastMessage(fromId: string, message: any): Promise<void> {
  return componentMediator.broadcast(fromId, message);
}

/**
 * React hook for component registration
 */
export function useComponentMediator(
  componentId: string,
  component: IComponentCommunication,
  metadata?: {
    type?: string;
    capabilities?: string[];
    dependencies?: string[];
  }
) {
  React.useEffect(() => {
    // Only register if component is provided
    if (!component) return;
    
    return registerComponent(componentId, component, metadata);
  }, [componentId]); // Only depend on componentId to prevent re-registration

  return {
    send: (toId: string, message: any) => 
      sendComponentMessage(componentId, toId, message),
    broadcast: (message: any) => 
      broadcastMessage(componentId, message),
    mediator: componentMediator
  };
}

/**
 * Higher-order component for automatic mediator integration
 */
export function withComponentMediator<P extends object>(
  Component: React.ComponentType<P>,
  componentConfig: {
    id: string;
    type?: string;
    capabilities?: string[];
    dependencies?: string[];
  }
) {
  return function MediatedComponent(props: P) {
    const componentRef = React.useRef<IComponentCommunication>({
      async notify(_event, _data) {
        // No-op: Do NOT re-emit events here.
        // The mediator calls notify() when an event fires. Re-emitting
        // the same event causes an infinite loop: emit → mediator → notify → emit → ...
      },
      subscribe(event, handler) {
        return eventBus.on(event, handler);
      }
    });

    useComponentMediator(
      componentConfig.id,
      componentRef.current,
      {
        type: componentConfig.type,
        capabilities: componentConfig.capabilities,
        dependencies: componentConfig.dependencies
      }
    );

    return <Component {...props} />;
  };
}

/**
 * Component mediator utilities for testing and debugging
 */
export const mediatorUtils = {
  getStats: () => componentMediator.getMediationStats(),
  enableTracing: () => componentMediator.enableMessageTracing(),
  getComponents: () => componentMediator.getComponents(),
  getComponentMetadata: (id: string) => componentMediator.getComponentMetadata(id)
};