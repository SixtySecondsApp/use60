import { supabase } from '@/lib/supabase/clientV2';
import { AIProviderService } from './aiProvider';

const OPENROUTER_MODEL = 'google/gemini-3-pro-image-preview';

export interface NanoBananaImageGenerationParams {
  prompt: string;
  aspect_ratio?: 'square' | 'portrait' | 'landscape';
  num_images?: number;
}

export interface NanoBananaImageGenerationResult {
  images?: string[];
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Service for Nano Banana Pro image generation via OpenRouter
 * Uses Google Gemini 3 Pro Image Preview model
 */
class NanoBananaService {
  private async getApiKey(): Promise<string> {
    // Get user once and reuse
    let user: any = null;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      user = authUser;
    } catch (error) {
      console.warn('[NanoBanana] Could not get user:', error);
    }

    if (!user) {
      throw new Error(
        'OpenRouter API key not configured. ' +
        'Please add your OpenRouter API key in Settings > AI Provider Settings.'
      );
    }

    // Try to get from user settings first
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', user.id)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle missing records gracefully

      // Handle case where record doesn't exist (PGRST116) or other errors
      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine, other errors should be logged
        console.warn('[NanoBanana] Error fetching user settings:', error.message);
      } else if (data?.ai_provider_keys?.openrouter) {
        const apiKey = data.ai_provider_keys.openrouter;
        if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
          console.log('[NanoBanana] Using user OpenRouter API key');
          return apiKey.trim();
        }
      }
    } catch (error) {
      console.warn('[NanoBanana] Could not fetch user API key:', error);
    }

    // Fallback to AIProviderService
    try {
      const aiProvider = AIProviderService.getInstance();
      await aiProvider.initialize(user.id);
      const apiKey = (aiProvider as any).apiKeys?.get('openrouter');
      
      if (apiKey) {
        console.log('[NanoBanana] Using AIProviderService OpenRouter API key');
        return apiKey;
      }
    } catch (error) {
      console.warn('[NanoBanana] Could not initialize AIProviderService:', error);
    }

    throw new Error(
      'OpenRouter API key not configured. ' +
      'Please add your OpenRouter API key in Settings > AI Provider Settings.'
    );
  }

  /**
   * Generate images using Nano Banana Pro (Gemini 3 Pro Image Preview)
   */
  async generateImage(params: NanoBananaImageGenerationParams): Promise<NanoBananaImageGenerationResult> {
    const apiKey = await this.getApiKey();
    
    console.log('[NanoBanana] Starting image generation', {
      model: OPENROUTER_MODEL,
      prompt: params.prompt?.substring(0, 50) + '...',
      aspect_ratio: params.aspect_ratio || 'square'
    });

    try {
      // OpenRouter image generation models use chat completions API
      // The model returns images in the response
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Sixty Sales Dashboard - Nano Banana Pro',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: params.prompt
                }
              ]
            }
          ],
          // Image generation specific parameters
          ...(params.aspect_ratio && { aspect_ratio: params.aspect_ratio }),
          ...(params.num_images && { num_images: params.num_images }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error('[NanoBanana] API error', {
          status: response.status,
          error: errorMessage
        });
        throw new Error(`OpenRouter API error: ${errorMessage}`);
      }

      const data = await response.json();
      console.log('[NanoBanana] Response received', {
        hasChoices: !!data.choices,
        choicesCount: data.choices?.length
      });
      console.log('[NanoBanana] Full response structure:', JSON.stringify(data, null, 2).substring(0, 2000));

      // Extract images from response
      // Gemini image models may return images in different formats
      const images: string[] = [];
      const foundSources: string[] = [];
      
      // Helper function to extract URLs from text
      const extractUrls = (text: string): string[] => {
        if (!text || typeof text !== 'string') return [];
        // Match HTTP/HTTPS URLs, including those in markdown format
        const urlPattern = /https?:\/\/[^\s\)\]\>\"\'\,]+/g;
        return text.match(urlPattern) || [];
      };
      
      // Helper function to check if string is a valid image URL or data URL
      const isValidImageUrl = (url: string): boolean => {
        if (!url || typeof url !== 'string') return false;
        return url.startsWith('http://') || 
               url.startsWith('https://') || 
               url.startsWith('data:image/');
      };
      
      // 1. Check choices[0].message.content (most common)
      if (data.choices && data.choices.length > 0) {
        const choice = data.choices[0];
        const content = choice.message?.content;
        
        if (typeof content === 'string') {
          // Direct URL or data URL
          if (isValidImageUrl(content)) {
            images.push(content);
            foundSources.push('content (direct URL)');
          } else {
            // Try to extract URLs from text
            const urls = extractUrls(content);
            if (urls.length > 0) {
              images.push(...urls);
              foundSources.push(`content (extracted ${urls.length} URLs)`);
            } else {
              // Try parsing as JSON
              try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                  const validUrls = parsed.filter((item: any) => 
                    typeof item === 'string' && isValidImageUrl(item)
                  );
                  if (validUrls.length > 0) {
                    images.push(...validUrls);
                    foundSources.push('content (JSON array)');
                  }
                } else if (parsed.images && Array.isArray(parsed.images)) {
                  images.push(...parsed.images.filter(isValidImageUrl));
                  foundSources.push('content (JSON.images)');
                } else if (parsed.url && isValidImageUrl(parsed.url)) {
                  images.push(parsed.url);
                  foundSources.push('content (JSON.url)');
                }
              } catch {
                // Not JSON, check for base64 data
                if (content.includes('data:image/') || content.includes('base64')) {
                  const base64Matches = content.match(/data:image\/[^;]+;base64,[^\s\)]+/g);
                  if (base64Matches) {
                    images.push(...base64Matches);
                    foundSources.push('content (base64)');
                  }
                }
              }
            }
          }
        } else if (Array.isArray(content)) {
          // Content is an array of content blocks
          content.forEach((block: any, index: number) => {
            if (block.type === 'image_url' && block.image_url?.url) {
              images.push(block.image_url.url);
              foundSources.push(`content[${index}].image_url.url`);
            } else if (block.type === 'image' && block.image) {
              // Some formats use 'image' instead of 'image_url'
              const imgUrl = typeof block.image === 'string' ? block.image : block.image.url;
              if (isValidImageUrl(imgUrl)) {
                images.push(imgUrl);
                foundSources.push(`content[${index}].image`);
              }
            } else if (block.type === 'text' && typeof block.text === 'string') {
              const urls = extractUrls(block.text);
              if (urls.length > 0) {
                images.push(...urls);
                foundSources.push(`content[${index}].text (${urls.length} URLs)`);
              }
            }
          });
        } else if (content && typeof content === 'object') {
          // Content is an object, check common properties
          if (content.url && isValidImageUrl(content.url)) {
            images.push(content.url);
            foundSources.push('content.url');
          }
          if (content.image && isValidImageUrl(content.image)) {
            images.push(content.image);
            foundSources.push('content.image');
          }
          if (content.images && Array.isArray(content.images)) {
            images.push(...content.images.filter(isValidImageUrl));
            foundSources.push('content.images');
          }
        }
      }

      // 2. Check top-level response properties
      if (data.data?.images && Array.isArray(data.data.images)) {
        images.push(...data.data.images.filter(isValidImageUrl));
        foundSources.push('data.data.images');
      }
      if (data.images && Array.isArray(data.images)) {
        images.push(...data.images.filter(isValidImageUrl));
        foundSources.push('data.images');
      }
      if (data.image && isValidImageUrl(data.image)) {
        images.push(data.image);
        foundSources.push('data.image');
      }
      if (data.url && isValidImageUrl(data.url)) {
        images.push(data.url);
        foundSources.push('data.url');
      }
      
      // 3. Check response body for any URL patterns (fallback)
      const responseString = JSON.stringify(data);
      const allUrls = extractUrls(responseString);
      const newUrls = allUrls.filter(url => !images.includes(url) && isValidImageUrl(url));
      if (newUrls.length > 0) {
        images.push(...newUrls);
        foundSources.push(`response body (${newUrls.length} URLs)`);
      }
      
      // 4. Check for base64 images in the response
      const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+\/]+=*/g;
      const base64Matches = responseString.match(base64Pattern);
      if (base64Matches) {
        const newBase64 = base64Matches.filter(img => !images.includes(img));
        if (newBase64.length > 0) {
          images.push(...newBase64);
          foundSources.push(`base64 images (${newBase64.length})`);
        }
      }
      
      // 5. Check for common alternative response structures
      // Some APIs return images in nested structures
      if (data.result?.images) {
        const resultImages = Array.isArray(data.result.images) 
          ? data.result.images 
          : [data.result.images];
        images.push(...resultImages.filter(isValidImageUrl));
        foundSources.push('result.images');
      }
      if (data.output?.images) {
        const outputImages = Array.isArray(data.output.images) 
          ? data.output.images 
          : [data.output.images];
        images.push(...outputImages.filter(isValidImageUrl));
        foundSources.push('output.images');
      }
      if (data.response?.images) {
        const responseImages = Array.isArray(data.response.images) 
          ? data.response.images 
          : [data.response.images];
        images.push(...responseImages.filter(isValidImageUrl));
        foundSources.push('response.images');
      }
      
      // Remove duplicates
      const uniqueImages = Array.from(new Set(images));

      if (uniqueImages.length === 0) {
        // Log comprehensive debugging info
        console.error('[NanoBanana] ========== DEBUGGING INFO ==========');
        console.error('[NanoBanana] Full response:', JSON.stringify(data, null, 2));
        console.error('[NanoBanana] Response keys:', Object.keys(data));
        
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          console.error('[NanoBanana] Choice keys:', Object.keys(choice));
          console.error('[NanoBanana] Choice:', JSON.stringify(choice, null, 2));
          
          if (choice.message) {
            console.error('[NanoBanana] Message keys:', Object.keys(choice.message));
            console.error('[NanoBanana] Message:', JSON.stringify(choice.message, null, 2));
            console.error('[NanoBanana] Content type:', typeof choice.message.content);
            console.error('[NanoBanana] Content value:', choice.message.content);
            
            // Try to find any URLs in the content
            if (choice.message.content) {
              const contentStr = typeof choice.message.content === 'string' 
                ? choice.message.content 
                : JSON.stringify(choice.message.content);
              const urlMatches = contentStr.match(/https?:\/\/[^\s\)\]\>\"\'\,]+/g);
              console.error('[NanoBanana] URLs found in content:', urlMatches);
            }
          }
        }
        
        // Check for any other potential image locations
        const allStringValues: string[] = [];
        const extractStrings = (obj: any, path = ''): void => {
          if (typeof obj === 'string') {
            allStringValues.push(`${path}: ${obj.substring(0, 100)}`);
          } else if (Array.isArray(obj)) {
            obj.forEach((item, i) => extractStrings(item, `${path}[${i}]`));
          } else if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => extractStrings(obj[key], path ? `${path}.${key}` : key));
          }
        };
        extractStrings(data);
        console.error('[NanoBanana] All string values in response:', allStringValues.slice(0, 20));
        console.error('[NanoBanana] ====================================');
        
        // Store response in window for inspection
        (window as any).__nanobanana_last_response = data;
        
        throw new Error(
          'No images returned from Nano Banana Pro. Response format may have changed.\n' +
          'Check browser console for full response details.\n' +
          'Response also stored in window.__nanobanana_last_response'
        );
      }

      console.log('[NanoBanana] Image generation completed', {
        imageCount: uniqueImages.length,
        foundSources: foundSources,
        usage: data.usage
      });

      return {
        images: uniqueImages,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      console.error('[NanoBanana] Generation failed', {
        error: error.message
      });
      throw error;
    }
  }
}

export const nanoBananaService = new NanoBananaService();

