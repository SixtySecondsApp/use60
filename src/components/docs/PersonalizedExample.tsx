import { useMemo } from 'react';

interface PersonalizedExampleProps {
  template: string;
  orgData?: {
    tables?: Array<{ name: string; id: string }>;
    columns?: Array<{ name: string; type: string }>;
    dropdownValues?: string[];
  };
}

export function PersonalizedExample({ template, orgData }: PersonalizedExampleProps) {
  const personalizedContent = useMemo(() => {
    if (!orgData) return template;

    let content = template;

    // Replace {{table_name}} with first table or fallback
    if (content.includes('{{table_name}}')) {
      const tableName = orgData.tables?.[0]?.name || 'Contacts';
      content = content.replace(/\{\{table_name\}\}/g, tableName);
    }

    // Replace {{column_name}} with first column or fallback
    if (content.includes('{{column_name}}')) {
      const columnName = orgData.columns?.[0]?.name || 'company';
      content = content.replace(/\{\{column_name\}\}/g, columnName);
    }

    // Replace {{dropdown_values}} with actual values or fallback
    if (content.includes('{{dropdown_values}}')) {
      const values = orgData.dropdownValues?.join(', ') || 'Option A, Option B, Option C';
      content = content.replace(/\{\{dropdown_values\}\}/g, values);
    }

    return content;
  }, [template, orgData]);

  return <span>{personalizedContent}</span>;
}
