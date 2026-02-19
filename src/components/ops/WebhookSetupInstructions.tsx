import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface WebhookSetupInstructionsProps {
  webhookUrl: string
  apiKey: string
  columns: Array<{ key: string; label: string; column_type: string }>
}

function exampleValue(column_type: string): unknown {
  switch (column_type) {
    case 'number':
      return 42
    case 'boolean':
      return true
    case 'date':
      return '2026-02-19'
    case 'url':
      return 'https://example.com'
    case 'email':
      return 'user@example.com'
    default:
      return 'example value'
  }
}

function buildExamplePayload(
  columns: Array<{ key: string; label: string; column_type: string }>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const col of columns) {
    payload[col.key] = exampleValue(col.column_type)
  }
  return payload
}

function buildExamplePayloadPython(
  columns: Array<{ key: string; label: string; column_type: string }>
): string {
  const entries = columns.map((col) => {
    const val = exampleValue(col.column_type)
    if (typeof val === 'string') return `    "${col.key}": "${val}"`
    if (typeof val === 'boolean') return `    "${col.key}": ${val ? 'True' : 'False'}`
    return `    "${col.key}": ${val}`
  })
  return `{\n${entries.join(',\n')}\n}`
}

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

interface CodeBlockProps {
  code: string
}

function CodeBlock({ code }: CodeBlockProps) {
  return (
    <div className="relative mt-2 rounded-lg bg-gray-900 border border-gray-700">
      <div className="flex items-center justify-between px-3 pt-2 pb-0">
        <span className="text-xs text-gray-500 font-mono select-none">bash</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 pt-1 text-sm font-mono text-gray-200 whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="flex-1">{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function WebhookSetupInstructions({
  webhookUrl,
  apiKey,
  columns,
}: WebhookSetupInstructionsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const examplePayload = buildExamplePayload(columns)
  const examplePayloadJson = JSON.stringify(examplePayload, null, 2)
  const examplePayloadPython = buildExamplePayloadPython(columns)

  const curlCode = `curl -X POST '${webhookUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${apiKey}' \\
  -d '${JSON.stringify(examplePayload)}'`

  const pythonCode = `import requests

response = requests.post(
    '${webhookUrl}',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': '${apiKey}'
    },
    json=${examplePayloadPython}
)
print(response.json())`

  const zapierSteps = [
    'In Zapier, create a new Zap.',
    'Choose your trigger app (e.g. Google Sheets, Typeform, etc.).',
    'Add an Action step — search for "Webhooks by Zapier" and choose POST.',
    `URL: ${webhookUrl}`,
    `Headers: key = x-api-key, value = ${apiKey}`,
    'Data: choose "Send as JSON" and map your payload fields to the table columns.',
    'Test the step to confirm a 200 response, then turn on your Zap.',
  ]

  const makeSteps = [
    'Create a new Scenario in Make.',
    'Add an HTTP → "Make a request" module.',
    `URL: ${webhookUrl}`,
    'Method: POST',
    `Headers: add one header — Name: x-api-key, Value: ${apiKey}`,
    'Body type: Raw, Content-type: application/json.',
    'Request content: enter your JSON payload with the fields you want to send.',
    'Run once to verify a 200 response.',
  ]

  const n8nSteps = [
    'Add an HTTP Request node to your workflow.',
    `Method: POST, URL: ${webhookUrl}`,
    'Authentication: Header Auth — Name: x-api-key, Value: click the key icon and enter your API key.',
    `API key value: ${apiKey}`,
    'Body Content Type: JSON, Specify Body: JSON.',
    'Provide your JSON payload object in the body.',
    'Execute the node to test, then connect your trigger.',
  ]

  const schemaRows = columns.map((col) => ({
    key: col.key,
    label: col.label,
    type: col.column_type,
    example: String(exampleValue(col.column_type)),
  }))

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Setup Instructions
        </span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          <Tabs defaultValue="zapier">
            <TabsList>
              <TabsTrigger value="zapier">Zapier</TabsTrigger>
              <TabsTrigger value="make">Make</TabsTrigger>
              <TabsTrigger value="n8n">n8n</TabsTrigger>
              <TabsTrigger value="curl">cURL / Python</TabsTrigger>
            </TabsList>

            <TabsContent value="zapier" className="pt-3">
              <StepList steps={zapierSteps} />
            </TabsContent>

            <TabsContent value="make" className="pt-3">
              <StepList steps={makeSteps} />
            </TabsContent>

            <TabsContent value="n8n" className="pt-3">
              <StepList steps={n8nSteps} />
            </TabsContent>

            <TabsContent value="curl" className="pt-3 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">cURL</p>
                <CodeBlock code={curlCode} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Python</p>
                <CodeBlock code={pythonCode} />
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expected Payload Format
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                      Field Key
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                      Label
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                      Type
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                      Example
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schemaRows.map((row, i) => (
                    <tr
                      key={row.key}
                      className={
                        i % 2 === 0
                          ? 'bg-white dark:bg-gray-900'
                          : 'bg-gray-50 dark:bg-gray-800/50'
                      }
                    >
                      <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">
                        {row.key}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.label}</td>
                      <td className="px-3 py-2 text-gray-500">{row.type}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{row.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 relative rounded-lg bg-gray-900 border border-gray-700">
              <div className="flex items-center justify-between px-3 pt-2 pb-0">
                <span className="text-xs text-gray-500 font-mono select-none">json</span>
                <CopyButton text={examplePayloadJson} />
              </div>
              <pre className="overflow-x-auto p-3 pt-1 text-sm font-mono text-gray-200">
                {examplePayloadJson}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
