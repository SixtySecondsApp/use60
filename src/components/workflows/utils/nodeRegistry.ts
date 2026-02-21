/**
 * Custom Node Registry
 * Allows registration of custom workflow nodes without modifying the main canvas
 */

import type { NodeTypes } from 'reactflow';
import type { Node } from 'reactflow';

export interface CustomNodeDefinition {
  type: string;
  component: React.ComponentType<any>;
  defaultConfig?: (nodeData: any) => any;
  icon?: string;
  category?: 'trigger' | 'condition' | 'action' | 'ai' | 'integration';
  description?: string;
}

class NodeRegistry {
  private nodes: Map<string, CustomNodeDefinition> = new Map();
  private nodeTypes: NodeTypes = {};

  /**
   * Register a custom node type
   */
  register(nodeDef: CustomNodeDefinition): void {
    this.nodes.set(nodeDef.type, nodeDef);
    this.nodeTypes[nodeDef.type] = nodeDef.component;
  }

  /**
   * Unregister a custom node type
   */
  unregister(type: string): void {
    this.nodes.delete(type);
    delete this.nodeTypes[type];
  }

  /**
   * Get all registered node types for ReactFlow
   */
  getNodeTypes(): NodeTypes {
    return { ...this.nodeTypes };
  }

  /**
   * Get node definition by type
   */
  getNodeDefinition(type: string): CustomNodeDefinition | undefined {
    return this.nodes.get(type);
  }

  /**
   * Get all registered node types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get nodes by category
   */
  getNodesByCategory(category: CustomNodeDefinition['category']): CustomNodeDefinition[] {
    return Array.from(this.nodes.values()).filter(
      node => node.category === category
    );
  }

  /**
   * Initialize node data using registered default config
   */
  initializeNodeData(type: string, nodeData: any): any {
    const nodeDef = this.nodes.get(type);
    if (nodeDef?.defaultConfig) {
      return nodeDef.defaultConfig(nodeData);
    }
    return nodeData;
  }

  /**
   * Check if a node type is registered
   */
  isRegistered(type: string): boolean {
    return this.nodes.has(type);
  }
}

import { FindLinkedInNode } from '../nodes/linkedin/FindLinkedInNode';
import { ScrapeLinkedInNode } from '../nodes/linkedin/ScrapeLinkedInNode';
import { OutreachTemplateNode } from '../nodes/linkedin/OutreachTemplateNode';
import AiArkSearchNode from '../nodes/AiArkSearchNode';

// ... existing code ...

// Singleton instance
export const nodeRegistry = new NodeRegistry();

// Register default nodes
nodeRegistry.register({
  type: 'findLinkedIn',
  component: FindLinkedInNode,
  category: 'ai',
  description: 'Find LinkedIn URL using AI search',
  icon: 'Search'
});

nodeRegistry.register({
  type: 'scrapeLinkedIn',
  component: ScrapeLinkedInNode,
  category: 'integration',
  description: 'Scrape rich profile data from LinkedIn',
  icon: 'Database'
});

nodeRegistry.register({
  type: 'outreachTemplate',
  component: OutreachTemplateNode,
  category: 'ai',
  description: 'Generate personalized outreach email',
  icon: 'Mail'
});

nodeRegistry.register({
  type: 'aiArkSearch',
  component: AiArkSearchNode,
  category: 'integration',
  description: 'Search companies, people, or find lookalike accounts via AI Ark',
  icon: 'Search'
});

// Export convenience functions
export const registerNode = (nodeDef: CustomNodeDefinition) => nodeRegistry.register(nodeDef);
export const unregisterNode = (type: string) => nodeRegistry.unregister(type);
export const getNodeTypes = () => nodeRegistry.getNodeTypes();
export const getNodeDefinition = (type: string) => nodeRegistry.getNodeDefinition(type);

