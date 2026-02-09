import React, { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronRight, X, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonSchemaProperty {
  type?: string | string[]
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  enumTitles?: string[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  editor?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  prefill?: unknown
  sectionCaption?: string
  sectionColor?: string
}

interface JsonSchema {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  schemaVersion?: number
}

interface ApifySchemaFormProps {
  schema: JsonSchema | null
  defaultValues?: Record<string, unknown>
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldType(prop: JsonSchemaProperty): string {
  if (Array.isArray(prop.type)) {
    return prop.type.find((t) => t !== 'null') || 'string'
  }
  return prop.type || 'string'
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj }
  const keys = path.split('.')
  let current: Record<string, unknown> = result

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current[key] = { ...(current[key] as Record<string, unknown>) }
    current = current[key] as Record<string, unknown>
  }

  current[keys[keys.length - 1]] = value
  return result
}

// ---------------------------------------------------------------------------
// Field Components
// ---------------------------------------------------------------------------

function StringField({
  name,
  prop,
  value,
  onChange,
  required,
}: {
  name: string
  prop: JsonSchemaProperty
  value: string
  onChange: (val: string) => void
  required: boolean
}) {
  // Enum → Select
  if (prop.enum && prop.enum.length > 0) {
    return (
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${prop.title || name}...`} />
        </SelectTrigger>
        <SelectContent>
          {prop.enum.map((opt, i) => (
            <SelectItem key={String(opt)} value={String(opt)}>
              {prop.enumTitles?.[i] || String(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Textarea hint
  if (prop.editor === 'textarea' || (prop.maxLength && prop.maxLength > 200)) {
    return (
      <Textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={prop.description || `Enter ${prop.title || name}...`}
        rows={4}
      />
    )
  }

  return (
    <Input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={prop.description || `Enter ${prop.title || name}...`}
    />
  )
}

function NumberField({
  name,
  prop,
  value,
  onChange,
}: {
  name: string
  prop: JsonSchemaProperty
  value: number | string
  onChange: (val: number | undefined) => void
}) {
  return (
    <Input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === '' ? undefined : Number(v))
      }}
      min={prop.minimum}
      max={prop.maximum}
      placeholder={prop.description || `Enter ${prop.title || name}...`}
    />
  )
}

function BooleanField({
  value,
  onChange,
}: {
  value: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <Switch
      checked={!!value}
      onCheckedChange={onChange}
    />
  )
}

function ArrayField({
  name,
  prop,
  value,
  onChange,
}: {
  name: string
  prop: JsonSchemaProperty
  value: unknown[]
  onChange: (val: unknown[]) => void
}) {
  const [inputVal, setInputVal] = useState('')
  const items = Array.isArray(value) ? value : []
  const itemType = getFieldType(prop.items || { type: 'string' })

  // Enum array → multi-select with badges
  if (prop.items?.enum) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >
              {String(item)}
              <X className="w-3 h-3" />
            </Badge>
          ))}
        </div>
        <Select
          value=""
          onValueChange={(v) => {
            if (!items.includes(v)) onChange([...items, v])
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Add ${prop.title || name}...`} />
          </SelectTrigger>
          <SelectContent>
            {prop.items.enum
              .filter((opt) => !items.includes(opt))
              .map((opt, i) => (
                <SelectItem key={String(opt)} value={String(opt)}>
                  {prop.items?.enumTitles?.[i] || String(opt)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Tag input for string arrays
  if (itemType === 'string') {
    const addTag = () => {
      const trimmed = inputVal.trim()
      if (trimmed && !items.includes(trimmed)) {
        onChange([...items, trimmed])
        setInputVal('')
      }
    }

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >
              {String(item)}
              <X className="w-3 h-3" />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag() }
            }}
            placeholder={`Add ${prop.title || name}...`}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={!inputVal.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Fallback: JSON editor for complex arrays
  return (
    <Textarea
      value={JSON.stringify(items, null, 2)}
      onChange={(e) => {
        try { onChange(JSON.parse(e.target.value)) } catch { /* ignore parse errors while typing */ }
      }}
      rows={4}
      className="font-mono text-sm"
    />
  )
}

// ---------------------------------------------------------------------------
// Object Section (recursive)
// ---------------------------------------------------------------------------

function ObjectSection({
  name,
  prop,
  path,
  values,
  onChange,
  depth,
}: {
  name: string
  prop: JsonSchemaProperty
  path: string
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const properties = prop.properties || {}
  const required = prop.required || []

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {prop.title || name}
        {prop.description && (
          <span className="text-xs text-gray-400 dark:text-gray-500 font-normal truncate">
            {prop.description}
          </span>
        )}
      </button>
      {expanded && (
        <div className="p-3 space-y-4">
          {Object.entries(properties).map(([key, childProp]) => (
            <SchemaField
              key={key}
              name={key}
              prop={childProp}
              path={path ? `${path}.${key}` : key}
              values={values}
              onChange={onChange}
              required={required.includes(key)}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic SchemaField dispatcher
// ---------------------------------------------------------------------------

function SchemaField({
  name,
  prop,
  path,
  values,
  onChange,
  required,
  depth,
}: {
  name: string
  prop: JsonSchemaProperty
  path: string
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  required: boolean
  depth: number
}) {
  const fieldType = getFieldType(prop)
  const currentValue = getNestedValue(values, path)

  const handleChange = useCallback(
    (val: unknown) => onChange(setNestedValue(values, path, val)),
    [values, path, onChange]
  )

  // Object → recursive section
  if (fieldType === 'object' && prop.properties) {
    return (
      <ObjectSection
        name={name}
        prop={prop}
        path={path}
        values={values}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Array
  if (fieldType === 'array') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">
            {prop.title || name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
        </div>
        {prop.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{prop.description}</p>
        )}
        <ArrayField
          name={name}
          prop={prop}
          value={(currentValue as unknown[]) || []}
          onChange={handleChange}
        />
      </div>
    )
  }

  // Boolean
  if (fieldType === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {prop.title || name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {prop.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{prop.description}</p>
          )}
        </div>
        <BooleanField
          value={currentValue as boolean}
          onChange={handleChange}
        />
      </div>
    )
  }

  // Number / Integer
  if (fieldType === 'integer' || fieldType === 'number') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {prop.title || name}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        {prop.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{prop.description}</p>
        )}
        <NumberField
          name={name}
          prop={prop}
          value={currentValue as number}
          onChange={handleChange}
        />
      </div>
    )
  }

  // String (default)
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {prop.title || name}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {prop.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{prop.description}</p>
      )}
      <StringField
        name={name}
        prop={prop}
        value={currentValue as string}
        onChange={handleChange}
        required={required}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Form Component
// ---------------------------------------------------------------------------

export function ApifySchemaForm({ schema, defaultValues, values, onChange }: ApifySchemaFormProps) {
  if (!schema || !schema.properties) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
        No input schema available. You can still run the actor with default settings.
      </div>
    )
  }

  const required = schema.required || []

  // Initialize values with defaults on first render
  React.useEffect(() => {
    if (Object.keys(values).length === 0) {
      const initial: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(schema.properties || {})) {
        const defaultVal = defaultValues?.[key] ?? prop.default ?? prop.prefill
        if (defaultVal !== undefined) {
          initial[key] = defaultVal
        }
      }
      if (Object.keys(initial).length > 0) {
        onChange(initial)
      }
    }
  }, [schema]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {schema.title && (
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {schema.title}
        </div>
      )}
      {Object.entries(schema.properties).map(([key, prop]) => (
        <SchemaField
          key={key}
          name={key}
          prop={prop}
          path={key}
          values={values}
          onChange={onChange}
          required={required.includes(key)}
          depth={0}
        />
      ))}
    </div>
  )
}
